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

export interface FilterBlur {
    type: 'blur';
    radius: number; // in pixels
}

export interface FilterBrightness {
    type: 'brightness';
    amount: number; // 0..N where 1 = normal
}

export interface FilterContrast {
    type: 'contrast';
    amount: number;
}

export interface FilterGrayscale {
    type: 'grayscale';
    amount: number; // 0..1 where 0 = normal, 1 = fully gray
}

export interface FilterSaturate {
    type: 'saturate';
    amount: number;
}

export interface FilterSepia {
    type: 'sepia';
    amount: number;
}

export interface FilterOpacity {
    type: 'opacity';
    amount: number; // 0..1
}

export interface FilterDropShadow {
    type: 'drop-shadow';
    offsetX: number;
    offsetY: number;
    blurRadius: number;
    color: string;
}

export interface FilterNoop {
    type: 'invert' | 'hue-rotate';
    rawValue: string;
}

export type FilterFunction =
    | FilterBlur | FilterBrightness | FilterContrast | FilterGrayscale
    | FilterSaturate | FilterSepia | FilterOpacity | FilterDropShadow | FilterNoop;

/**
 * Parses a CSS filter (or backdrop-filter) value string into an array
 * of individual filter functions. Multiple filters are applied in order.
 *
 * @example parseFilter("blur(10px) brightness(1.2) grayscale(50%)")
 */
export function parseFilter(filterValue: string): FilterFunction[] {
    if (!filterValue || typeof filterValue !== 'string') {
        return [];
    }

    const trimmed = filterValue.trim().toLowerCase();
    if (trimmed === 'none') {
        return [];
    }

    const results: FilterFunction[] = [];

    // Match function calls: name(args)
    const funcRegex = /([\w-]+)\(([^)]*)\)/g;
    let match: RegExpExecArray | null;

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
                results.push({ type: funcName as 'invert' | 'hue-rotate', rawValue: args });
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
export function getBlurRadius(filters: FilterFunction[]): number {
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
export function getCombinedBrightness(filters: FilterFunction[]): number {
    let brightness = 1.0;
    for (const f of filters) {
        if (f.type === 'brightness') brightness *= f.amount;
    }
    return brightness;
}

/**
 * Computes the combined opacity from filter opacity functions.
 * Returns 1.0 if no opacity filter is present.
 */
export function getCombinedOpacity(filters: FilterFunction[]): number {
    let opacity = 1.0;
    for (const f of filters) {
        if (f.type === 'opacity') opacity *= f.amount;
    }
    return opacity;
}

// ---------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------

/** Parse a length value like "10px" into a number (pixels) */
function parseFilterLength(value: string): number {
    if (!value) return 0;
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
function parseFilterAmount(value: string): number {
    if (!value) return 1;
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
        return (parseFloat(trimmed) || 0) / 100;
    }
    return parseFloat(trimmed) || 0;
}
