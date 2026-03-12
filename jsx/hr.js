"use strict";
/**
 * Converter for <hr> and <br> HTML elements.
 *
 * <hr> renders as a Border widget with 1px height and full width,
 * functioning as a horizontal rule / divider line.
 *
 * <br> renders as a Spacer widget with a configurable height gap
 * (defaults to ~16px, roughly one line height).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrBrConverter = void 0;
const UE = require("ue");
const jsx_converter_1 = require("./jsx_converter");
const css_color_parser_1 = require("../parsers/css_color_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const batch_sync_1 = require("../perf/batch_sync");
class HrBrConverter extends jsx_converter_1.JSXConverter {
    loweredTypeName;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.loweredTypeName = (typeName ?? '').toLowerCase();
    }
    createNativeWidget() {
        if (this.loweredTypeName === 'hr') {
            return this.createHorizontalRule();
        }
        if (this.loweredTypeName === 'br') {
            return this.createLineBreak();
        }
        return null;
    }
    /**
     * Creates a horizontal rule: a Border widget with 1px height
     * and a subtle gray color. Respects CSS overrides for color,
     * height, margin, etc. via the style prop.
     */
    createHorizontalRule() {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props) ?? {};
        // Create a SizeBox to enforce the exact height
        const sizeBox = new UE.SizeBox(this.outer);
        const height = styles.height
            ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(styles.height, styles)
            : 1;
        sizeBox.SetHeightOverride(height);
        // Create the visible border line inside the size box
        const border = new UE.Border(this.outer);
        // Default HR color: semi-transparent white (like a subtle divider)
        const color = styles.borderColor ?? styles.backgroundColor ?? styles.color ?? 'rgba(255,255,255,0.3)';
        const rgba = (0, css_color_parser_1.parseToLinearColor)(color);
        border.SetBrushColor(new UE.LinearColor(rgba.r, rgba.g, rgba.b, rgba.a));
        sizeBox.AddChild(border);
        (0, batch_sync_1.queueWidgetSync)(border);
        (0, batch_sync_1.queueWidgetSync)(sizeBox);
        return sizeBox;
    }
    /**
     * Creates a line break: a Spacer widget with configurable height.
     * Default height is ~16px (one line).
     */
    createLineBreak() {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props) ?? {};
        const spacer = new UE.Spacer(this.outer);
        const height = styles.height
            ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(styles.height, styles)
            : 16;
        spacer.SetSize(new UE.Vector2D(0, height));
        (0, batch_sync_1.queueWidgetSync)(spacer);
        return spacer;
    }
    update(widget, _oldProps, _changedProps) {
        // HR and BR are typically static; no-op for updates
    }
    appendChild(_parent, _child, _childTypeName, _childProps) {
        // HR and BR are void elements, no children
    }
    removeChild(_parent, _child) {
        // No-op
    }
}
exports.HrBrConverter = HrBrConverter;
//# sourceMappingURL=hr.js.map