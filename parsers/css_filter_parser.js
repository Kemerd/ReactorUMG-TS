"use strict";
/**
 * CSS Filter Parser
 *
 * Parses CSS `filter` and `backdrop-filter` property values into structured
 * data that can be mapped to UMG widget wrappers. Supports the common
 * filter functions used in web development.
 *
 * Supported filters:
 *   - blur(Xpx)       -> UBackgroundBlur wrapping
 *   - brightness(X)   -> ColorAndOpacity tinting
 *   - contrast(X)     -> ColorAndOpacity adjustment (approximation)
 *   - grayscale(X)    -> ColorAndOpacity desaturation (approximation)
 *   - saturate(X)     -> ColorAndOpacity saturation boost (approximation)
 *   - sepia(X)        -> ColorAndOpacity sepia tint (approximation)
 *   - opacity(X)      -> RenderOpacity
 *   - drop-shadow()   -> Same as box-shadow
 *   - invert(X)       -> Not natively possible in UMG, stored as no-op
 *   - hue-rotate()    -> Not natively possible in UMG, stored as no-op
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFilter = parseFilter;
exports.getBlurRadius = getBlurRadius;
exports.getCombinedBrightness = getCombinedBrightness;
exports.getCombinedOpacity = getCombinedOpacity;
/**
 * Parses a CSS filter (or backdrop-filter) value string into an array
 * of individual filter functions. Multiple filters are applied in order.
 *
 * @example parseFilter("blur(10px) brightness(1.2) grayscale(50%)")
 */
function parseFilter(filterValue) {
    if (!filterValue || typeof filterValue !== 'string') {
        return [];
    }
    const trimmed = filterValue.trim().toLowerCase();
    if (trimmed === 'none') {
        return [];
    }
    const results = [];
    // Match function calls: name(args)
    const funcRegex = /([\w-]+)\(([^)]*)\)/g;
    let match;
    while ((match = funcRegex.exec(trimmed)) !== null) {
        const funcName = match[1];
        const args = match[2].trim();
        switch (funcName) {
            case 'blur': {
                const radius = parseFilterLength(args);
                results.push({ type: 'blur', radius });
                break;
            }
            case 'brightness': {
                results.push({ type: 'brightness', amount: parseFilterAmount(args) });
                break;
            }
            case 'contrast': {
                results.push({ type: 'contrast', amount: parseFilterAmount(args) });
                break;
            }
            case 'grayscale': {
                results.push({ type: 'grayscale', amount: parseFilterAmount(args) });
                break;
            }
            case 'saturate': {
                results.push({ type: 'saturate', amount: parseFilterAmount(args) });
                break;
            }
            case 'sepia': {
                results.push({ type: 'sepia', amount: parseFilterAmount(args) });
                break;
            }
            case 'opacity': {
                results.push({ type: 'opacity', amount: parseFilterAmount(args) });
                break;
            }
            case 'drop-shadow': {
                // drop-shadow(offsetX offsetY blurRadius color)
                const parts = args.split(/\s+/);
                results.push({
                    type: 'drop-shadow',
                    offsetX: parts.length >= 1 ? parseFilterLength(parts[0]) : 0,
                    offsetY: parts.length >= 2 ? parseFilterLength(parts[1]) : 0,
                    blurRadius: parts.length >= 3 ? parseFilterLength(parts[2]) : 0,
                    color: parts.length >= 4 ? parts.slice(3).join(' ') : 'rgba(0,0,0,0.5)'
                });
                break;
            }
            case 'invert':
            case 'hue-rotate': {
                results.push({ type: funcName, rawValue: args });
                break;
            }
        }
    }
    return results;
}
/**
 * Extracts the blur radius (in pixels) from a parsed filter array.
 * Returns 0 if no blur filter is present.
 */
function getBlurRadius(filters) {
    for (const f of filters) {
        if (f.type === 'blur') {
            return f.radius;
        }
    }
    return 0;
}
/**
 * Computes a combined brightness multiplier from all brightness/contrast
 * filters. Returns 1.0 for no modification.
 */
function getCombinedBrightness(filters) {
    let brightness = 1.0;
    for (const f of filters) {
        if (f.type === 'brightness')
            brightness *= f.amount;
    }
    return brightness;
}
/**
 * Computes the combined opacity from filter opacity functions.
 * Returns 1.0 if no opacity filter is present.
 */
function getCombinedOpacity(filters) {
    let opacity = 1.0;
    for (const f of filters) {
        if (f.type === 'opacity')
            opacity *= f.amount;
    }
    return opacity;
}
// ---------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------
/** Parse a length value like "10px" into a number (pixels) */
function parseFilterLength(value) {
    if (!value)
        return 0;
    const trimmed = value.trim();
    if (trimmed.endsWith('px')) {
        return parseFloat(trimmed) || 0;
    }
    if (trimmed.endsWith('em') || trimmed.endsWith('rem')) {
        return (parseFloat(trimmed) || 0) * 16; // Rough approximation
    }
    return parseFloat(trimmed) || 0;
}
/**
 * Parse a filter amount: "0.5", "50%", "1.2" -> number.
 * Percentages are converted to fractions (50% -> 0.5).
 */
function parseFilterAmount(value) {
    if (!value)
        return 1;
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
        return (parseFloat(trimmed) || 0) / 100;
    }
    return parseFloat(trimmed) || 0;
}
//# sourceMappingURL=css_filter_parser.js.map