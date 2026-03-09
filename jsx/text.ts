import { parseToLinearColor } from '../parsers/css_color_parser';
import { hasFontStyles, setupFontStyles } from '../parsers/css_font_parser';
import { convertLengthUnitToSlateUnit } from '../parsers/css_length_parser';
import { convertGap, convertPadding } from '../parsers/css_margin_parser';
import { getAllStyles } from '../parsers/cssstyle_parser';
import { JSXConverter } from './jsx_converter';
import { isReactElementInChildren } from '../misc/utils';
import * as UE from 'ue';

/**
 * Checks whether the given type name represents an anchor (<a>) element
 * that should be rendered as a clickable link.
 */
function isAnchorElement(typeName: string): boolean {
    return typeName === 'a';
}

type TextStyleProps = Record<string, any>;

export class TextConverter extends JSXConverter {
    private readonly textFontSetupHandlers: Record<string, (textBlock: UE.TextBlock, prop: any) => void> = {};
    private textWrapBoxSlots: Map<UE.Widget, UE.WrapBoxSlot>;
    private static readonly elementDefaultStyles: Record<string, TextStyleProps> = {
        'text': {
            lineHeight: '1.4',
            color: 'white'
        },
        'span': {
            lineHeight: '1.4',
            color: 'white'
        },
        'label': {
            fontWeight: '600',
            lineHeight: '1.4',
            color: 'white'  
        },
        'p': {
            lineHeight: '1.6',
            marginBottom: '12px',
            color: 'white'
        },
        'a': {
            color: '#1e90ff',
            textDecoration: 'underline',
            lineHeight: '1.4'
        },
        'h1': {
            fontSize: '32px',
            fontWeight: '700',
            lineHeight: '1.25',
            color: 'white'
        },
        'h2': {
            fontSize: '28px',
            fontWeight: '700',
            lineHeight: '1.3',
            color: 'white'
        },
        'h3': {
            fontSize: '24px',
            fontWeight: '600',
            lineHeight: '1.35',
            color: 'white'
        },
        'h4': {
            fontSize: '20px',
            fontWeight: '600',
            lineHeight: '1.4',
            color: 'white'
        },
        'h5': {
            fontSize: '18px',
            fontWeight: '600',
            lineHeight: '1.45',
            color: 'white'
        },
        'h6': {
            fontSize: '16px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            lineHeight: '1.45',
            color: 'white'
        },
        'pre': {
            whiteSpace: 'pre',
            fontFamily: 'monospace',
            lineHeight: '1.4',
            color: 'white'
        }
    };
    private readonly loweredTypeName: string;

    /* ------------------------------------------------------------------ */
    /*  Anchor (<a>) specific state: button wrapper for click handling     */
    /* ------------------------------------------------------------------ */
    private anchorButton?: UE.Button;
    private anchorTextBlock?: UE.TextBlock;
    private anchorClickCallback?: () => void;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
        this.loweredTypeName = (typeName ?? '').toLowerCase();
        this.textFontSetupHandlers = {
            color: (textBlock, prop) => this.setupFontColor(textBlock, prop),
            fontColor: (textBlock, prop) => this.setupFontColor(textBlock, prop),
            textAlign: (textBlock, prop) => this.setupTextAlignment(textBlock, prop),
            textTransform: (textBlock, prop) => this.setupTextTransform(textBlock, prop),
            lineHeight: (textBlock, prop) => this.setupLineHeight(textBlock, prop),
        };
        this.textWrapBoxSlots = new Map();
    }

    private normalizeStyles(props: any): TextStyleProps {
        const styles = getAllStyles(this.typeName, props) ?? {};
        const defaults = TextConverter.elementDefaultStyles[this.loweredTypeName] ?? {};
        const resolved: TextStyleProps = { ...defaults, ...styles };

        if (props) {
            const directKeys = ['color', 'fontColor', 'textAlign', 'textTransform', 'lineHeight'];
            for (const key of directKeys) {
                if (props[key] !== undefined) {
                    resolved[key] = props[key];
                }
            }
        }

        return resolved;
    }

    private setupFontColor(textBlock: UE.TextBlock, prop: any) {
        const fontColor = prop?.color ?? prop?.fontColor;
        if (!fontColor) {
            return;
        }
        const rgba = parseToLinearColor(fontColor);
        const specifiedColor = textBlock.ColorAndOpacity?.SpecifiedColor;
        if (!specifiedColor) {
            return;
        }
        specifiedColor.R = rgba.r;
        specifiedColor.G = rgba.g;
        specifiedColor.B = rgba.b;
        specifiedColor.A = rgba.a;
    }

    private setupTextAlignment(textBlock: UE.TextBlock, prop: any) {
        const textAlignment = prop?.textAlign;
        if (!textAlignment) {
            return;
        }
        switch (textAlignment) {
            case 'center':
                textBlock.Justification = UE.ETextJustify.Center;
                break;
            case 'right':
                textBlock.Justification = UE.ETextJustify.Right;
                break;
            default:
                textBlock.Justification = UE.ETextJustify.Left;
        }
    }

    private setupTextTransform(textBlock: UE.TextBlock, prop: any) {
        const textTransform = prop?.textTransform;
        if (!textTransform) {
            return;
        }
        switch (textTransform) {
            case 'uppercase':
                textBlock.TextTransformPolicy = UE.ETextTransformPolicy.ToUpper;
                break;
            case 'lowercase':
                textBlock.TextTransformPolicy = UE.ETextTransformPolicy.ToLower;
                break;
            default:
                textBlock.TextTransformPolicy = UE.ETextTransformPolicy.None;
        }
    }

    private normalizeLineHeight(lineHeight: any, styleContext: any): number | null {
        if (lineHeight === null || lineHeight === undefined) {
            return null;
        }
        if (typeof lineHeight === 'number') {
            return lineHeight;
        }
        if (typeof lineHeight === 'string' && lineHeight.trim().length > 0) {
            return convertLengthUnitToSlateUnit(lineHeight, styleContext);
        }
        return null;
    }

    private setupLineHeight(textBlock: UE.TextBlock, prop: any) {
        const lineHeight = prop?.lineHeight;
        const resolved = this.normalizeLineHeight(lineHeight, prop);
        if (resolved !== null) {
            textBlock.LineHeightPercentage = resolved;
        }
    }

    private setupWrapBoxProperties(wrapBox: UE.WrapBox, props: any) {
        const styles = getAllStyles(this.typeName, props) ?? {};
        let isVertical = false;

        // Orientation: default horizontal; allow overriding via props.orientation or styles.flexDirection
        const orientationRaw = (props?.orientation || styles?.orientation || styles?.flexDirection || '').toString().toLowerCase();
        if (orientationRaw.includes('vertical') || orientationRaw.includes('column')) {
            wrapBox.Orientation = UE.EOrientation.Orient_Vertical;
            isVertical = true;
        } else {
            wrapBox.Orientation = UE.EOrientation.Orient_Horizontal;
            isVertical = false;
        }

        // Alignment: map textAlign to wrap box horizontal alignment
        const textAlign = styles?.textAlign || props?.textAlign;
        if (textAlign) {
            const v = String(textAlign).toLowerCase();
            if (v === 'center') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
            } else if (v === 'right') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
            } else if (v === 'left') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
            }
        }

        // Padding between items: prefer CSS gap/rowGap/columnGap
        let gapX = 0;
        let gapY = 0;
        if (styles?.gap) {
            const v = convertGap(styles.gap, styles);
            gapX = v?.X ?? 0; // column gap
            gapY = v?.Y ?? 0; // row gap
        }

        if (styles?.padding) {
            const p = convertPadding(styles);
            if (isVertical) {
                gapX = p?.Top ?? 0; // column gap
                gapY = p?.Bottom ?? 0;
            } else {
                gapX = p?.Left ?? 0; // column gap
                gapY = p?.Right ?? 0;
            }
            
        }

        if (styles?.columnGap !== undefined) {
            gapX = convertLengthUnitToSlateUnit(styles.columnGap, styles) || gapX;
        }
        if (styles?.rowGap !== undefined) {
            gapY = convertLengthUnitToSlateUnit(styles.rowGap, styles) || gapY;
        }

        // Apply inner slot padding based on orientation
        if (wrapBox.Orientation === UE.EOrientation.Orient_Horizontal) {
            wrapBox.SetInnerSlotPadding(new UE.Vector2D(gapX, gapY));
        } else {
            wrapBox.SetInnerSlotPadding(new UE.Vector2D(gapY, gapX));
        }
    }

    private isValidTextBlock(textBlock: UE.TextBlock | null | undefined): textBlock is UE.TextBlock {
        if (!textBlock) {
            return false;
        }
        const candidate = textBlock as any;
        if (typeof candidate.IsPendingKill === 'function' && candidate.IsPendingKill()) {
            return false;
        }
        if (typeof candidate.IsValidLowLevelFast === 'function') {
            return candidate.IsValidLowLevelFast();
        }
        if (typeof candidate.IsValidLowLevel === 'function') {
            return candidate.IsValidLowLevel();
        }
        return true;
    }

    private setupTextBlockProperties(textBlock: UE.TextBlock, props: any) {
        if (!this.isValidTextBlock(textBlock)) {
            return;
        }

        const styles = this.normalizeStyles(props);
        const whiteSpace = (styles?.whiteSpace ?? '').toString().toLowerCase();
        const shouldAutoWrap = this.loweredTypeName !== 'pre' && whiteSpace !== 'pre' && whiteSpace !== 'nowrap';
        textBlock.AutoWrapText = shouldAutoWrap;

        if (hasFontStyles(styles)) {
            if (!textBlock.Font) {
                const fontStyles = new UE.SlateFontInfo();
                setupFontStyles(textBlock, fontStyles, styles);
                textBlock.SetFont(fontStyles);
            } else {
                setupFontStyles(textBlock, textBlock.Font, styles);
            }
        }

        for (const key in this.textFontSetupHandlers) {
            if (Object.prototype.hasOwnProperty.call(styles, key)) {
                this.textFontSetupHandlers[key](textBlock, styles);
            }
        }
    }

    private normalizeContent(value: any): string | undefined {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return '';
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.normalizeContent(item) ?? '').join('');
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return String(value);
    }

    private extractTextContent(props: any): string {
        if (!props) {
            return '';
        }

        if (Object.prototype.hasOwnProperty.call(props, 'children')) {
            const normalized = this.normalizeContent(props.children);
            if (normalized !== undefined) {
                return normalized;
            }
        }

        if (Object.prototype.hasOwnProperty.call(props, 'text')) {
            const normalized = this.normalizeContent(props.text);
            if (normalized !== undefined) {
                return normalized;
            }
        }

        return '';
    }

    private applyTextContent(textBlock: UE.TextBlock, content: string) {
        if (!this.isValidTextBlock(textBlock)) {
            return;
        }
        textBlock.SetText(content ?? '');
    }

    /* ================================================================== */
    /*  Anchor (<a>) tag: transparent button wrapping a TextBlock          */
    /* ================================================================== */

    /**
     * Creates a transparent UButton wrapping a TextBlock for anchor elements.
     * Clicking the button opens the href URL or fires the onClick callback.
     */
    private createAnchorWidget(): UE.Widget {
        // Build the text block as usual
        const text = new UE.TextBlock(this.outer);
        this.setupTextBlockProperties(text, this.props);
        const content = this.extractTextContent(this.props);
        this.applyTextContent(text, content);
        this.anchorTextBlock = text;

        // Wrap in a transparent button for click interactivity
        const button = new UE.Button(this.outer);
        this.anchorButton = button;

        // Make button background fully transparent so only text is visible
        const clearBrush = (brush: UE.SlateBrush) => {
            if (!brush) return;
            brush.DrawAs = UE.ESlateBrushDrawType.NoDrawType;
        };
        clearBrush(button.WidgetStyle.Normal);
        clearBrush(button.WidgetStyle.Hovered);
        clearBrush(button.WidgetStyle.Pressed);
        clearBrush(button.WidgetStyle.Disabled);
        button.SetBackgroundColor(new UE.LinearColor(0, 0, 0, 0));

        // Zero out padding so the button hugs the text tightly
        button.WidgetStyle.NormalPadding = new UE.Margin(0, 0, 0, 0);
        button.WidgetStyle.PressedPadding = new UE.Margin(0, 0, 0, 0);

        // Add text as child of the button
        const slot = button.AddChild(text);
        if (slot) {
            if (typeof (slot as any).SetHorizontalAlignment === 'function') {
                (slot as any).SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
            }
            if (typeof (slot as any).SetVerticalAlignment === 'function') {
                (slot as any).SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            }
        }

        // Bind click event: open href URL or fire onClick
        this.bindAnchorClickEvent(button, this.props);

        UE.UMGManager.SynchronizeWidgetProperties(text);
        UE.UMGManager.SynchronizeWidgetProperties(button);

        return button;
    }

    /**
     * Binds the click handler for anchor elements.
     * If href is specified, clicking opens the URL in the system browser.
     * If onClick is specified, it fires as a standard React event handler.
     */
    private bindAnchorClickEvent(button: UE.Button, props: any): void {
        // Remove previous handler if re-binding
        if (this.anchorClickCallback) {
            button.OnClicked.Remove(this.anchorClickCallback);
            this.anchorClickCallback = undefined;
        }

        const href = props?.href;
        const onClick = props?.onClick;
        const target = props?.target;

        this.anchorClickCallback = () => {
            // Fire user-provided onClick handler first
            if (typeof onClick === 'function') {
                try {
                    onClick({ target: { href, tagName: 'a' }, preventDefault: () => {} });
                } catch (e) {
                    console.warn('Anchor onClick handler error:', e);
                }
            }

            // Open URL in system browser when href is present
            if (href && typeof href === 'string') {
                try {
                    UE.KismetSystemLibrary.LaunchURL(href);
                } catch (e) {
                    console.warn('Failed to launch URL:', href, e);
                }
            }
        };

        button.OnClicked.Add(this.anchorClickCallback);
    }

    /**
     * Updates an anchor widget (button + text) with changed props.
     */
    private updateAnchorWidget(widget: UE.Widget, changedProps: any): void {
        // Update the text block within the button
        if (this.anchorTextBlock) {
            this.setupTextBlockProperties(this.anchorTextBlock, changedProps);
            const content = this.extractTextContent(changedProps);
            if (content !== undefined && content !== '') {
                this.applyTextContent(this.anchorTextBlock, content);
            }
        }

        // Re-bind click handler if href or onClick changed
        if (this.anchorButton && (changedProps?.href !== undefined || changedProps?.onClick !== undefined)) {
            this.bindAnchorClickEvent(this.anchorButton, { ...this.props, ...changedProps });
        }
    }

    /* ================================================================== */
    /*  Widget creation entry point                                        */
    /* ================================================================== */

    createNativeWidget() {
        // Anchor (<a>) elements get a transparent button wrapper for click handling
        if (isAnchorElement(this.loweredTypeName) && (this.props?.href || this.props?.onClick)) {
            return this.createAnchorWidget();
        }

        // Label elements with React element children become WrapBox containers
        if (this.props?.children) {
            if (this.typeName === "label" && isReactElementInChildren(this.props.children)) {
                const wrapBox = new UE.WrapBox(this.outer);
                this.setupWrapBoxProperties(wrapBox, this.props);
                return wrapBox;
            }
        }

        // Default: plain TextBlock
        const text = new UE.TextBlock(this.outer);
        this.setupTextBlockProperties(text, this.props);
        const content = this.extractTextContent(this.props);
        this.applyTextContent(text, content);
        UE.UMGManager.SynchronizeWidgetProperties(text);

        return text;
    }

    update(widget: UE.Widget, _oldProps: any, _changedProps: any) {
        // Anchor (<a>) elements with button wrapper
        if (this.anchorButton && widget instanceof UE.Button) {
            this.updateAnchorWidget(widget, _changedProps);
            return;
        }

        if (widget instanceof UE.WrapBox) {
            if (this.props?.children || _changedProps?.children) {
                if ((isReactElementInChildren(this.props.children) 
                    || isReactElementInChildren(_changedProps.children))) 
                {
                    this.setupWrapBoxProperties(widget as UE.WrapBox, _changedProps);
                }
            }
        } else if (widget instanceof UE.TextBlock) {
            const text = widget as UE.TextBlock;
            this.setupTextBlockProperties(text, _changedProps);
            const content = this.extractTextContent(_changedProps);
            this.applyTextContent(text, content);
        }
    }

    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        if (parent instanceof UE.WrapBox) {
            const slot = parent.AddChildToWrapBox(child);
            // slot.bFillEmptySpace = true;
            this.textWrapBoxSlots.set(child, slot);
        }
    }

    removeChild(parent: UE.Widget, child: UE.Widget): void {
        if (parent instanceof UE.WrapBox) {
            this.textWrapBoxSlots.delete(child);
            parent.RemoveChild(child);
        }
    }
}
