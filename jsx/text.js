"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextConverter = void 0;
const css_color_parser_1 = require("../parsers/css_color_parser");
const css_font_parser_1 = require("../parsers/css_font_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const css_margin_parser_1 = require("../parsers/css_margin_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const jsx_converter_1 = require("./jsx_converter");
const utils_1 = require("../misc/utils");
const batch_sync_1 = require("../perf/batch_sync");
const UE = require("ue");
/**
 * Checks whether the given type name represents an anchor (<a>) element
 * that should be rendered as a clickable link.
 */
function isAnchorElement(typeName) {
    return typeName === 'a';
}
class TextConverter extends jsx_converter_1.JSXConverter {
    textFontSetupHandlers = {};
    textWrapBoxSlots;
    static elementDefaultStyles = {
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
        },
        // Inline formatting elements with appropriate default styles
        'strong': {
            fontWeight: '700',
            lineHeight: '1.4',
            color: 'white'
        },
        'b': {
            fontWeight: '700',
            lineHeight: '1.4',
            color: 'white'
        },
        'em': {
            fontStyle: 'italic',
            lineHeight: '1.4',
            color: 'white'
        },
        'i': {
            fontStyle: 'italic',
            lineHeight: '1.4',
            color: 'white'
        },
        'u': {
            textDecoration: 'underline',
            lineHeight: '1.4',
            color: 'white'
        },
        's': {
            textDecoration: 'line-through',
            lineHeight: '1.4',
            color: 'white'
        },
        'code': {
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.4',
            color: 'white'
        },
        'mark': {
            lineHeight: '1.4',
            color: 'black'
        },
        'small': {
            fontSize: '12px',
            lineHeight: '1.4',
            color: 'white'
        },
        'sub': {
            fontSize: '12px',
            lineHeight: '1.0',
            color: 'white'
        },
        'sup': {
            fontSize: '12px',
            lineHeight: '1.0',
            color: 'white'
        }
    };
    loweredTypeName;
    /* ------------------------------------------------------------------ */
    /*  Anchor (<a>) specific state: button wrapper for click handling     */
    /* ------------------------------------------------------------------ */
    anchorButton;
    anchorTextBlock;
    anchorClickCallback;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.loweredTypeName = (typeName ?? '').toLowerCase();
        this.textFontSetupHandlers = {
            color: (textBlock, prop) => this.setupFontColor(textBlock, prop),
            fontColor: (textBlock, prop) => this.setupFontColor(textBlock, prop),
            textAlign: (textBlock, prop) => this.setupTextAlignment(textBlock, prop),
            textTransform: (textBlock, prop) => this.setupTextTransform(textBlock, prop),
            lineHeight: (textBlock, prop) => this.setupLineHeight(textBlock, prop),
            textShadow: (textBlock, prop) => this.setupTextShadow(textBlock, prop),
            textDecoration: (textBlock, prop) => this.setupTextDecoration(textBlock, prop),
            textOverflow: (textBlock, prop) => this.setupTextOverflow(textBlock, prop),
            wordBreak: (textBlock, prop) => this.setupWordBreak(textBlock, prop),
            overflowWrap: (textBlock, prop) => this.setupWordBreak(textBlock, prop),
        };
        this.textWrapBoxSlots = new Map();
    }
    normalizeStyles(props) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props) ?? {};
        const defaults = TextConverter.elementDefaultStyles[this.loweredTypeName] ?? {};
        const resolved = { ...defaults, ...styles };
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
    setupFontColor(textBlock, prop) {
        const fontColor = prop?.color ?? prop?.fontColor;
        if (!fontColor) {
            return;
        }
        const rgba = (0, css_color_parser_1.parseToLinearColor)(fontColor);
        const specifiedColor = textBlock.ColorAndOpacity?.SpecifiedColor;
        if (!specifiedColor) {
            return;
        }
        specifiedColor.R = rgba.r;
        specifiedColor.G = rgba.g;
        specifiedColor.B = rgba.b;
        specifiedColor.A = rgba.a;
    }
    setupTextAlignment(textBlock, prop) {
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
    setupTextTransform(textBlock, prop) {
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
    normalizeLineHeight(lineHeight, styleContext) {
        if (lineHeight === null || lineHeight === undefined) {
            return null;
        }
        if (typeof lineHeight === 'number') {
            return lineHeight;
        }
        if (typeof lineHeight === 'string' && lineHeight.trim().length > 0) {
            return (0, css_length_parser_1.convertLengthUnitToSlateUnit)(lineHeight, styleContext);
        }
        return null;
    }
    setupLineHeight(textBlock, prop) {
        const lineHeight = prop?.lineHeight;
        const resolved = this.normalizeLineHeight(lineHeight, prop);
        if (resolved !== null) {
            textBlock.LineHeightPercentage = resolved;
        }
    }
    /**
     * Applies CSS text-shadow to the TextBlock's native shadow properties.
     * UMG TextBlock supports a single shadow layer with offset + color.
     */
    setupTextShadow(textBlock, prop) {
        const textShadow = prop?.textShadow;
        if (!textShadow) {
            return;
        }
        const parsed = (0, css_font_parser_1.parseTextShadow)(textShadow, prop);
        if (!parsed) {
            return;
        }
        // Apply shadow offset (UMG uses Vector2D for shadow position)
        textBlock.SetShadowOffset(new UE.Vector2D(parsed.offsetX, parsed.offsetY));
        // Apply shadow color and opacity
        if (parsed.color) {
            textBlock.SetShadowColorAndOpacity(new UE.LinearColor(parsed.color.r, parsed.color.g, parsed.color.b, parsed.color.a));
        }
        else {
            // Default shadow color: semi-transparent black
            textBlock.SetShadowColorAndOpacity(new UE.LinearColor(0, 0, 0, 0.5));
        }
    }
    /**
     * Applies CSS text-decoration to the TextBlock's style brushes.
     * Maps underline -> UnderlineBrush, line-through -> StrikeBrush.
     * UMG uses SlateBrush for these; we create a simple solid white brush
     * that gets tinted by the text color.
     */
    setupTextDecoration(textBlock, prop) {
        const textDecoration = prop?.textDecoration;
        if (!textDecoration) {
            return;
        }
        const normalized = String(textDecoration).toLowerCase();
        // Build a simple 1px solid brush for decoration lines
        const makeDecorationBrush = () => {
            const brush = new UE.SlateBrush();
            brush.DrawAs = UE.ESlateBrushDrawType.Image;
            return brush;
        };
        // Check for underline
        if (normalized.includes('underline')) {
            const style = textBlock.WidgetStyle ?? textBlock.DefaultTextStyle;
            if (style && style.UnderlineBrush !== undefined) {
                style.UnderlineBrush = makeDecorationBrush();
            }
        }
        // Check for line-through (strikethrough)
        if (normalized.includes('line-through')) {
            const style = textBlock.WidgetStyle ?? textBlock.DefaultTextStyle;
            if (style && style.StrikeBrush !== undefined) {
                style.StrikeBrush = makeDecorationBrush();
            }
        }
        // "none" clears both decoration brushes
        if (normalized === 'none') {
            const style = textBlock.WidgetStyle ?? textBlock.DefaultTextStyle;
            if (style) {
                if (style.UnderlineBrush !== undefined) {
                    style.UnderlineBrush = new UE.SlateBrush();
                    style.UnderlineBrush.DrawAs = UE.ESlateBrushDrawType.NoDrawType;
                }
                if (style.StrikeBrush !== undefined) {
                    style.StrikeBrush = new UE.SlateBrush();
                    style.StrikeBrush.DrawAs = UE.ESlateBrushDrawType.NoDrawType;
                }
            }
        }
    }
    /**
     * Applies CSS text-overflow to UMG's native overflow policy.
     * Maps ellipsis -> Ellipsis, clip -> Clip. UMG also supports
     * MultilineEllipsis for multi-line truncation.
     */
    setupTextOverflow(textBlock, prop) {
        const textOverflow = prop?.textOverflow;
        if (!textOverflow) {
            return;
        }
        const normalized = String(textOverflow).toLowerCase().trim();
        switch (normalized) {
            case 'ellipsis':
                textBlock.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Ellipsis);
                break;
            case 'clip':
                textBlock.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Clip);
                break;
            default:
                textBlock.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Clip);
                break;
        }
    }
    /**
     * Applies CSS word-break / overflow-wrap to UMG's text wrapping behavior.
     * break-all / break-word -> force wrap, keep-all / nowrap -> no wrap,
     * normal -> auto wrap (default behavior).
     */
    setupWordBreak(textBlock, prop) {
        const wordBreak = prop?.wordBreak ?? prop?.overflowWrap;
        if (!wordBreak) {
            return;
        }
        const normalized = String(wordBreak).toLowerCase().trim();
        switch (normalized) {
            case 'break-all':
            case 'break-word':
                // Force wrapping at any character boundary
                textBlock.AutoWrapText = true;
                break;
            case 'keep-all':
            case 'nowrap':
                textBlock.AutoWrapText = false;
                break;
            case 'normal':
            default:
                // Use the element-type default (auto-wrap for most, no-wrap for pre)
                textBlock.AutoWrapText = this.loweredTypeName !== 'pre';
                break;
        }
    }
    setupWrapBoxProperties(wrapBox, props) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props) ?? {};
        let isVertical = false;
        // Orientation: default horizontal; allow overriding via props.orientation or styles.flexDirection
        const orientationRaw = (props?.orientation || styles?.orientation || styles?.flexDirection || '').toString().toLowerCase();
        if (orientationRaw.includes('vertical') || orientationRaw.includes('column')) {
            wrapBox.Orientation = UE.EOrientation.Orient_Vertical;
            isVertical = true;
        }
        else {
            wrapBox.Orientation = UE.EOrientation.Orient_Horizontal;
            isVertical = false;
        }
        // Alignment: map textAlign to wrap box horizontal alignment
        const textAlign = styles?.textAlign || props?.textAlign;
        if (textAlign) {
            const v = String(textAlign).toLowerCase();
            if (v === 'center') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
            }
            else if (v === 'right') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
            }
            else if (v === 'left') {
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
            }
        }
        // Padding between items: prefer CSS gap/rowGap/columnGap
        let gapX = 0;
        let gapY = 0;
        if (styles?.gap) {
            const v = (0, css_margin_parser_1.convertGap)(styles.gap, styles);
            gapX = v?.X ?? 0; // column gap
            gapY = v?.Y ?? 0; // row gap
        }
        if (styles?.padding) {
            const p = (0, css_margin_parser_1.convertPadding)(styles);
            if (isVertical) {
                gapX = p?.Top ?? 0; // column gap
                gapY = p?.Bottom ?? 0;
            }
            else {
                gapX = p?.Left ?? 0; // column gap
                gapY = p?.Right ?? 0;
            }
        }
        if (styles?.columnGap !== undefined) {
            gapX = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(styles.columnGap, styles) || gapX;
        }
        if (styles?.rowGap !== undefined) {
            gapY = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(styles.rowGap, styles) || gapY;
        }
        // Apply inner slot padding based on orientation
        if (wrapBox.Orientation === UE.EOrientation.Orient_Horizontal) {
            wrapBox.SetInnerSlotPadding(new UE.Vector2D(gapX, gapY));
        }
        else {
            wrapBox.SetInnerSlotPadding(new UE.Vector2D(gapY, gapX));
        }
    }
    isValidTextBlock(textBlock) {
        if (!textBlock) {
            return false;
        }
        const candidate = textBlock;
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
    setupTextBlockProperties(textBlock, props) {
        if (!this.isValidTextBlock(textBlock)) {
            return;
        }
        const styles = this.normalizeStyles(props);
        const whiteSpace = (styles?.whiteSpace ?? '').toString().toLowerCase();
        const shouldAutoWrap = this.loweredTypeName !== 'pre' && whiteSpace !== 'pre' && whiteSpace !== 'nowrap';
        textBlock.AutoWrapText = shouldAutoWrap;
        if ((0, css_font_parser_1.hasFontStyles)(styles)) {
            if (!textBlock.Font) {
                const fontStyles = new UE.SlateFontInfo();
                (0, css_font_parser_1.setupFontStyles)(textBlock, fontStyles, styles);
                textBlock.SetFont(fontStyles);
            }
            else {
                (0, css_font_parser_1.setupFontStyles)(textBlock, textBlock.Font, styles);
            }
        }
        for (const key in this.textFontSetupHandlers) {
            if (Object.prototype.hasOwnProperty.call(styles, key)) {
                this.textFontSetupHandlers[key](textBlock, styles);
            }
        }
    }
    normalizeContent(value) {
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
    extractTextContent(props) {
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
    applyTextContent(textBlock, content) {
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
    createAnchorWidget() {
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
        const clearBrush = (brush) => {
            if (!brush)
                return;
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
            if (typeof slot.SetHorizontalAlignment === 'function') {
                slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
            }
            if (typeof slot.SetVerticalAlignment === 'function') {
                slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            }
        }
        // Bind click event: open href URL or fire onClick
        this.bindAnchorClickEvent(button, this.props);
        (0, batch_sync_1.queueWidgetSync)(text);
        (0, batch_sync_1.queueWidgetSync)(button);
        return button;
    }
    /**
     * Binds the click handler for anchor elements.
     * If href is specified, clicking opens the URL in the system browser.
     * If onClick is specified, it fires as a standard React event handler.
     */
    bindAnchorClickEvent(button, props) {
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
                    onClick({ target: { href, tagName: 'a' }, preventDefault: () => { } });
                }
                catch (e) {
                    console.warn('Anchor onClick handler error:', e);
                }
            }
            // Open URL in system browser when href is present
            if (href && typeof href === 'string') {
                try {
                    UE.KismetSystemLibrary.LaunchURL(href);
                }
                catch (e) {
                    console.warn('Failed to launch URL:', href, e);
                }
            }
        };
        button.OnClicked.Add(this.anchorClickCallback);
    }
    /**
     * Updates an anchor widget (button + text) with changed props.
     */
    updateAnchorWidget(widget, changedProps) {
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
            if (this.typeName === "label" && (0, utils_1.isReactElementInChildren)(this.props.children)) {
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
        (0, batch_sync_1.queueWidgetSync)(text);
        return text;
    }
    update(widget, _oldProps, _changedProps) {
        // Anchor (<a>) elements with button wrapper
        if (this.anchorButton && widget instanceof UE.Button) {
            this.updateAnchorWidget(widget, _changedProps);
            return;
        }
        if (widget instanceof UE.WrapBox) {
            if (this.props?.children || _changedProps?.children) {
                if (((0, utils_1.isReactElementInChildren)(this.props.children)
                    || (0, utils_1.isReactElementInChildren)(_changedProps.children))) {
                    this.setupWrapBoxProperties(widget, _changedProps);
                }
            }
        }
        else if (widget instanceof UE.TextBlock) {
            const text = widget;
            this.setupTextBlockProperties(text, _changedProps);
            const content = this.extractTextContent(_changedProps);
            this.applyTextContent(text, content);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (parent instanceof UE.WrapBox) {
            const slot = parent.AddChildToWrapBox(child);
            // slot.bFillEmptySpace = true;
            this.textWrapBoxSlots.set(child, slot);
        }
    }
    removeChild(parent, child) {
        if (parent instanceof UE.WrapBox) {
            this.textWrapBoxSlots.delete(child);
            parent.RemoveChild(child);
        }
    }
}
exports.TextConverter = TextConverter;
//# sourceMappingURL=text.js.map