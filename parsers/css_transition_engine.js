"use strict";
/**
 * CSS Transition and Animation Engine for UMG
 *
 * Provides a timer-driven property interpolation system that animates
 * CSS property changes on UMG widgets. Supports:
 *
 *   - CSS `transition` property with per-property durations and easings
 *   - CSS `animation` property referencing @keyframes definitions
 *   - Standard easing functions: linear, ease, ease-in, ease-out, ease-in-out
 *   - Custom cubic-bezier() easing curves
 *   - Multiple concurrent transitions on the same widget
 *   - Animation iteration counts, directions, and fill modes
 *
 * Architecture:
 *   The engine maintains a global set of active transitions. On each tick
 *   (driven by setTimeout), it advances all active transitions, computes
 *   interpolated values, and applies them to the target widgets via
 *   puerts.merge + SynchronizeWidgetProperties.
 *
 * Memory & Performance:
 *   - Transitions are automatically cleaned up on completion
 *   - The tick loop only runs when there are active transitions
 *   - Numeric interpolation is branch-free for hot paths
 *   - Widget references are weak where possible to prevent leaks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTransitionProperty = parseTransitionProperty;
exports.parseAnimationProperty = parseAnimationProperty;
exports.registerKeyframes = registerKeyframes;
exports.getKeyframes = getKeyframes;
exports.clearAllKeyframes = clearAllKeyframes;
exports.interpolateValue = interpolateValue;
exports.startTransition = startTransition;
exports.startAnimation = startAnimation;
exports.cancelWidgetTransitions = cancelWidgetTransitions;
exports.processStyleTransitions = processStyleTransitions;
const puerts = require("puerts");
const css_color_parser_1 = require("./css_color_parser");
const css_length_parser_1 = require("./css_length_parser");
const batch_sync_1 = require("../perf/batch_sync");
/**
 * Solves a cubic bezier curve at parameter t for a single axis.
 * Used internally by the cubic-bezier easing function.
 */
function cubicBezierSample(p1, p2, t) {
    // B(t) = 3*(1-t)^2*t*p1 + 3*(1-t)*t^2*p2 + t^3
    const invT = 1 - t;
    return 3 * invT * invT * t * p1 + 3 * invT * t * t * p2 + t * t * t;
}
/**
 * Finds the t parameter for a given x value on a cubic bezier curve
 * using Newton-Raphson iteration. Fast convergence for well-behaved curves.
 */
function cubicBezierSolveForX(x1, x2, targetX) {
    let t = targetX; // Initial guess
    for (let i = 0; i < 8; i++) {
        const currentX = cubicBezierSample(x1, x2, t);
        const dx = currentX - targetX;
        if (Math.abs(dx) < 1e-6)
            break;
        // Derivative: B'(t) = 3*(1-t)^2*p1 + 6*(1-t)*t*(p2-p1) + 3*t^2*(1-p2)
        const invT = 1 - t;
        const derivative = 3 * invT * invT * x1 + 6 * invT * t * (x2 - x1) + 3 * t * t * (1 - x2);
        if (Math.abs(derivative) < 1e-6)
            break;
        t -= dx / derivative;
        t = Math.max(0, Math.min(1, t));
    }
    return t;
}
/**
 * Creates a cubic-bezier easing function from four control points.
 * The curve passes through (0,0) and (1,1) with control points at
 * (x1,y1) and (x2,y2).
 */
function createCubicBezier(x1, y1, x2, y2) {
    // Optimize for linear case
    if (x1 === y1 && x2 === y2) {
        return (t) => t;
    }
    return (progress) => {
        if (progress <= 0)
            return 0;
        if (progress >= 1)
            return 1;
        const t = cubicBezierSolveForX(x1, x2, progress);
        return cubicBezierSample(y1, y2, t);
    };
}
/** Built-in easing function presets matching CSS specification */
const EASING_PRESETS = {
    'linear': (t) => t,
    'ease': createCubicBezier(0.25, 0.1, 0.25, 1.0),
    'ease-in': createCubicBezier(0.42, 0, 1.0, 1.0),
    'ease-out': createCubicBezier(0, 0, 0.58, 1.0),
    'ease-in-out': createCubicBezier(0.42, 0, 0.58, 1.0),
};
/**
 * Resolves an easing function from a CSS timing-function string.
 * Supports named presets and cubic-bezier() syntax.
 */
function resolveEasing(easing) {
    if (!easing)
        return EASING_PRESETS['ease'];
    const normalized = easing.trim().toLowerCase();
    if (EASING_PRESETS[normalized]) {
        return EASING_PRESETS[normalized];
    }
    // Parse cubic-bezier(x1, y1, x2, y2)
    const bezierMatch = normalized.match(/cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (bezierMatch) {
        const x1 = parseFloat(bezierMatch[1]);
        const y1 = parseFloat(bezierMatch[2]);
        const x2 = parseFloat(bezierMatch[3]);
        const y2 = parseFloat(bezierMatch[4]);
        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            return createCubicBezier(x1, y1, x2, y2);
        }
    }
    // Fallback to ease
    return EASING_PRESETS['ease'];
}
/**
 * Parses a CSS `transition` shorthand value into an array of individual
 * transition declarations. Handles comma-separated multi-property syntax.
 *
 * Syntax: property duration [timing-function] [delay]
 * Example: "opacity 0.3s ease-in-out, transform 0.5s"
 */
function parseTransitionProperty(transition) {
    if (!transition || typeof transition !== 'string') {
        return [];
    }
    const normalized = transition.trim().toLowerCase();
    if (normalized === 'none') {
        return [];
    }
    // Split on commas (respecting parenthesized expressions like cubic-bezier)
    const segments = splitOnTopLevelCommas(normalized);
    const results = [];
    for (const segment of segments) {
        const parsed = parseSingleTransition(segment.trim());
        if (parsed) {
            results.push(parsed);
        }
    }
    return results;
}
/**
 * Parses duration/delay strings (e.g. "0.3s", "300ms") to milliseconds.
 */
function parseTimeDuration(value) {
    if (!value)
        return 0;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.endsWith('ms')) {
        return parseFloat(trimmed);
    }
    if (trimmed.endsWith('s')) {
        return parseFloat(trimmed) * 1000;
    }
    // Bare number treated as seconds per CSS spec
    const num = parseFloat(trimmed);
    return isNaN(num) ? 0 : num * 1000;
}
/**
 * Parses a single transition segment like "opacity 0.3s ease-in-out 0.1s"
 */
function parseSingleTransition(segment) {
    if (!segment)
        return null;
    const tokens = tokenizeTransitionSegment(segment);
    if (tokens.length === 0)
        return null;
    let property = 'all';
    let duration = 0;
    let easing = EASING_PRESETS['ease'];
    let delay = 0;
    let durationCount = 0;
    for (const token of tokens) {
        // Check for timing function keywords or cubic-bezier
        if (EASING_PRESETS[token] || token.startsWith('cubic-bezier')) {
            easing = resolveEasing(token);
            continue;
        }
        // Check for time values (contain 's' or 'ms')
        if (/^\d/.test(token) && (token.includes('s') || token.includes('ms'))) {
            if (durationCount === 0) {
                duration = parseTimeDuration(token);
            }
            else {
                delay = parseTimeDuration(token);
            }
            durationCount++;
            continue;
        }
        // Bare number could be a duration in seconds
        if (/^[\d.]+$/.test(token)) {
            if (durationCount === 0) {
                duration = parseFloat(token) * 1000;
            }
            else {
                delay = parseFloat(token) * 1000;
            }
            durationCount++;
            continue;
        }
        // Everything else is treated as the property name
        property = token;
    }
    return { property, duration, easing, delay };
}
/**
 * Tokenizes a transition segment, keeping cubic-bezier() as one token.
 */
function tokenizeTransitionSegment(segment) {
    const tokens = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < segment.length; i++) {
        const ch = segment[i];
        if (ch === '(') {
            depth++;
            current += ch;
        }
        else if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
        }
        else if (ch === ' ' && depth === 0) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
        }
        else {
            current += ch;
        }
    }
    if (current.length > 0)
        tokens.push(current);
    return tokens;
}
/**
 * Splits a string on top-level commas, ignoring commas inside parentheses.
 */
function splitOnTopLevelCommas(value) {
    const parts = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '(')
            depth++;
        else if (ch === ')')
            depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
            if (current.trim())
                parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim())
        parts.push(current.trim());
    return parts;
}
/**
 * Parses a CSS `animation` shorthand value.
 * Syntax: name duration [timing-function] [delay] [iteration-count] [direction] [fill-mode]
 * Example: "fadeIn 0.5s ease-in-out 0.1s infinite alternate forwards"
 */
function parseAnimationProperty(animation) {
    if (!animation || typeof animation !== 'string') {
        return [];
    }
    const normalized = animation.trim();
    if (normalized.toLowerCase() === 'none') {
        return [];
    }
    const segments = splitOnTopLevelCommas(normalized);
    const results = [];
    for (const segment of segments) {
        const parsed = parseSingleAnimation(segment.trim());
        if (parsed) {
            results.push(parsed);
        }
    }
    return results;
}
const DIRECTION_KEYWORDS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const FILL_MODE_KEYWORDS = new Set(['none', 'forwards', 'backwards', 'both']);
const ITERATION_KEYWORDS = new Set(['infinite']);
/**
 * Parses a single animation segment.
 */
function parseSingleAnimation(segment) {
    if (!segment)
        return null;
    const tokens = tokenizeTransitionSegment(segment);
    if (tokens.length === 0)
        return null;
    const result = {
        name: '',
        duration: 0,
        easing: EASING_PRESETS['ease'],
        delay: 0,
        iterationCount: 1,
        direction: 'normal',
        fillMode: 'none'
    };
    let durationCount = 0;
    for (const token of tokens) {
        const lower = token.toLowerCase();
        // Check timing functions
        if (EASING_PRESETS[lower] || lower.startsWith('cubic-bezier')) {
            result.easing = resolveEasing(lower);
            continue;
        }
        // Check iteration count
        if (ITERATION_KEYWORDS.has(lower)) {
            result.iterationCount = Infinity;
            continue;
        }
        // Check direction keywords
        if (DIRECTION_KEYWORDS.has(lower)) {
            result.direction = lower;
            continue;
        }
        // Check fill mode keywords
        if (FILL_MODE_KEYWORDS.has(lower)) {
            result.fillMode = lower;
            continue;
        }
        // Check time values
        if (/^\d/.test(token) && (lower.includes('s') || lower.includes('ms'))) {
            if (durationCount === 0) {
                result.duration = parseTimeDuration(token);
            }
            else {
                result.delay = parseTimeDuration(token);
            }
            durationCount++;
            continue;
        }
        // Check for numeric iteration count
        if (/^[\d.]+$/.test(token) && durationCount >= 1) {
            const num = parseFloat(token);
            if (!isNaN(num)) {
                result.iterationCount = num;
                continue;
            }
        }
        // Bare number as duration
        if (/^[\d.]+$/.test(token) && durationCount === 0) {
            result.duration = parseFloat(token) * 1000;
            durationCount++;
            continue;
        }
        // Everything else is the animation name
        if (!result.name) {
            result.name = token;
        }
    }
    return result.name ? result : null;
}
/* ─────────────────────────────────────────────────────────
 * Keyframes Registry
 * ───────────────────────────────────────────────────────── */
/** Global registry of @keyframes definitions, populated by the style tag parser */
const keyframesRegistry = new Map();
/**
 * Registers a @keyframes definition for use by animations.
 */
function registerKeyframes(name, definition) {
    keyframesRegistry.set(name, definition);
}
/**
 * Retrieves a @keyframes definition by name.
 */
function getKeyframes(name) {
    return keyframesRegistry.get(name);
}
/**
 * Clears all registered keyframes.
 */
function clearAllKeyframes() {
    keyframesRegistry.clear();
}
/* ─────────────────────────────────────────────────────────
 * Value Interpolation
 * ───────────────────────────────────────────────────────── */
/**
 * Interpolates between two CSS values based on the progress (0..1).
 * Handles numeric values, color values, and length values.
 *
 * @param from     - Starting value
 * @param to       - Target value
 * @param progress - Interpolation progress (0 = from, 1 = to)
 * @param style    - Style context for unit resolution
 * @returns Interpolated value
 */
function interpolateValue(from, to, progress, style) {
    // Direct numeric interpolation (most common case)
    if (typeof from === 'number' && typeof to === 'number') {
        return from + (to - from) * progress;
    }
    // String values that are numeric (e.g. "0.5", "100")
    const fromNum = typeof from === 'string' ? parseFloat(from) : NaN;
    const toNum = typeof to === 'string' ? parseFloat(to) : NaN;
    if (!isNaN(fromNum) && !isNaN(toNum)) {
        return fromNum + (toNum - fromNum) * progress;
    }
    // Color interpolation: detect color strings and interpolate in linear color space
    if (typeof from === 'string' && typeof to === 'string') {
        const fromColor = tryParseColor(from);
        const toColor = tryParseColor(to);
        if (fromColor && toColor) {
            const r = fromColor.r + (toColor.r - fromColor.r) * progress;
            const g = fromColor.g + (toColor.g - fromColor.g) * progress;
            const b = fromColor.b + (toColor.b - fromColor.b) * progress;
            const a = fromColor.a + (toColor.a - fromColor.a) * progress;
            // Return as rgba string for re-parsing by the color parser
            const toInt = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
            return `rgba(${toInt(r)}, ${toInt(g)}, ${toInt(b)}, ${a.toFixed(3)})`;
        }
        // Length interpolation: try parsing as length values
        const fromLength = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(from, style);
        const toLength = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(to, style);
        if (fromLength !== 0 || toLength !== 0) {
            return fromLength + (toLength - fromLength) * progress;
        }
    }
    // Non-interpolable: snap to target at 50%
    return progress >= 0.5 ? to : from;
}
/**
 * Attempts to parse a string as a color. Returns null if it's not a valid color.
 */
function tryParseColor(value) {
    if (!value)
        return null;
    const trimmed = value.trim().toLowerCase();
    // Quick heuristic: must look like a color
    if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
        try {
            return (0, css_color_parser_1.parseToLinearColor)(trimmed);
        }
        catch (_e) {
            return null;
        }
    }
    return null;
}
/**
 * Map of CSS property names to their UMG widget property equivalents.
 * Only properties that can be meaningfully interpolated are listed.
 */
const CSS_TO_UMG_PROPERTY_MAP = {
    'opacity': 'RenderOpacity',
    'transform': 'RenderTransform',
    'visibility': 'Visibility',
};
/** All currently active transitions, keyed by widget+property for dedup */
const activeTransitions = new Map();
/** All currently active animations */
const activeAnimations = new Map();
/** Whether the tick loop is currently running */
let tickRunning = false;
/** Tick interval in milliseconds (targeting ~60fps) */
const TICK_INTERVAL = 16;
/**
 * WeakMap-based widget ID assignment. Gives each widget a unique numeric ID
 * on first encounter without leaking memory (WeakMap lets GC collect widgets).
 */
const widgetIdMap = new WeakMap();
let nextWidgetId = 1;
function getWidgetId(widget) {
    let id = widgetIdMap.get(widget);
    if (id === undefined) {
        id = nextWidgetId++;
        widgetIdMap.set(widget, id);
    }
    return id;
}
/**
 * Generates a unique key for a transition instance, combining a stable
 * per-widget numeric ID with the property name.
 */
function makeTransitionKey(widget, property) {
    return `${getWidgetId(widget)}::${property}`;
}
/**
 * Starts a property transition on a widget.
 * If a transition is already running for the same widget+property,
 * the existing one is replaced with the new target.
 */
function startTransition(widget, cssProperty, fromValue, toValue, transitionDef, style) {
    if (!widget || fromValue === toValue) {
        return;
    }
    const umgProperty = CSS_TO_UMG_PROPERTY_MAP[cssProperty] || cssProperty;
    const key = makeTransitionKey(widget, cssProperty);
    const now = Date.now();
    const transition = {
        widget,
        umgProperty,
        cssProperty,
        fromValue,
        toValue,
        easing: transitionDef.easing,
        startTime: now + transitionDef.delay,
        duration: transitionDef.duration,
        delay: transitionDef.delay,
        style
    };
    activeTransitions.set(key, transition);
    ensureTickRunning();
}
/**
 * Starts a @keyframes animation on a widget.
 */
function startAnimation(widget, animation, style) {
    if (!widget || !animation.name) {
        return;
    }
    const definition = getKeyframes(animation.name);
    if (!definition || definition.steps.length === 0) {
        return;
    }
    const key = makeTransitionKey(widget, `animation:${animation.name}`);
    const now = Date.now();
    const activeAnim = {
        widget,
        definition,
        parsedAnimation: animation,
        startTime: now + animation.delay,
        currentIteration: 0,
        style
    };
    activeAnimations.set(key, activeAnim);
    ensureTickRunning();
}
/**
 * Cancels all transitions and animations on a specific widget.
 */
function cancelWidgetTransitions(widget) {
    if (!widget)
        return;
    for (const [key, transition] of activeTransitions) {
        if (transition.widget === widget) {
            activeTransitions.delete(key);
        }
    }
    for (const [key, animation] of activeAnimations) {
        if (animation.widget === widget) {
            activeAnimations.delete(key);
        }
    }
}
/**
 * Ensures the tick loop is running. Only starts it if there are
 * active transitions or animations to process.
 */
function ensureTickRunning() {
    if (tickRunning)
        return;
    if (activeTransitions.size === 0 && activeAnimations.size === 0)
        return;
    tickRunning = true;
    scheduleTick();
}
/**
 * Schedules the next tick of the animation loop.
 */
function scheduleTick() {
    setTimeout(tick, TICK_INTERVAL);
}
/**
 * Main tick function. Advances all active transitions and animations,
 * applying interpolated values to widgets.
 */
function tick() {
    const now = Date.now();
    const completedTransitions = [];
    const completedAnimations = [];
    // Process transitions
    for (const [key, transition] of activeTransitions) {
        // Check if we're still in the delay period
        if (now < transition.startTime) {
            continue;
        }
        const elapsed = now - transition.startTime;
        const rawProgress = transition.duration > 0
            ? Math.min(1, elapsed / transition.duration)
            : 1;
        // Apply easing
        const easedProgress = transition.easing(rawProgress);
        // Interpolate the value
        const currentValue = interpolateValue(transition.fromValue, transition.toValue, easedProgress, transition.style);
        // Apply to widget
        applyTransitionValue(transition.widget, transition.umgProperty, currentValue);
        // Check if complete
        if (rawProgress >= 1) {
            completedTransitions.push(key);
        }
    }
    // Process animations
    for (const [key, anim] of activeAnimations) {
        if (now < anim.startTime) {
            continue;
        }
        const elapsed = now - anim.startTime;
        const totalDuration = anim.parsedAnimation.duration;
        if (totalDuration <= 0) {
            completedAnimations.push(key);
            continue;
        }
        // Calculate which iteration we're on
        const rawIteration = elapsed / totalDuration;
        const currentIteration = Math.floor(rawIteration);
        let localProgress = rawIteration - currentIteration;
        // Check if animation is complete
        if (currentIteration >= anim.parsedAnimation.iterationCount) {
            // Apply final state based on fill mode
            if (anim.parsedAnimation.fillMode === 'forwards' || anim.parsedAnimation.fillMode === 'both') {
                applyKeyframeAtProgress(anim, 1);
            }
            completedAnimations.push(key);
            continue;
        }
        // Handle direction
        const direction = anim.parsedAnimation.direction;
        if (direction === 'reverse') {
            localProgress = 1 - localProgress;
        }
        else if (direction === 'alternate') {
            if (currentIteration % 2 === 1) {
                localProgress = 1 - localProgress;
            }
        }
        else if (direction === 'alternate-reverse') {
            if (currentIteration % 2 === 0) {
                localProgress = 1 - localProgress;
            }
        }
        // Apply easing
        const easedProgress = anim.parsedAnimation.easing(localProgress);
        // Apply keyframe values at this progress
        applyKeyframeAtProgress(anim, easedProgress);
    }
    // Clean up completed items
    for (const key of completedTransitions) {
        activeTransitions.delete(key);
    }
    for (const key of completedAnimations) {
        activeAnimations.delete(key);
    }
    // Continue ticking if there's still work to do
    if (activeTransitions.size > 0 || activeAnimations.size > 0) {
        scheduleTick();
    }
    else {
        tickRunning = false;
    }
}
/**
 * Applies a single interpolated value to a widget property.
 */
function applyTransitionValue(widget, propertyName, value) {
    if (!widget)
        return;
    try {
        const props = {};
        props[propertyName] = value;
        puerts.merge(widget, props);
        (0, batch_sync_1.immediateWidgetSync)(widget);
    }
    catch (e) {
        // Silently handle property application failures
    }
}
/**
 * Applies interpolated keyframe values at a specific animation progress.
 * Finds the two surrounding keyframe stops and interpolates between them.
 */
function applyKeyframeAtProgress(anim, progress) {
    const steps = anim.definition.steps;
    if (steps.length === 0)
        return;
    // Find the two keyframe stops surrounding the current progress
    let fromStep = steps[0];
    let toStep = steps[steps.length - 1];
    for (let i = 0; i < steps.length - 1; i++) {
        if (progress >= steps[i].offset && progress <= steps[i + 1].offset) {
            fromStep = steps[i];
            toStep = steps[i + 1];
            break;
        }
    }
    // Calculate local progress between the two stops
    const range = toStep.offset - fromStep.offset;
    const localProgress = range > 0
        ? (progress - fromStep.offset) / range
        : 1;
    // Interpolate each property defined in the keyframe stops
    const interpolated = {};
    const allKeys = new Set([
        ...Object.keys(fromStep.styles),
        ...Object.keys(toStep.styles)
    ]);
    for (const key of allKeys) {
        const fromVal = fromStep.styles[key];
        const toVal = toStep.styles[key];
        if (fromVal !== undefined && toVal !== undefined) {
            const umgKey = CSS_TO_UMG_PROPERTY_MAP[key] || key;
            interpolated[umgKey] = interpolateValue(fromVal, toVal, localProgress, anim.style);
        }
        else if (toVal !== undefined) {
            const umgKey = CSS_TO_UMG_PROPERTY_MAP[key] || key;
            interpolated[umgKey] = toVal;
        }
    }
    // Apply all interpolated properties in one batch
    if (Object.keys(interpolated).length > 0) {
        try {
            puerts.merge(anim.widget, interpolated);
            (0, batch_sync_1.immediateWidgetSync)(anim.widget);
        }
        catch (_e) {
            // Silent failure for property application
        }
    }
}
/* ─────────────────────────────────────────────────────────
 * Public Integration API
 * ───────────────────────────────────────────────────────── */
/**
 * Checks a style object for CSS transition/animation properties and
 * initiates any necessary transitions or animations on the widget.
 *
 * Called by the converter system when properties change on a widget.
 *
 * @param widget    - The UMG widget to animate
 * @param oldStyles - Previous style state (for computing start values)
 * @param newStyles - New style state (for computing target values)
 */
function processStyleTransitions(widget, oldStyles, newStyles) {
    if (!widget || !newStyles)
        return;
    // Handle CSS transition property
    const transitionValue = newStyles.transition;
    if (transitionValue) {
        const transitions = parseTransitionProperty(String(transitionValue));
        for (const transition of transitions) {
            const property = transition.property;
            if (property === 'all') {
                // Transition all changed properties
                for (const key of Object.keys(newStyles)) {
                    if (key === 'transition' || key === 'animation')
                        continue;
                    const oldVal = oldStyles ? oldStyles[key] : undefined;
                    const newVal = newStyles[key];
                    if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
                        startTransition(widget, key, oldVal, newVal, transition, newStyles);
                    }
                }
            }
            else {
                // Transition specific property
                const oldVal = oldStyles ? oldStyles[property] : undefined;
                const newVal = newStyles[property];
                if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
                    startTransition(widget, property, oldVal, newVal, transition, newStyles);
                }
            }
        }
    }
    // Handle CSS animation property
    const animationValue = newStyles.animation || newStyles.animationName;
    if (animationValue) {
        const animations = parseAnimationProperty(String(animationValue));
        for (const animation of animations) {
            startAnimation(widget, animation, newStyles);
        }
    }
}
//# sourceMappingURL=css_transition_engine.js.map