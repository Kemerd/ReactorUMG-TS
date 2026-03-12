"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateCalcExpression = evaluateCalcExpression;
exports.convertLengthUnitToSlateUnit = convertLengthUnitToSlateUnit;
exports.convertLUToSUWithUnitType = convertLUToSUWithUnitType;
exports.parseScale = parseScale;
exports.parseAspectRatio = parseAspectRatio;
const UE = require("ue");
const utils_1 = require("../misc/utils");
/**
 * Converts CSS length values to SU (Slate Units) for Unreal Engine UMG
 * Supported units: px, %, em, rem (relative to parent font size)
 * @param length - CSS length string or number to convert (e.g., "16px", "2em", 12)
 * @param style - React style object containing font size reference
 * @returns Converted value in SU units
 */
/**
 * Evaluates a CSS calc() expression by recursively resolving arithmetic
 * operations (+, -, *, /) between length values. Supports nested calc(),
 * parenthesized sub-expressions, and all unit types handled by
 * convertLengthUnitToSlateUnit.
 *
 * @param expr           The calc() expression string (without the outer "calc()")
 * @param style          React style context for font-size based units (em, rem)
 * @param referenceSize  Reference dimension for percentage-based values
 * @param canvasSize     Viewport dimensions for vw/vh units
 * @returns              The computed numeric result in Slate Units
 */
function evaluateCalcExpression(expr, style, referenceSize, canvasSize) {
    if (!expr || typeof expr !== 'string')
        return 0;
    let cleaned = expr.trim();
    // Strip outer calc() wrapper if present (handles nested calc)
    while (cleaned.toLowerCase().startsWith('calc(') && cleaned.endsWith(')')) {
        cleaned = cleaned.slice(5, -1).trim();
    }
    // Tokenize: split on operators (+, -, *, /) while keeping them.
    // Respect parenthesized sub-expressions.
    const tokens = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '(') {
            depth++;
            current += ch;
            continue;
        }
        if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
            continue;
        }
        // At top-level, split on + and - (but not inside a number like "-5px" or scientific notation)
        if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
            const prevChar = cleaned[i - 1];
            // Only split if preceded by whitespace or a closing paren or digit/unit-letter
            if (prevChar === ' ' || prevChar === ')' || /[a-z%\d]/.test(prevChar)) {
                // Check if this is an operator (preceded and followed by space)
                const prevIsSpace = cleaned[i - 1] === ' ';
                const nextIsSpace = i + 1 < cleaned.length && cleaned[i + 1] === ' ';
                if (prevIsSpace || nextIsSpace) {
                    if (current.trim())
                        tokens.push(current.trim());
                    tokens.push(ch);
                    current = '';
                    continue;
                }
            }
        }
        if (depth === 0 && (ch === '*' || ch === '/')) {
            if (current.trim())
                tokens.push(current.trim());
            tokens.push(ch);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim())
        tokens.push(current.trim());
    // Resolve each value token to a number
    const resolveToken = (token) => {
        const t = token.trim();
        // Parenthesized sub-expression or nested calc()
        if (t.startsWith('(') && t.endsWith(')')) {
            return evaluateCalcExpression(t.slice(1, -1), style, referenceSize, canvasSize);
        }
        if (t.toLowerCase().startsWith('calc(')) {
            return evaluateCalcExpression(t, style, referenceSize, canvasSize);
        }
        return convertLengthUnitToSlateUnit(t, style, referenceSize, canvasSize);
    };
    // Two-pass evaluation: first * and /, then + and -
    // Convert tokens to a list of {value, operator}
    const values = [];
    const ops = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === '+' || t === '-' || t === '*' || t === '/') {
            ops.push(t);
        }
        else {
            values.push(resolveToken(t));
        }
    }
    // Pass 1: resolve * and /
    const values2 = [values[0]];
    const ops2 = [];
    for (let i = 0; i < ops.length; i++) {
        if (ops[i] === '*') {
            values2[values2.length - 1] *= values[i + 1];
        }
        else if (ops[i] === '/') {
            const divisor = values[i + 1];
            values2[values2.length - 1] /= (divisor !== 0 ? divisor : 1);
        }
        else {
            ops2.push(ops[i]);
            values2.push(values[i + 1]);
        }
    }
    // Pass 2: resolve + and -
    let result = values2[0] ?? 0;
    for (let i = 0; i < ops2.length; i++) {
        if (ops2[i] === '+')
            result += values2[i + 1];
        else if (ops2[i] === '-')
            result -= values2[i + 1];
    }
    return result;
}
function convertLengthUnitToSlateUnit(length, style, referenceSize, canvasSize /*目前无法在非运行时下获取到画布大小*/) {
    if (length === undefined || length === null) {
        return 0;
    }
    if (typeof length === "number") {
        return length;
    }
    const normalized = String(length).trim();
    // Handle calc() expressions
    if (normalized.toLowerCase().startsWith('calc(') && normalized.endsWith(')')) {
        return evaluateCalcExpression(normalized, style, referenceSize, canvasSize);
    }
    let fontSize = style?.fontSize ?? "16px";
    if (typeof fontSize === "number") {
        fontSize = `${fontSize}px`;
    }
    else if (typeof fontSize === "string") {
        fontSize = fontSize.trim();
    }
    else {
        fontSize = "16px";
    }
    if (!fontSize.endsWith("px")) {
        fontSize = "16px";
    }
    const parseViewSize = (input, isVertical) => {
        if (!canvasSize)
            return 0;
        let match;
        if (isVertical) {
            match = input.match(/([+-]?\d+(?:\.\d+)?)vh/);
        }
        else {
            match = input.match(/([+-]?\d+(?:\.\d+)?)vw/);
        }
        if (!match) {
            return 0;
        }
        const value = parseFloat(match[1]) ?? 0;
        if (isNaN(value)) {
            return 0;
        }
        if (isVertical) {
            const viewportHeight = typeof canvasSize.Y === "number"
                ? canvasSize.Y
                : typeof canvasSize.y === "number"
                    ? canvasSize.y
                    : 0;
            return (viewportHeight * value) / 100;
        }
        else {
            const viewportWidth = typeof canvasSize.X === "number"
                ? canvasSize.X
                : typeof canvasSize.x === "number"
                    ? canvasSize.x
                    : 0;
            return (viewportWidth * value) / 100;
        }
    };
    const numSize = parseFloat(fontSize.replace("px", "")) || 16;
    if (normalized.endsWith("px")) {
        const match = normalized.match(/([+-]?\d+(?:\.\d+)?)px/);
        if (match) {
            return parseFloat(match[1]);
        }
    }
    else if (normalized.endsWith("%")) {
        const percent = parseFloat(normalized.substring(0, normalized.length - 1));
        if (isNaN(percent)) {
            return 0;
        }
        if (referenceSize)
            return (referenceSize * percent) / 100;
        else
            return 0;
    }
    else if (normalized.endsWith("em")) {
        const match = normalized.match(/([+-]?\d+(?:\.\d+)?)em/);
        if (match) {
            return parseFloat(match[1]) * numSize;
        }
    }
    else if (normalized.endsWith("rem")) {
        const match = normalized.match(/([+-]?\d+(?:\.\d+)?)rem/);
        if (match) {
            return parseFloat(match[1]) * numSize;
        }
    }
    else if (normalized.endsWith("vh")) {
        return parseViewSize(normalized, true);
    }
    else if (normalized.endsWith("vw")) {
        return parseViewSize(normalized, false);
    }
    else if (normalized === "thin") {
        return 12;
    }
    else if (normalized === "medium" || normalized === "normal") {
        return 16;
    }
    else if (normalized === "thick") {
        return 20;
    }
    else if (!isNaN(parseFloat(normalized))) {
        return parseFloat(normalized);
    }
    return 0;
}
function convertLUToSUWithUnitType(length, fontSize) {
    if (!fontSize) {
        fontSize = 16;
    }
    let result = { type: "auto", value: 0 };
    if (length === "auto") {
        return result;
    }
    // explicit fr support
    if (typeof length === 'string' && length.trim().toLowerCase().endsWith('fr')) {
        const v = parseFloat(length);
        return { type: "fr", value: isNaN(v) ? 0 : v };
    }
    if (length === "thin") {
        return { type: "px", value: 12 };
    }
    else if (length === "medium") {
        return { type: "px", value: 16 };
    }
    else if (length === "normal") {
        return { type: "px", value: 16 };
    }
    else if (length === "thick") {
        return { type: "px", value: 20 };
    }
    else if (!isNaN(parseFloat(length))) {
        // If it's just a number without units, return it directly
        return { type: "px", value: parseFloat(length) };
    }
    // Match numeric value and unit
    const match = length.match(/^(-?\d*\.?\d+)([a-z%]*)$/);
    if (match) {
        let numValue = (0, utils_1.safeParseFloat)(match[1]);
        const unit = match[2] || "px";
        if (unit === "em" || unit === "rem") {
            numValue = numValue * fontSize; // todo@Caleb196x: 读取font size，如果没有font size，则使用默认值16px
        }
        // todo@Caleb196x: 需要知道父控件的宽度和长度所占像素值，然后根据px值转换成占比值fr
        return { type: unit, value: numValue };
    }
    // Default fallback
    return { type: "fr", value: 1 };
}
function parseScale(scale) {
    if (!scale || scale === "none") {
        return new UE.Vector2D(1, 1);
    }
    if (typeof scale == "number") {
        return new UE.Vector2D(scale, scale);
    }
    else if (typeof scale == "string") {
        const scaleValues = scale.split(" ").map(Number);
        if (scaleValues.length === 1) {
            return new UE.Vector2D(scaleValues[0], scaleValues[0]);
        }
        else if (scaleValues.length === 2) {
            return new UE.Vector2D(scaleValues[0], scaleValues[1]);
        }
    }
    return new UE.Vector2D(1, 1);
}
/**
 * Parses a string representing an aspect ratio and returns a number
 * @param aspectRatio - String representing aspect ratio (e.g., "16/9", "0.5", "1/1")
 * @returns Number representing aspect ratio (e.g., 1.7777777777777777)
 */
function parseAspectRatio(aspectRatio) {
    if (!aspectRatio) {
        return 1.0;
    }
    // Handle decimal format like '0.5'
    if (!isNaN(Number(aspectRatio))) {
        return Number(aspectRatio);
    }
    // Handle ratio format like '16/9' or '1/1'
    const parts = aspectRatio.split("/");
    if (parts.length === 2) {
        const numerator = Number(parts[0]);
        const denominator = Number(parts[1]);
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
            return numerator / denominator;
        }
    }
    return 1.0;
}
//# sourceMappingURL=css_length_parser.js.map