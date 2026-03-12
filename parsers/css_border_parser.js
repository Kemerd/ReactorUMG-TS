"use strict";
/**
 * CSS Border, Border-Radius, and Box-Shadow Parser
 *
 * Parses CSS border shorthand properties into Unreal Engine SlateBrush
 * outline settings. Maps CSS visual conventions to UMG equivalents:
 *
 *   border          -> SlateBrush OutlineSettings (width, color, corner radii)
 *   border-radius   -> SlateBrushOutlineSettings CornerRadii + RoundedBox draw type
 *   box-shadow      -> Approximated via SlateBrush outline with offset padding
 *
 * UMG Limitations:
 *   - UMG doesn't have per-side border widths; we use the largest specified value
 *   - box-shadow is approximated; true drop shadows require material-based approaches
 *   - border-style is decorative only; UMG only supports solid outlines
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBorderShorthand = parseBorderShorthand;
exports.parseBorderRadius = parseBorderRadius;
exports.parseSingleCornerRadius = parseSingleCornerRadius;
exports.parseBoxShadow = parseBoxShadow;
exports.processBorderStyles = processBorderStyles;
exports.applyOutlineToBrush = applyOutlineToBrush;
const UE = require("ue");
const css_color_parser_1 = require("./css_color_parser");
const css_length_parser_1 = require("./css_length_parser");
/* ─────────────────────────────────────────────────────────
 * Border Shorthand Parser
 * ───────────────────────────────────────────────────────── */
/**
 * Known CSS border-style keywords used to distinguish style tokens
 * from color or width tokens in the shorthand syntax.
 */
const BORDER_STYLE_KEYWORDS = new Set([
    'none', 'hidden', 'dotted', 'dashed', 'solid',
    'double', 'groove', 'ridge', 'inset', 'outset'
]);
/**
 * Checks if a token looks like a color value (hex, named, rgb/hsl function).
 */
function isColorToken(token) {
    if (token.startsWith('#'))
        return true;
    if (token.startsWith('rgb') || token.startsWith('hsl'))
        return true;
    // Check against common named colors (abbreviated heuristic)
    if (/^[a-z]+$/i.test(token) && !BORDER_STYLE_KEYWORDS.has(token.toLowerCase())) {
        return true;
    }
    return false;
}
/**
 * Parses a CSS border shorthand string like "1px solid #333" into
 * its constituent parts: width, style, and color.
 *
 * @param border - CSS border shorthand (e.g. "2px dashed red")
 * @param style  - Parent style object for relative unit resolution
 * @returns Parsed border components
 */
function parseBorderShorthand(border, style) {
    const result = {
        width: 0,
        style: 'none',
        color: null
    };
    if (!border || typeof border !== 'string') {
        return result;
    }
    const trimmed = border.trim().toLowerCase();
    if (trimmed === 'none' || trimmed === '0') {
        return result;
    }
    // Tokenize, keeping parenthesized function calls (like rgb()) together
    const tokens = tokenizeBorderValue(trimmed);
    for (const token of tokens) {
        // Check for border-style keywords first
        if (BORDER_STYLE_KEYWORDS.has(token)) {
            result.style = token;
            continue;
        }
        // Try parsing as a length value (width)
        if (/^[\d.]/.test(token) || token === 'thin' || token === 'medium' || token === 'thick') {
            result.width = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(token, style);
            continue;
        }
        // Remaining token is treated as a color
        if (isColorToken(token)) {
            result.color = (0, css_color_parser_1.parseToLinearColor)(token);
        }
    }
    // Default to solid if a width was specified but no style
    if (result.width > 0 && result.style === 'none') {
        result.style = 'solid';
    }
    return result;
}
/**
 * Tokenizes a border value string, keeping parenthesized expressions
 * (like rgb(), hsl()) as single tokens.
 */
function tokenizeBorderValue(value) {
    const tokens = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
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
    if (current.length > 0) {
        tokens.push(current);
    }
    return tokens;
}
/* ─────────────────────────────────────────────────────────
 * Border-Radius Parser
 * ───────────────────────────────────────────────────────── */
/**
 * Parses a CSS border-radius shorthand value into per-corner radii.
 * Supports 1-4 value syntax:
 *   - 1 value: all corners
 *   - 2 values: top-left/bottom-right, top-right/bottom-left
 *   - 3 values: top-left, top-right/bottom-left, bottom-right
 *   - 4 values: top-left, top-right, bottom-right, bottom-left
 *
 * @param borderRadius - CSS border-radius value (e.g. "5px", "5px 10px 15px 20px")
 * @param style        - Parent style object for relative unit resolution
 * @returns Per-corner radius values in Slate units
 */
function parseBorderRadius(borderRadius, style) {
    const result = {
        topLeft: 0,
        topRight: 0,
        bottomRight: 0,
        bottomLeft: 0
    };
    if (borderRadius === undefined || borderRadius === null) {
        return result;
    }
    // Handle numeric input directly
    if (typeof borderRadius === 'number') {
        result.topLeft = borderRadius;
        result.topRight = borderRadius;
        result.bottomRight = borderRadius;
        result.bottomLeft = borderRadius;
        return result;
    }
    const trimmed = borderRadius.trim();
    if (!trimmed || trimmed === '0' || trimmed === 'none') {
        return result;
    }
    // Split on whitespace (ignoring the "/" elliptical syntax for now)
    const slashIndex = trimmed.indexOf('/');
    const primary = slashIndex >= 0 ? trimmed.slice(0, slashIndex).trim() : trimmed;
    const values = primary.split(/\s+/).map(v => (0, css_length_parser_1.convertLengthUnitToSlateUnit)(v, style));
    if (values.length === 1) {
        result.topLeft = values[0];
        result.topRight = values[0];
        result.bottomRight = values[0];
        result.bottomLeft = values[0];
    }
    else if (values.length === 2) {
        result.topLeft = values[0];
        result.topRight = values[1];
        result.bottomRight = values[0];
        result.bottomLeft = values[1];
    }
    else if (values.length === 3) {
        result.topLeft = values[0];
        result.topRight = values[1];
        result.bottomRight = values[2];
        result.bottomLeft = values[1];
    }
    else if (values.length >= 4) {
        result.topLeft = values[0];
        result.topRight = values[1];
        result.bottomRight = values[2];
        result.bottomLeft = values[3];
    }
    return result;
}
/**
 * Parses individual border-*-radius properties (e.g. border-top-left-radius).
 * Handles single values and two-value elliptical syntax (takes the first value).
 */
function parseSingleCornerRadius(value, style) {
    if (typeof value === 'number')
        return value;
    if (!value || typeof value !== 'string')
        return 0;
    const parts = value.trim().split(/\s+/);
    return (0, css_length_parser_1.convertLengthUnitToSlateUnit)(parts[0], style);
}
/* ─────────────────────────────────────────────────────────
 * Box-Shadow Parser
 * ───────────────────────────────────────────────────────── */
/**
 * Parses a CSS box-shadow value into its components.
 * Supports: `[inset] <offsetX> <offsetY> [<blur>] [<spread>] [<color>]`
 * Multiple shadows (comma-separated) returns only the first for UMG mapping.
 *
 * @param boxShadow - CSS box-shadow string
 * @param style     - Parent style for unit resolution
 * @returns Parsed shadow components, or null if invalid/none
 */
function parseBoxShadow(boxShadow, style) {
    if (!boxShadow || typeof boxShadow !== 'string') {
        return null;
    }
    const trimmed = boxShadow.trim().toLowerCase();
    if (trimmed === 'none' || trimmed === '0') {
        return null;
    }
    // Take only the first shadow layer (split on commas outside parentheses)
    const layers = splitShadowLayers(trimmed);
    if (layers.length === 0) {
        return null;
    }
    return parseSingleShadowLayer(layers[0], style);
}
/**
 * Splits a box-shadow value into individual layers on commas,
 * respecting parenthesized expressions.
 */
function splitShadowLayers(value) {
    const layers = [];
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
                layers.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim())
        layers.push(current.trim());
    return layers;
}
/**
 * Parses a single box-shadow layer into its numeric and color components.
 */
function parseSingleShadowLayer(layer, style) {
    const result = {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 0,
        color: { r: 0, g: 0, b: 0, a: 0.5 },
        inset: false
    };
    // Check for and strip 'inset' keyword
    let working = layer;
    if (working.startsWith('inset')) {
        result.inset = true;
        working = working.slice(5).trim();
    }
    else if (working.endsWith('inset')) {
        result.inset = true;
        working = working.slice(0, -5).trim();
    }
    // Tokenize remaining, keeping function calls together
    const tokens = tokenizeBorderValue(working);
    const lengthValues = [];
    let colorStr = null;
    for (const token of tokens) {
        // Detect color tokens (hex, rgb(), hsl(), named colors)
        if (token.startsWith('#') || token.startsWith('rgb') || token.startsWith('hsl')) {
            colorStr = token;
            continue;
        }
        // Try as a numeric length value
        if (/^-?[\d.]/.test(token)) {
            lengthValues.push((0, css_length_parser_1.convertLengthUnitToSlateUnit)(token, style));
        }
        else if (!BORDER_STYLE_KEYWORDS.has(token)) {
            // Likely a named color
            colorStr = token;
        }
    }
    // Assign length values in order: offsetX, offsetY, blur, spread
    if (lengthValues.length >= 1)
        result.offsetX = lengthValues[0];
    if (lengthValues.length >= 2)
        result.offsetY = lengthValues[1];
    if (lengthValues.length >= 3)
        result.blurRadius = lengthValues[2];
    if (lengthValues.length >= 4)
        result.spreadRadius = lengthValues[3];
    if (colorStr) {
        result.color = (0, css_color_parser_1.parseToLinearColor)(colorStr);
    }
    return result;
}
/* ─────────────────────────────────────────────────────────
 * Composite Style-to-Outline Mapper
 * ───────────────────────────────────────────────────────── */
/**
 * Processes all border-related CSS properties from a style object and
 * produces a unified outline result that can be applied to a SlateBrush.
 *
 * Properties examined:
 *   - border, borderWidth, borderStyle, borderColor
 *   - borderTop, borderRight, borderBottom, borderLeft
 *   - borderRadius, borderTopLeftRadius, borderTopRightRadius,
 *     borderBottomLeftRadius, borderBottomRightRadius
 *
 * @param style - Merged CSS style object
 * @returns Outline configuration for SlateBrush
 */
function processBorderStyles(style) {
    const result = {
        hasOutline: false,
        width: 0,
        cornerRadii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        color: null,
        drawAsRoundedBox: false
    };
    if (!style) {
        return result;
    }
    // 1. Parse the border shorthand if present
    if (style.border) {
        const parsed = parseBorderShorthand(style.border, style);
        result.width = parsed.width;
        result.color = parsed.color;
        if (parsed.width > 0)
            result.hasOutline = true;
    }
    // 2. Individual border-width override
    if (style.borderWidth !== undefined) {
        result.width = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style.borderWidth, style);
        if (result.width > 0)
            result.hasOutline = true;
    }
    // 3. Individual border-color override
    if (style.borderColor) {
        result.color = (0, css_color_parser_1.parseToLinearColor)(style.borderColor);
        result.hasOutline = true;
    }
    // 4. Per-side border parsing (take the maximum width for UMG compatibility)
    const sides = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'];
    for (const side of sides) {
        if (style[side]) {
            const parsed = parseBorderShorthand(style[side], style);
            if (parsed.width > result.width) {
                result.width = parsed.width;
            }
            if (parsed.color && !result.color) {
                result.color = parsed.color;
            }
            if (parsed.width > 0)
                result.hasOutline = true;
        }
    }
    // 5. Parse border-radius
    if (style.borderRadius !== undefined) {
        result.cornerRadii = parseBorderRadius(style.borderRadius, style);
        result.drawAsRoundedBox = true;
    }
    // 6. Per-corner radius overrides
    if (style.borderTopLeftRadius !== undefined) {
        result.cornerRadii.topLeft = parseSingleCornerRadius(style.borderTopLeftRadius, style);
        result.drawAsRoundedBox = true;
    }
    if (style.borderTopRightRadius !== undefined) {
        result.cornerRadii.topRight = parseSingleCornerRadius(style.borderTopRightRadius, style);
        result.drawAsRoundedBox = true;
    }
    if (style.borderBottomRightRadius !== undefined) {
        result.cornerRadii.bottomRight = parseSingleCornerRadius(style.borderBottomRightRadius, style);
        result.drawAsRoundedBox = true;
    }
    if (style.borderBottomLeftRadius !== undefined) {
        result.cornerRadii.bottomLeft = parseSingleCornerRadius(style.borderBottomLeftRadius, style);
        result.drawAsRoundedBox = true;
    }
    return result;
}
/**
 * Applies a BorderOutlineResult to a UE.SlateBrush, configuring its
 * OutlineSettings and DrawAs type for rounded box rendering.
 *
 * @param brush   - The SlateBrush to configure
 * @param outline - The parsed outline result from processBorderStyles
 */
function applyOutlineToBrush(brush, outline) {
    if (!brush || !outline) {
        return;
    }
    // Switch to RoundedBox draw type when border-radius is specified
    if (outline.drawAsRoundedBox) {
        brush.DrawAs = UE.ESlateBrushDrawType.RoundedBox;
    }
    if (!outline.hasOutline && !outline.drawAsRoundedBox) {
        return;
    }
    // Configure outline settings on the brush
    const outlineSettings = new UE.SlateBrushOutlineSettings();
    // Set corner radii (UE4 uses X=TopLeft, Y=TopRight, Z=BottomRight, W=BottomLeft)
    outlineSettings.CornerRadii.X = outline.cornerRadii.topLeft;
    outlineSettings.CornerRadii.Y = outline.cornerRadii.topRight;
    outlineSettings.CornerRadii.Z = outline.cornerRadii.bottomRight;
    outlineSettings.CornerRadii.W = outline.cornerRadii.bottomLeft;
    // Use FixedRadius rounding type for explicit pixel radii
    outlineSettings.RoundingType = UE.ESlateBrushRoundingType.FixedRadius;
    // Set outline width
    if (outline.width > 0) {
        outlineSettings.Width = outline.width;
    }
    // Set outline color
    if (outline.color) {
        outlineSettings.Color.SpecifiedColor.R = outline.color.r;
        outlineSettings.Color.SpecifiedColor.G = outline.color.g;
        outlineSettings.Color.SpecifiedColor.B = outline.color.b;
        outlineSettings.Color.SpecifiedColor.A = outline.color.a;
    }
    brush.OutlineSettings = outlineSettings;
}
//# sourceMappingURL=css_border_parser.js.map