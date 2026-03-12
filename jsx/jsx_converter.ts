import * as UE from "ue";
import { ElementConverter } from "../converter";
import { getAllStyles } from "../parsers/cssstyle_parser";

export class JSXConverter extends ElementConverter {
    private nativeSlot: UE.PanelSlot;
    private proxy: ElementConverter;
    widgetStyle: any;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);

        this.proxy = null;
        this.widgetStyle = getAllStyles(this.typeName, this.props);
    }

    private createProxy(): ElementConverter {
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
        const modulePathOverrides: Record<string, string> = {
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

    update(widget: UE.Widget, oldProps: any, changedProps: any) {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
        }
    }

    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any) {
        if (parent instanceof UE.PanelWidget) {
            const nativeSlot = parent.AddChild(child);
            
            this.nativeSlot = nativeSlot;
        }

        if (this.proxy) {
            this.proxy.appendChild(parent, child, childTypeName, childProps);
        }
    }

    removeChild(parent: UE.Widget, child: UE.Widget) {
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }

    dispose(): void {
        // Let the proxied converter release any internal resources
        // (e.g. VideoConverter / AudioConverter media pipeline cleanup)
        if (this.proxy && typeof this.proxy.dispose === 'function') {
            this.proxy.dispose();
        }
        super.dispose();
    }
}
