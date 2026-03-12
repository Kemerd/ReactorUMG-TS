"use strict";
/**
 * CSS Gradient Parser
 *
 * Parses CSS gradient functions (linear-gradient, radial-gradient, conic-gradient)
 * into structured data that can be passed to C++ UUMGManager gradient texture
 * generators. Supports full CSS gradient syntax including direction keywords,
 * angle values, color stops with positions, and named colors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGradientValue = isGradientValue;
exports.parseLinearGradient = parseLinearGradient;
exports.parseRadialGradient = parseRadialGradient;
exports.parseConicGradient = parseConicGradient;
exports.parseGradient = parseGradient;
exports.createGradientBrush = createGradientBrush;
const css_color_parser_1 = require("./css_color_parser");
const UE = require("ue");
// ---------------------------------------------------------------
//  Detection: does a CSS value contain a gradient function?
// ---------------------------------------------------------------
/**
 * Returns true if the given CSS value string contains a gradient function.
 * Use this to decide whether to route through the gradient pipeline
 * vs the normal url() / solid-color background pipeline.
 */
function isGradientValue(value) {
    if (!value || typeof value !== 'string') {
        return false;
    }
    const lower = value.toLowerCase().trim();
    return lower.startsWith('linear-gradient(') ||
        lower.startsWith('radial-gradient(') ||
        lower.startsWith('conic-gradient(') ||
        lower.startsWith('repeating-linear-gradient(') ||
        lower.startsWith('repeating-radial-gradient(') ||
        lower.startsWith('repeating-conic-gradient(');
}
// ---------------------------------------------------------------
//  Tokenizer: split gradient arguments respecting nested parens
// ---------------------------------------------------------------
/**
 * Splits the arguments of a CSS function call by commas, respecting
 * nested parentheses (e.g. rgb(), rgba(), hsl()). Returns trimmed tokens.
 */
function splitGradientArgs(argsStr) {
    const result = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < argsStr.length; i++) {
        const ch = argsStr[i];
        if (ch === '(') {
            depth++;
            current += ch;
        }
        else if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
        }
        else if (ch === ',' && depth === 0) {
            result.push(current.trim());
            current = '';
        }
        else {
            current += ch;
        }
    }
    if (current.trim().length > 0) {
        result.push(current.trim());
    }
    return result;
}
/**
 * Extracts the content between the outermost parentheses of a gradient
 * function call. e.g. "linear-gradient(to right, red, blue)" -> "to right, red, blue"
 */
function extractFunctionArgs(value) {
    const firstParen = value.indexOf('(');
    const lastParen = value.lastIndexOf(')');
    if (firstParen === -1 || lastParen === -1 || lastParen <= firstParen) {
        return '';
    }
    return value.slice(firstParen + 1, lastParen).trim();
}
// ---------------------------------------------------------------
//  Direction parsing for linear gradients
// ---------------------------------------------------------------
/** CSS keyword directions -> angle in degrees (CSS convention: 0deg = to top) */
const DIRECTION_KEYWORD_MAP = {
    'to top': 0,
    'to top right': 45,
    'to right top': 45,
    'to right': 90,
    'to bottom right': 135,
    'to right bottom': 135,
    'to bottom': 180,
    'to bottom left': 225,
    'to left bottom': 225,
    'to left': 270,
    'to top left': 315,
    'to left top': 315,
};
/**
 * Attempts to parse the first argument of a linear-gradient as a direction.
 * Returns the angle in degrees if it's a direction, or null if it's a color stop.
 */
function parseLinearDirection(token) {
    const lower = token.toLowerCase().trim();
    // Check keyword directions (e.g. "to right", "to bottom left")
    if (DIRECTION_KEYWORD_MAP[lower] !== undefined) {
        return DIRECTION_KEYWORD_MAP[lower];
    }
    // Check angle values (e.g. "45deg", "0.5turn", "100grad", "1.57rad")
    const angleMatch = lower.match(/^(-?[\d.]+)(deg|grad|rad|turn)$/);
    if (angleMatch) {
        const value = parseFloat(angleMatch[1]);
        const unit = angleMatch[2];
        switch (unit) {
            case 'deg': return value;
            case 'grad': return value * (360 / 400);
            case 'rad': return value * (180 / Math.PI);
            case 'turn': return value * 360;
        }
    }
    // Not a direction -- must be a color stop
    return null;
}
// ---------------------------------------------------------------
//  Color stop parsing
// ---------------------------------------------------------------
/**
 * Parses a single color stop token like "red", "#ff0000 50%", "rgba(0,0,0,0.5) 25%".
 * Returns the color and an optional position (0..1), or null for position if omitted.
 */
function parseColorStop(token) {
    const trimmed = token.trim();
    if (!trimmed)
        return null;
    // Try to separate the position from the color value.
    // Positions can be: percentages ("50%"), lengths ("100px"), or absent.
    // We need to handle colors like "rgba(255, 0, 0, 0.5) 30%" where the
    // color itself contains spaces and parentheses.
    let colorPart = trimmed;
    let positionPart = null;
    // Find the last token that looks like a position (percentage or length).
    // Walk backwards from the end, skipping any trailing whitespace.
    const posMatch = trimmed.match(/\s+([\d.]+%|[\d.]+(px|em|rem|vw|vh))$/);
    if (posMatch) {
        positionPart = posMatch[1];
        colorPart = trimmed.slice(0, trimmed.length - posMatch[0].length).trim();
    }
    // Parse the color
    let color;
    try {
        color = (0, css_color_parser_1.parseToLinearColor)(colorPart);
    }
    catch {
        return null;
    }
    if (!color || (color.r === 0 && color.g === 0 && color.b === 0 && color.a === 0 && !isBlackish(colorPart))) {
        // parseToLinearColor returned all zeros for an unrecognized color.
        // Try the whole token as a color (position might be wrong)
        try {
            color = (0, css_color_parser_1.parseToLinearColor)(trimmed);
            positionPart = null;
        }
        catch {
            return null;
        }
    }
    // Parse the position
    let position = null;
    if (positionPart) {
        if (positionPart.endsWith('%')) {
            position = parseFloat(positionPart) / 100;
        }
        else {
            // For absolute lengths, we normalize to 0..1 range later
            position = parseFloat(positionPart);
        }
    }
    return { color, position };
}
/** Quick check for colors that legitimately parse to all-zero RGBA values */
function isBlackish(colorStr) {
    const lower = colorStr.toLowerCase().trim();
    return lower === 'black' || lower === '#000' || lower === '#000000' ||
        lower === 'transparent' || lower === 'rgba(0,0,0,0)' ||
        lower === 'rgb(0,0,0)' || lower === 'rgba(0,0,0,1)' ||
        lower.startsWith('rgba(0') || lower.startsWith('rgb(0');
}
/**
 * Normalizes color stop positions: fills in any null positions by
 * distributing evenly between the surrounding known positions,
 * following the CSS gradient algorithm.
 */
function normalizeStopPositions(stops) {
    if (stops.length === 0)
        return [];
    // First stop defaults to 0, last stop defaults to 1
    if (stops[0].position === null)
        stops[0].position = 0;
    if (stops[stops.length - 1].position === null)
        stops[stops.length - 1].position = 1;
    // Fill in missing positions by linear interpolation
    let lastKnownIdx = 0;
    for (let i = 1; i < stops.length; i++) {
        if (stops[i].position !== null) {
            // Fill gaps between lastKnownIdx and i
            if (i - lastKnownIdx > 1) {
                const startPos = stops[lastKnownIdx].position;
                const endPos = stops[i].position;
                const span = i - lastKnownIdx;
                for (let j = lastKnownIdx + 1; j < i; j++) {
                    stops[j].position = startPos + (endPos - startPos) * ((j - lastKnownIdx) / span);
                }
            }
            lastKnownIdx = i;
        }
    }
    // Enforce monotonically increasing positions
    return stops.map((s, idx) => ({
        color: s.color,
        position: Math.max(s.position ?? 0, idx > 0 ? (stops[idx - 1].position ?? 0) : 0)
    }));
}
// ---------------------------------------------------------------
//  Main parsing entry points
// ---------------------------------------------------------------
/**
 * Parses a CSS linear-gradient() value into structured gradient data.
 * Supports: angles, direction keywords, and color stops with optional positions.
 *
 * @example parseLinearGradient("linear-gradient(135deg, #667eea 0%, #764ba2 100%)")
 */
function parseLinearGradient(value) {
    const args = extractFunctionArgs(value);
    if (!args)
        return null;
    const tokens = splitGradientArgs(args);
    if (tokens.length < 2)
        return null;
    let angleDegrees = 180; // CSS default: "to bottom"
    let colorStopStartIndex = 0;
    // Check if the first token is a direction/angle
    const dirAngle = parseLinearDirection(tokens[0]);
    if (dirAngle !== null) {
        angleDegrees = dirAngle;
        colorStopStartIndex = 1;
    }
    // Parse all color stops
    const rawStops = [];
    for (let i = colorStopStartIndex; i < tokens.length; i++) {
        const stop = parseColorStop(tokens[i]);
        if (stop) {
            rawStops.push(stop);
        }
    }
    if (rawStops.length < 2)
        return null;
    return {
        type: 'linear',
        angleDegrees,
        stops: normalizeStopPositions(rawStops)
    };
}
/**
 * Parses a CSS radial-gradient() value into structured gradient data.
 * Simplified: ignores shape/size/position for now, only extracts color stops.
 */
function parseRadialGradient(value) {
    const args = extractFunctionArgs(value);
    if (!args)
        return null;
    const tokens = splitGradientArgs(args);
    if (tokens.length < 2)
        return null;
    let colorStopStartIndex = 0;
    // Check if the first token contains shape/position keywords (e.g. "circle at center")
    const firstLower = tokens[0].toLowerCase().trim();
    if (firstLower.startsWith('circle') || firstLower.startsWith('ellipse') ||
        firstLower.startsWith('closest') || firstLower.startsWith('farthest') ||
        firstLower.includes(' at ')) {
        colorStopStartIndex = 1;
    }
    const rawStops = [];
    for (let i = colorStopStartIndex; i < tokens.length; i++) {
        const stop = parseColorStop(tokens[i]);
        if (stop) {
            rawStops.push(stop);
        }
    }
    if (rawStops.length < 2)
        return null;
    return {
        type: 'radial',
        stops: normalizeStopPositions(rawStops)
    };
}
/**
 * Parses a CSS conic-gradient() value. Mapped to a linear gradient as a
 * fallback since UMG has no native conic support.
 */
function parseConicGradient(value) {
    const args = extractFunctionArgs(value);
    if (!args)
        return null;
    const tokens = splitGradientArgs(args);
    if (tokens.length < 2)
        return null;
    let angleDegrees = 0;
    let colorStopStartIndex = 0;
    // Check for "from Xdeg" prefix
    const firstLower = tokens[0].toLowerCase().trim();
    const fromMatch = firstLower.match(/^from\s+(-?[\d.]+)(deg|grad|rad|turn)/);
    if (fromMatch) {
        const val = parseFloat(fromMatch[1]);
        switch (fromMatch[2]) {
            case 'deg':
                angleDegrees = val;
                break;
            case 'grad':
                angleDegrees = val * (360 / 400);
                break;
            case 'rad':
                angleDegrees = val * (180 / Math.PI);
                break;
            case 'turn':
                angleDegrees = val * 360;
                break;
        }
        colorStopStartIndex = 1;
    }
    const rawStops = [];
    for (let i = colorStopStartIndex; i < tokens.length; i++) {
        const stop = parseColorStop(tokens[i]);
        if (stop) {
            rawStops.push(stop);
        }
    }
    if (rawStops.length < 2)
        return null;
    return {
        type: 'conic',
        angleDegrees,
        stops: normalizeStopPositions(rawStops)
    };
}
// ---------------------------------------------------------------
//  Unified parse entry point
// ---------------------------------------------------------------
/**
 * Parses any CSS gradient value into structured data. Detects the gradient
 * type from the function name and delegates to the appropriate parser.
 * Returns null if the value is not a recognized gradient.
 */
function parseGradient(value) {
    if (!value || typeof value !== 'string')
        return null;
    const lower = value.toLowerCase().trim();
    if (lower.startsWith('linear-gradient(') || lower.startsWith('repeating-linear-gradient(')) {
        return parseLinearGradient(value);
    }
    if (lower.startsWith('radial-gradient(') || lower.startsWith('repeating-radial-gradient(')) {
        return parseRadialGradient(value);
    }
    if (lower.startsWith('conic-gradient(') || lower.startsWith('repeating-conic-gradient(')) {
        return parseConicGradient(value);
    }
    return null;
}
// ---------------------------------------------------------------
//  UMG Texture Generation Bridge
// ---------------------------------------------------------------
/**
 * Creates a UTexture2D from parsed gradient data by calling the C++ helper
 * functions on UUMGManager. Returns a SlateBrush ready for use as a
 * background image, or null if texture creation fails.
 *
 * @param gradient  Parsed gradient data from parseGradient()
 * @param context   UObject outer for texture lifecycle management
 * @param width     Texture width in pixels (default 256)
 * @param height    Texture height in pixels (default 256)
 */
function createGradientBrush(gradient, context, width = 256, height = 256) {
    if (!gradient || gradient.stops.length < 2) {
        return null;
    }
    // Build parallel arrays for the C++ API
    let colors = UE.NewArray(UE.LinearColor);
    let positions = UE.NewArray(UE.BuiltinFloat);
    for (const stop of gradient.stops) {
        colors.Add(new UE.LinearColor(stop.color.r, stop.color.g, stop.color.b, stop.color.a));
        positions.Add(stop.position);
    }
    let texture = null;
    switch (gradient.type) {
        case 'linear':
            texture = UE.UMGManager.CreateLinearGradientTexture(context, gradient.angleDegrees, colors, positions, width, height);
            break;
        case 'radial':
            texture = UE.UMGManager.CreateRadialGradientTexture(context, colors, positions, width, height);
            break;
        case 'conic':
            // Conic gradient: fall back to linear as UMG has no native conic support
            texture = UE.UMGManager.CreateLinearGradientTexture(context, gradient.angleDegrees, colors, positions, width, height);
            break;
    }
    if (!texture) {
        return null;
    }
    // Create a SlateBrush backed by the generated texture
    const brush = new UE.SlateBrush();
    brush.DrawAs = UE.ESlateBrushDrawType.Image;
    brush.ResourceObject = texture;
    brush.Tiling = UE.ESlateBrushTileType.NoTile;
    return brush;
}
//# sourceMappingURL=css_gradient_parser.js.map