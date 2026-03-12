"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFontSize = parseFontSize;
exports.parseTextAlign = parseTextAlign;
exports.parseFontFaceName = parseFontFaceName;
exports.parseFontSkewAmount = parseFontSkewAmount;
exports.parseFontFamily = parseFontFamily;
exports.parseOutline = parseOutline;
exports.parseTextShadow = parseTextShadow;
exports.parseFont = parseFont;
exports.setupFontStyles = setupFontStyles;
exports.hasFontStyles = hasFontStyles;
const utils_1 = require("../misc/utils");
const css_color_parser_1 = require("./css_color_parser");
const css_length_parser_1 = require("./css_length_parser");
const UE = require("ue");
function parseFontSize(fontSize, style) {
    if (typeof fontSize === 'string') {
        const fontSizeValue = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(fontSize, style);
        return fontSizeValue;
    }
    else if (typeof fontSize === 'number') {
        return fontSize <= 0 ? 12 : fontSize;
    }
    else {
        return 16;
    }
}
function parseTextAlign(textAlign) {
    if (textAlign === 'center') {
        return UE.ETextJustify.Center;
    }
    else if (textAlign === 'right') {
        return UE.ETextJustify.Right;
    }
    else {
        return UE.ETextJustify.Left;
    }
}
function parseFontFaceName(fontStyle, fontWeight) {
    let fontFace = 'Default';
    const normalizedWeight = (fontWeight ?? '').toString().toLowerCase();
    const normalizedStyle = (fontStyle ?? '').toString().toLowerCase();
    if (normalizedWeight === 'bold' || normalizedWeight === 'bolder' || parseInt(normalizedWeight, 10) >= 700) {
        fontFace = 'Bold';
    }
    else if (normalizedWeight === 'light' || normalizedWeight === 'lighter' || parseInt(normalizedWeight, 10) <= 300) {
        fontFace = 'Light';
    }
    else if (normalizedWeight === 'normal' || normalizedWeight === 'regular') {
        fontFace = 'Default';
    }
    switch (normalizedStyle) {
        case '':
        case 'normal':
            // keep weight-driven face
            break;
        case 'italic':
        case 'oblique':
            fontFace = fontFace === 'Bold' ? 'Bold Italic' : 'Italic';
            break;
        case 'bold italic':
        case 'italic bold':
            fontFace = 'Bold Italic';
            break;
        default:
            fontFace = fontStyle ?? fontFace;
            break;
    }
    return fontFace;
}
function parseFontSkewAmount(fontStyle) {
    if (typeof fontStyle !== 'string') {
        return 0;
    }
    if (fontStyle.includes('oblique')) {
        const obliqueMatch = fontStyle.match(/oblique\s+(\d+)deg/);
        if (obliqueMatch && obliqueMatch[1]) {
            const angleDegrees = parseInt(obliqueMatch[1], 10);
            // Convert degrees to radians (UE uses radians for skew)
            const angleRadians = angleDegrees * (Math.PI / 180);
            return angleRadians;
        }
    }
    return 0;
}
function parseFontFamily(cssText) {
    if (typeof cssText !== 'string') {
        return [];
    }
    const match = cssText.match(/\s*:\s*([^;]+);?/i);
    const rawValue = (match ? match[1] : cssText).trim();
    if (!rawValue) {
        return [];
    }
    // 使用正则处理带引号和不带引号的字体名
    const fonts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < rawValue.length; i++) {
        const char = rawValue[i];
        if (char === '"' || char === "'") {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else if (quoteChar === char) {
                inQuotes = false;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            if (current.trim().length > 0) {
                fonts.push(current.trim());
            }
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim()) {
        fonts.push(current.trim());
    }
    return fonts
        .map(f => f.replace(/^["']|["']$/g, '').trim())
        .filter(f => f.length > 0);
}
function parseOutline(outline, style) {
    // Parse outline with pattern: <width> || <style> || <color>
    if (typeof outline !== 'string') {
        return {};
    }
    const parts = outline.match(/(?:rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}|[^\s]+)/gi) ?? [];
    const result = {};
    for (const part of parts) {
        if (/^(solid|dashed|dotted|double|groove|ridge|inset|outset|none)$/i.test(part)) {
            result.outlineStyle = part.toLowerCase();
            continue;
        }
        if (/^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i.test(part)) {
            result.outlineColor = (0, css_color_parser_1.parseToLinearColor)(part);
            continue;
        }
        // Width - assume it's a length value; fall back to numeric parsing
        const convertedWidth = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(part, style);
        if (convertedWidth !== undefined && convertedWidth !== null) {
            result.outlineWidth = convertedWidth;
        }
    }
    if (parts.length === 1 && !result.outlineWidth && !result.outlineColor) {
        result.outlineStyle = parts[0].toLowerCase();
    }
    return result;
}
/**
 * Parses a CSS text-shadow value into offset, blur, and color components.
 * Syntax: <offset-x> <offset-y> [<blur-radius>] [<color>]
 * Multiple shadows (comma-separated) are supported; only the first is used
 * because UMG TextBlock supports a single shadow layer.
 *
 * @param textShadow  CSS text-shadow string (e.g. "2px 2px 4px rgba(0,0,0,0.5)")
 * @param style       Parent style context for unit resolution
 * @returns Object with offsetX, offsetY, blurRadius, and color (LinearColor-like)
 */
function parseTextShadow(textShadow, style) {
    if (!textShadow || typeof textShadow !== 'string') {
        return null;
    }
    const trimmed = textShadow.trim().toLowerCase();
    if (trimmed === 'none' || trimmed === '0') {
        return null;
    }
    // Take only the first shadow layer (comma-separated)
    let layer = trimmed;
    let depth = 0;
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '(')
            depth++;
        else if (trimmed[i] === ')')
            depth = Math.max(0, depth - 1);
        else if (trimmed[i] === ',' && depth === 0) {
            layer = trimmed.slice(0, i).trim();
            break;
        }
    }
    // Tokenize, keeping parenthesized expressions (like rgba()) as single tokens
    const tokens = [];
    let current = '';
    let parenDepth = 0;
    for (let i = 0; i < layer.length; i++) {
        const ch = layer[i];
        if (ch === '(') {
            parenDepth++;
            current += ch;
        }
        else if (ch === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            current += ch;
        }
        else if (ch === ' ' && parenDepth === 0) {
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
    const lengths = [];
    let colorStr = null;
    for (const token of tokens) {
        // Detect color tokens
        if (token.startsWith('#') || token.startsWith('rgb') || token.startsWith('hsl')) {
            colorStr = token;
            continue;
        }
        // Try as a numeric length value
        if (/^-?[\d.]/.test(token)) {
            lengths.push((0, css_length_parser_1.convertLengthUnitToSlateUnit)(token, style));
            continue;
        }
        // Named color as fallback
        if (/^[a-z]+$/i.test(token) && token !== 'none') {
            colorStr = token;
        }
    }
    // CSS text-shadow: offsetX offsetY [blurRadius] [color]
    const offsetX = lengths.length >= 1 ? lengths[0] : 0;
    const offsetY = lengths.length >= 2 ? lengths[1] : 0;
    const blurRadius = lengths.length >= 3 ? lengths[2] : 0;
    return {
        offsetX,
        offsetY,
        blurRadius,
        color: colorStr ? (0, css_color_parser_1.parseToLinearColor)(colorStr) : null
    };
}
function parseFont(style) {
    let result = {};
    result['fontSize'] = parseFontSize(style?.fontSize, style);
    result['fontColor'] = (0, css_color_parser_1.parseToLinearColor)(style?.color);
    result['textAlign'] = parseTextAlign(style?.textAlign);
    result['letterSpacing'] = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style?.letterSpacing, style);
    result['wordSpacing'] = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style?.wordSpacing, style);
    result['fontFamily'] = parseFontFamily(style?.fontFamily);
    result['fontFaceName'] = parseFontFaceName(style?.fontStyle, style?.fontWeight);
    result['fontSkewAmount'] = parseFontSkewAmount(style?.fontStyle);
    const { outlineStyle, outlineColor, outlineWidth } = parseOutline(style?.outline, style);
    result['outlineStyle'] = outlineStyle;
    result['outlineColor'] = outlineColor;
    result['outlineWidth'] = outlineWidth;
    if (style?.outlineColor) {
        result['outlineColor'] = (0, css_color_parser_1.parseToLinearColor)(style?.outlineColor);
    }
    if (style?.outlineWidth) {
        result['outlineWidth'] = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style?.outlineWidth, style);
    }
    return result;
}
function setupFontStyles(outer, font, fontStyle) {
    if (fontStyle?.fontSize) {
        font.Size = parseFontSize(fontStyle?.fontSize, fontStyle);
    }
    if (fontStyle?.fontStyle) {
        font.SkewAmount = parseFontSkewAmount(fontStyle?.fontStyle);
    }
    if (fontStyle?.fontWeight) {
        font.TypefaceFontName = parseFontFaceName(fontStyle?.fontStyle, fontStyle?.fontWeight);
    }
    if (fontStyle?.fontFamily) {
        const fontFamilyArray = parseFontFamily(fontStyle?.fontFamily);
        if (fontFamilyArray.length === 0) {
            fontFamilyArray.push('Roboto'); // default font family
        }
        if (fontFamilyArray.includes('monospace')) {
            font.bForceMonospaced = true;
        }
        const width = fontStyle?.width;
        if (width) {
            font.MonospacedWidth = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(width, fontStyle);
        }
        let familyNames = UE.NewArray(UE.BuiltinString);
        for (const family of fontFamilyArray) {
            familyNames.Add(family);
        }
        const fontObject = UE.UMGManager.FindFontFamily(familyNames, outer);
        if (fontObject) {
            font.FontObject = fontObject;
        }
    }
    else if (!font.FontObject) {
        let familyNames = UE.NewArray(UE.BuiltinString);
        familyNames.Add('Roboto');
        font.FontObject = UE.UMGManager.FindFontFamily(familyNames, outer);
    }
    if (fontStyle?.letterSpacing) {
        font.LetterSpacing = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(fontStyle?.letterSpacing, fontStyle);
    }
    if (fontStyle?.wordSpacing) {
        font.LetterSpacing = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(fontStyle?.wordSpacing, fontStyle);
    }
    if (fontStyle?.outline) {
        const outlineResult = parseOutline(fontStyle?.outline, fontStyle);
        if (outlineResult.outlineWidth !== undefined) {
            font.OutlineSettings.OutlineSize = outlineResult.outlineWidth;
        }
        if (outlineResult.outlineColor) {
            font.OutlineSettings.OutlineColor.R = outlineResult.outlineColor.r;
            font.OutlineSettings.OutlineColor.G = outlineResult.outlineColor.g;
            font.OutlineSettings.OutlineColor.B = outlineResult.outlineColor.b;
            font.OutlineSettings.OutlineColor.A = outlineResult.outlineColor.a;
        }
    }
    if (fontStyle?.outlineColor) {
        const outlineColor = (0, css_color_parser_1.parseToLinearColor)(fontStyle?.outlineColor);
        font.OutlineSettings.OutlineColor.R = outlineColor.r;
        font.OutlineSettings.OutlineColor.G = outlineColor.g;
        font.OutlineSettings.OutlineColor.B = outlineColor.b;
        font.OutlineSettings.OutlineColor.A = outlineColor.a;
    }
    if (fontStyle?.outlineWidth) {
        font.OutlineSettings.OutlineSize = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(fontStyle?.outlineWidth, fontStyle);
    }
    if (fontStyle?.whiteSpace) {
        const ws = fontStyle.whiteSpace.toString().toLowerCase();
        if (ws === "nowrap" || ws === "pre") {
            outer.AutoWrapText = false;
        }
    }
}
function hasFontStyles(style) {
    const styleNames = ['fontSize', 'fontStyle', 'fontWeight', 'fontFamily',
        'letterSpacing', 'wordSpacing', 'outline', 'outlineColor', 'outlineWidth'];
    for (const styleName of styleNames) {
        if ((0, utils_1.isKeyOfRecord)(styleName, style)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=css_font_parser.js.map