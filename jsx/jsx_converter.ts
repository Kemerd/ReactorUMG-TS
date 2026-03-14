import * as UE from "ue";
import { ElementConverter } from "../converter";
import { getAllStyles } from "../parsers/cssstyle_parser";
import { hasFontStyles, setupFontStyles, parseTextShadow } from "../parsers/css_font_parser";
import { parseToLinearColor } from "../parsers/css_color_parser";
import { convertLengthUnitToSlateUnit } from "../parsers/css_length_parser";
import { queueWidgetSync } from "../perf/batch_sync";

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

        // Propagate the parent element's typographic styles (fontSize, color,
        // textTransform, etc.) to inline text-instance children.  Without this,
        // a TextBlock created by createTextInstance inside e.g. <button> would
        // render at UMG's default font size instead of inheriting the button's
        // CSS font properties — mirroring what ContainerConverter already does.
        if (childProps && childProps["_children_text_instance"]) {
            this._applyTextInstanceStyles(child);
        }
    }

    removeChild(parent: UE.Widget, child: UE.Widget) {
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }

    /**
     * Applies this element's resolved CSS styles (font, color, alignment, etc.)
     * to an inline text-instance child TextBlock.  Mirrors the identical method
     * in ContainerConverter so that JSX components like <button>, <label>, etc.
     * correctly inherit typographic properties onto their text children.
     */
    private _applyTextInstanceStyles(child: UE.Widget): void {
        if (!(child instanceof UE.TextBlock)) return;

        const styles = this.widgetStyle ?? {};

        // Font family / size / weight / outline / spacing
        if (hasFontStyles(styles)) {
            if (!child.Font) {
                const fontStyles = new UE.SlateFontInfo();
                setupFontStyles(child, fontStyles, styles);
                child.SetFont(fontStyles);
            } else {
                setupFontStyles(child, child.Font, styles);
            }
        }

        // Color — prefer explicit color from this element's CSS
        const fontColor = styles?.color ?? styles?.fontColor;
        if (fontColor) {
            const rgba = parseToLinearColor(fontColor);
            const specifiedColor = child.ColorAndOpacity?.SpecifiedColor;
            if (specifiedColor) {
                specifiedColor.R = rgba.r;
                specifiedColor.G = rgba.g;
                specifiedColor.B = rgba.b;
                specifiedColor.A = rgba.a;
            }
        }

        // Text alignment
        const textAlign = styles?.textAlign;
        if (textAlign) {
            const v = String(textAlign).toLowerCase();
            if (v === 'center') {
                child.Justification = UE.ETextJustify.Center;
            } else if (v === 'right') {
                child.Justification = UE.ETextJustify.Right;
            } else {
                child.Justification = UE.ETextJustify.Left;
            }
        }

        // Text transform (uppercase / lowercase / none)
        const textTransform = styles?.textTransform;
        if (textTransform) {
            const v = String(textTransform).toLowerCase();
            if (v === 'uppercase') {
                child.TextTransformPolicy = UE.ETextTransformPolicy.ToUpper;
            } else if (v === 'lowercase') {
                child.TextTransformPolicy = UE.ETextTransformPolicy.ToLower;
            } else {
                child.TextTransformPolicy = UE.ETextTransformPolicy.None;
            }
        }

        // Line height
        const lineHeight: any = styles?.lineHeight;
        if (lineHeight !== undefined && lineHeight !== null) {
            let resolved: number | null = null;
            if (typeof lineHeight === 'number') {
                resolved = lineHeight;
            } else if (typeof lineHeight === 'string' && lineHeight.trim().length > 0) {
                resolved = convertLengthUnitToSlateUnit(lineHeight, styles) as any;
            }
            if (resolved !== null && resolved !== undefined) {
                child.LineHeightPercentage = resolved as number;
            }
        }

        // Text shadow
        const textShadow = styles?.textShadow;
        if (textShadow) {
            const parsed = parseTextShadow(textShadow, styles);
            if (parsed) {
                child.SetShadowOffset(new UE.Vector2D(parsed.offsetX, parsed.offsetY));
                if (parsed.color) {
                    child.SetShadowColorAndOpacity(
                        new UE.LinearColor(parsed.color.r, parsed.color.g, parsed.color.b, parsed.color.a)
                    );
                } else {
                    child.SetShadowColorAndOpacity(new UE.LinearColor(0, 0, 0, 0.5));
                }
            }
        }

        // Letter spacing
        const letterSpacing = styles?.letterSpacing;
        if (letterSpacing !== undefined && letterSpacing !== null) {
            const value = convertLengthUnitToSlateUnit(String(letterSpacing), styles);
            if (value && !isNaN(value)) {
                if (child.Font) {
                    child.Font.LetterSpacing = Math.round(value);
                }
            }
        }

        // Text overflow policy (ellipsis / clip)
        const textOverflow = styles?.textOverflow;
        if (textOverflow) {
            const normalized = String(textOverflow).toLowerCase().trim();
            if (normalized === 'ellipsis') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Ellipsis);
            } else if (normalized === 'clip') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Clip);
            }
        }

        // Word break / overflow wrap
        const wordBreak = styles?.wordBreak ?? styles?.overflowWrap;
        if (wordBreak) {
            const normalized = String(wordBreak).toLowerCase().trim();
            if (normalized === 'break-all' || normalized === 'break-word') {
                child.AutoWrapText = true;
            } else if (normalized === 'keep-all' || normalized === 'nowrap') {
                child.AutoWrapText = false;
            }
        }

        queueWidgetSync(child);
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
