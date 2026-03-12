"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSXConverter = void 0;
const UE = require("ue");
const converter_1 = require("../converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
class JSXConverter extends converter_1.ElementConverter {
    nativeSlot;
    proxy;
    widgetStyle;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.proxy = null;
        this.widgetStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props);
    }
    createProxy() {
        const JsxElementConverters = {
            "button": "ButtonConverter",
            "input": "InputJSXConverter",
            "img": "ImageConverter",
            "textarea": "TextAreaConverter",
            "select": "SelectConverter",
            "text": "TextConverter",
            "progress": "ProgressConverter",
            "video": "VideoConverter",
            "audio": "AudioConverter",
            "hr": "HrBrConverter",
            "br": "HrBrConverter"
        };
        const SkipElement = ["option", "style", "script", "link", "meta"];
        let type = this.typeName;
        const textKeywords = [
            "text", "span", "p", "label", "a",
            "h1", "h2", "h3", "h4", "h5", "h6",
            // Inline formatting elements
            "strong", "b", "em", "i", "u", "s", "code", "mark", "small", "sub", "sup"
        ];
        if (textKeywords.includes(this.typeName)) {
            type = "text";
        }
        if (SkipElement.includes(type)) {
            return null;
        }
        // Module path overrides: multiple element types share a single module file
        const modulePathOverrides = {
            'br': 'hr', // <br> shares the HrBrConverter from hr.ts
        };
        if (JsxElementConverters.hasOwnProperty(type)) {
            const modulePath = modulePathOverrides[type] ?? type;
            const Module = require(`./${modulePath}`);
            if (Module) {
                const ClassName = JsxElementConverters[type];
                return new Module[ClassName](this.typeName, this.props, this.outer);
            }
        }
        return null;
    }
    createNativeWidget() {
        if (!this.proxy) {
            this.proxy = this.createProxy();
        }
        if (this.proxy) {
            return this.proxy.createNativeWidget();
        }
        return null;
    }
    update(widget, oldProps, changedProps) {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (parent instanceof UE.PanelWidget) {
            const nativeSlot = parent.AddChild(child);
            this.nativeSlot = nativeSlot;
        }
        if (this.proxy) {
            this.proxy.appendChild(parent, child, childTypeName, childProps);
        }
    }
    removeChild(parent, child) {
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
    dispose() {
        // Let the proxied converter release any internal resources
        // (e.g. VideoConverter / AudioConverter media pipeline cleanup)
        if (this.proxy && typeof this.proxy.dispose === 'function') {
            this.proxy.dispose();
        }
        super.dispose();
    }
}
exports.JSXConverter = JSXConverter;
//# sourceMappingURL=jsx_converter.js.map