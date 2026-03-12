"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextAreaConverter = void 0;
const UE = require("ue");
const jsx_converter_1 = require("./jsx_converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_font_parser_1 = require("../parsers/css_font_parser");
const css_color_parser_1 = require("../parsers/css_color_parser");
const batch_sync_1 = require("../perf/batch_sync");
class TextAreaConverter extends jsx_converter_1.JSXConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    propertySetters = {
        'value': (widget, value) => {
            if (value !== undefined && value !== null) {
                widget.SetText(value);
            }
        },
        'defaultValue': (widget, value) => {
            if (value !== undefined && value !== null) {
                widget.SetText(value);
            }
        },
        'placeholder': (widget, value) => {
            if (value !== undefined && value !== null) {
                widget.SetHintText(value);
            }
        },
        'readOnly': (widget, value) => {
            if (value !== undefined && value !== null) {
                widget.SetIsReadOnly(!!value);
            }
        },
        'disabled': (widget, value) => {
            if (value !== undefined && value !== null) {
                widget.SetIsEnabled(!value);
            }
        }
    };
    eventHandlers = {
        'onChange': {
            event: 'OnTextChanged',
            setup: (widget, handler) => {
                const callback = (text) => handler({ target: { value: text } });
                widget.OnTextChanged.Add(callback);
                return callback;
            }
        },
        'onSubmit': {
            event: 'OnTextCommitted',
            setup: (widget, handler) => {
                const callback = (text, commitMethod) => {
                    if (commitMethod === UE.ETextCommit.Default) {
                        handler({ target: text });
                    }
                };
                widget.OnTextCommitted.Add(callback);
                return callback;
            }
        },
        'onBlur': {
            event: 'OnTextCommitted',
            setup: (widget, handler) => {
                const callback = (text, commitMethod) => {
                    if (commitMethod === UE.ETextCommit.OnUserMovedFocus) {
                        handler({ target: { value: text } });
                    }
                };
                widget.OnTextCommitted.Add(callback);
                return callback;
            }
        }
    };
    eventCallbacks = {};
    applyStyles(textArea, props) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props) ?? {};
        if ((0, css_font_parser_1.hasFontStyles)(styles)) {
            const existingFont = textArea.GetFont?.();
            if (existingFont) {
                (0, css_font_parser_1.setupFontStyles)(textArea, existingFont, styles);
                textArea.SetFont(existingFont);
            }
            else {
                const font = new UE.SlateFontInfo();
                (0, css_font_parser_1.setupFontStyles)(textArea, font, styles);
                textArea.SetFont(font);
            }
        }
        const fontColor = styles?.color ?? styles?.fontColor;
        if (fontColor && textArea.WidgetStyle && textArea.WidgetStyle.ColorAndOpacity) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(fontColor);
            textArea.WidgetStyle.ColorAndOpacity.SpecifiedColor.R = rgba.r;
            textArea.WidgetStyle.ColorAndOpacity.SpecifiedColor.G = rgba.g;
            textArea.WidgetStyle.ColorAndOpacity.SpecifiedColor.B = rgba.b;
            textArea.WidgetStyle.ColorAndOpacity.SpecifiedColor.A = rgba.a;
        }
    }
    initTextAreaProps(textArea, props) {
        let propsInit = false;
        // Apply properties
        for (const [key, setter] of Object.entries(this.propertySetters)) {
            if (key in props) {
                setter(textArea, props[key]);
                propsInit = true;
            }
        }
        // Setup event handlers
        for (const [key, handler] of Object.entries(this.eventHandlers)) {
            const existingCallback = this.eventCallbacks[key];
            if (existingCallback) {
                const eventDelegate = textArea[handler.event];
                if (eventDelegate && typeof eventDelegate.Remove === 'function') {
                    eventDelegate.Remove(existingCallback);
                }
                this.eventCallbacks[key] = undefined;
            }
            if (typeof props[key] === 'function') {
                this.eventCallbacks[key] = handler.setup(textArea, props[key]);
                propsInit = true;
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const textArea = new UE.MultiLineEditableText(this.outer);
        this.initTextAreaProps(textArea, this.props);
        this.applyStyles(textArea, this.props);
        (0, batch_sync_1.queueWidgetSync)(textArea);
        return textArea;
    }
    update(widget, oldProps, changedProps) {
        const textArea = widget;
        const propsChanged = this.initTextAreaProps(textArea, changedProps);
        const styleChanged = !!changedProps && (('style' in changedProps) || ('className' in changedProps) || ('id' in changedProps));
        if (propsChanged || styleChanged) {
            this.applyStyles(textArea, changedProps);
            (0, batch_sync_1.queueWidgetSync)(textArea);
        }
    }
}
exports.TextAreaConverter = TextAreaConverter;
//# sourceMappingURL=textarea.js.map