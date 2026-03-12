"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerConverter = void 0;
const UE = require("ue");
const converter_1 = require("../converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_margin_parser_1 = require("../parsers/css_margin_parser");
const css_background_parser_1 = require("../parsers/css_background_parser");
const css_gradient_parser_1 = require("../parsers/css_gradient_parser");
const css_color_parser_1 = require("../parsers/css_color_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const utils_1 = require("../misc/utils");
const alignment_parser_1 = require("../parsers/alignment_parser");
const css_font_parser_1 = require("../parsers/css_font_parser");
const css_border_parser_1 = require("../parsers/css_border_parser");
const css_filter_parser_1 = require("../parsers/css_filter_parser");
const batch_sync_1 = require("../perf/batch_sync");
/**
 * Base class for all container (panel) converters. Implements shared
 * functionality for layout parameter conversion, background/size/scale
 * wrapping, and the lazy-slot optimisation that defers expensive slot
 * configuration for children whose initial visibility is Collapsed.
 */
class ContainerConverter extends converter_1.ElementConverter {
    containerType;
    containerStyle;
    proxy;
    originalWidget;
    externalSlot; // 保存外部添加的容器slot
    sizeBoxWidget; // 保存sizebox容器
    scaleBoxWidget; // 保存scalebox容器
    borderWidget; // 保存border容器
    /**
     * Overlay wrapper for position:relative containers. In CSS, position:relative
     * does NOT change layout mode — a flex container stays flex. It only creates
     * a stacking context so absolute-positioned children can layer on top of the
     * normal flow. We implement this by wrapping the flow layout widget in an
     * Overlay: the flex/grid goes in as the first child (Fill), and any
     * position:absolute children are added as subsequent overlay layers.
     */
    _relativeOverlay = null;
    /**
     * Tracks which child widgets were routed to the _relativeOverlay instead
     * of the flow layout proxy. Used by removeChild to know where to detach.
     */
    _absoluteOverlayChildren = new Set();
    /**
     * Children whose slot configuration was deferred because they were
     * Collapsed at mount time.  Keyed by the native child widget so we
     * can match them later when visibility changes.
     */
    _deferredSlots = new Map();
    childConverters;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.containerStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props);
        this.containerType = this.parseContainerType(this.typeName);
        this.externalSlot = null;
        this.childConverters = {
            "flex": "FlexConverter",
            "grid": "GridConverter",
            "canvas": "CanvasConverter",
            "overlay": "OverlayConverter",
            "uniformgrid": "UniformGridConverter",
        };
    }
    createProxy() {
        if (this.childConverters[this.containerType]) {
            const Module = require(`./${this.containerType}`);
            if (Module) {
                const className = this.childConverters[this.containerType];
                return new Module[className](this.typeName, this.props, this.outer);
            }
        }
        return null;
    }
    /**
     * Maps a container element type + its CSS display/position properties
     * to the appropriate UMG container type.
     *
     * Mapping logic:
     *   display: grid            -> GridConverter
     *   position: absolute/fixed -> CanvasConverter  (removed from flow)
     *   position: relative       -> FlexConverter    (normal flow; overlay wrapper
     *                               is added in createNativeWidget to support
     *                               absolute-positioned children layered on top)
     *   position: static (default) -> FlexConverter  (normal document flow)
     *
     * IMPORTANT: position:relative does NOT change the layout mode. In CSS,
     * a flex container with position:relative is still a flex container — it
     * just creates a new stacking context for absolute children.
     */
    parseContainerType(type) {
        const normalizedType = (type || '').toLowerCase();
        // All of these semantic/structural elements map to div-like flex containers
        const semanticDivs = [
            'form', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside',
            // List elements: vertical stacking containers
            'ul', 'ol', 'li',
            // Table elements: use flex for basic row/cell layout
            'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
            // Structural block elements
            'blockquote', 'figure', 'figcaption', 'details', 'summary', 'dialog',
            'fieldset', 'legend', 'dl', 'dt', 'dd'
        ];
        if (normalizedType === 'div' || semanticDivs.includes(normalizedType)) {
            const display = this.containerStyle?.display || 'flex';
            if (display === 'grid') {
                return 'grid';
            }
            // Only position:absolute/fixed changes the container strategy to canvas.
            // position:relative keeps the display-based layout (flex/grid) and the
            // overlay wrapper for absolute children is handled separately.
            const position = (this.containerStyle?.position || 'static').toString().trim().toLowerCase();
            if (position === 'absolute' || position === 'fixed') {
                return 'canvas';
            }
            return 'flex';
        }
        else {
            return normalizedType;
        }
    }
    setupBackground(widget, borderWidget, updateProps) {
        let style = this.containerStyle;
        if (updateProps) {
            style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, updateProps);
        }
        const background = style?.background;
        const backgroundColor = style?.backgroundColor;
        const backgroundImage = style?.backgroundImage;
        const backgroundPosition = style?.backgroundPosition;
        // Check if we have any border/border-radius/box-shadow CSS properties too
        const borderOutline = (0, css_border_parser_1.processBorderStyles)(style);
        const boxShadow = (0, css_border_parser_1.parseBoxShadow)(style?.boxShadow, style);
        const usingBackground = backgroundColor || backgroundImage || backgroundPosition || background;
        const usingBorderStyling = borderOutline.hasOutline || borderOutline.drawAsRoundedBox || boxShadow;
        if (!usingBackground && !usingBorderStyling) {
            return widget;
        }
        else {
            const parsedBackgroundProps = (0, css_background_parser_1.parseBackgroundProps)(style);
            let useBorder = false;
            if (!borderWidget) {
                borderWidget = new UE.Border(this.outer);
            }
            const border = borderWidget;
            if (parsedBackgroundProps?.gradient) {
                // CSS gradient detected: generate a runtime texture via C++ helper
                const gradientBrush = (0, css_gradient_parser_1.createGradientBrush)(parsedBackgroundProps.gradient, this.outer);
                if (gradientBrush) {
                    if (usingBorderStyling) {
                        (0, css_border_parser_1.applyOutlineToBrush)(gradientBrush, borderOutline);
                    }
                    border.SetBrush(gradientBrush);
                    useBorder = true;
                }
            }
            else if (parsedBackgroundProps?.image) {
                // Apply border-radius/outline to the background image brush
                if (usingBorderStyling) {
                    (0, css_border_parser_1.applyOutlineToBrush)(parsedBackgroundProps.image, borderOutline);
                }
                border.SetBrush(parsedBackgroundProps.image);
                useBorder = true;
            }
            else if (usingBorderStyling) {
                // No background image, but we have border styling. Create a brush
                // configured for rounded box rendering with the outline settings.
                const brush = new UE.SlateBrush();
                brush.DrawAs = borderOutline.drawAsRoundedBox
                    ? UE.ESlateBrushDrawType.RoundedBox
                    : UE.ESlateBrushDrawType.NoDrawType;
                (0, css_border_parser_1.applyOutlineToBrush)(brush, borderOutline);
                // Apply box-shadow as a tint on the brush outline when present
                if (boxShadow && !borderOutline.color) {
                    const outlineSettings = brush.OutlineSettings;
                    if (outlineSettings) {
                        outlineSettings.Color.SpecifiedColor.R = boxShadow.color.r;
                        outlineSettings.Color.SpecifiedColor.G = boxShadow.color.g;
                        outlineSettings.Color.SpecifiedColor.B = boxShadow.color.b;
                        outlineSettings.Color.SpecifiedColor.A = boxShadow.color.a;
                        // Use the shadow's spread + blur as outline width if no explicit border
                        if (borderOutline.width === 0) {
                            outlineSettings.Width = Math.max(1, boxShadow.spreadRadius + boxShadow.blurRadius * 0.5);
                        }
                    }
                }
                border.SetBrush(brush);
                useBorder = true;
            }
            if (parsedBackgroundProps?.color) {
                border.SetBrushColor(parsedBackgroundProps.color);
                useBorder = true;
            }
            if (parsedBackgroundProps?.alignment) {
                border.SetVerticalAlignment(parsedBackgroundProps.alignment?.vertical);
                border.SetHorizontalAlignment(parsedBackgroundProps.alignment?.horizontal);
                border.SetPadding(parsedBackgroundProps.alignment?.padding);
            }
            const scale = style?.scale;
            border.SetDesiredSizeScale((0, css_length_parser_1.parseScale)(scale));
            // color
            const contentColor = style?.color;
            if (contentColor) {
                const color = (0, css_color_parser_1.parseToLinearColor)(contentColor);
                border.SetContentColorAndOpacity(new UE.LinearColor(color.r, color.g, color.b, color.a));
            }
            if (useBorder && !updateProps) {
                this.externalSlot = border.AddChild(widget);
            }
            else {
                return widget;
            }
            return border;
        }
    }
    setupBoxSize(Widget, sizeBoxWidget, updateProps) {
        let style = this.containerStyle;
        if (updateProps) {
            style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, updateProps);
        }
        const width = style?.width || 'auto';
        const height = style?.height || 'auto';
        if (width === 'auto' && height === 'auto') {
            return Widget;
        }
        else {
            if (!sizeBoxWidget) {
                sizeBoxWidget = new UE.SizeBox(this.outer);
            }
            const sizeBox = sizeBoxWidget;
            if (width !== 'auto') {
                const widthPx = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(width, this.containerStyle, undefined);
                if (widthPx !== 0)
                    sizeBox.SetWidthOverride(widthPx);
            }
            if (height !== 'auto') {
                const heightPx = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(height, this.containerStyle, undefined);
                if (heightPx !== 0)
                    sizeBox.SetHeightOverride(heightPx);
            }
            const maxWidth = this.containerStyle?.maxWidth;
            if (maxWidth) {
                sizeBox.SetMaxDesiredWidth((0, css_length_parser_1.convertLengthUnitToSlateUnit)(maxWidth, this.containerStyle));
            }
            const maxHeight = this.containerStyle?.maxHeight;
            if (maxHeight) {
                sizeBox.SetMaxDesiredHeight((0, css_length_parser_1.convertLengthUnitToSlateUnit)(maxHeight, this.containerStyle));
            }
            const minWidth = this.containerStyle?.minWidth;
            if (minWidth) {
                sizeBox.SetMinDesiredWidth((0, css_length_parser_1.convertLengthUnitToSlateUnit)(minWidth, this.containerStyle));
            }
            const minHeight = this.containerStyle?.minHeight;
            if (minHeight) {
                sizeBox.SetMinDesiredHeight((0, css_length_parser_1.convertLengthUnitToSlateUnit)(minHeight, this.containerStyle));
            }
            const aspectRatio = this.containerStyle?.aspectRatio;
            if (aspectRatio) {
                sizeBox.SetMaxAspectRatio((0, css_length_parser_1.parseAspectRatio)(aspectRatio));
                sizeBox.SetMinAspectRatio((0, css_length_parser_1.parseAspectRatio)(aspectRatio));
            }
            if (!updateProps) {
                this.externalSlot = sizeBox.AddChild(Widget);
            }
            return sizeBox;
        }
    }
    setupBoxScale(widget, scaleBoxWidget, updateProps) {
        let style = this.containerStyle;
        if (updateProps) {
            style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, updateProps);
        }
        const objectFit = style?.objectFit;
        if (objectFit) {
            if (!scaleBoxWidget) {
                scaleBoxWidget = new UE.ScaleBox(this.outer);
            }
            const scaleBox = scaleBoxWidget;
            if (objectFit === 'contain') {
                scaleBox.SetStretch(UE.EStretch.ScaleToFit);
            }
            else if (objectFit === 'cover') {
                scaleBox.SetStretch(UE.EStretch.ScaleToFill);
            }
            else if (objectFit === 'fill') {
                scaleBox.SetStretch(UE.EStretch.Fill);
            }
            else if (objectFit === 'none') {
                scaleBox.SetStretch(UE.EStretch.None);
            }
            else if (objectFit === 'scale-down') {
                scaleBox.SetStretch(UE.EStretch.UserSpecifiedWithClipping);
                const scale = style?.scale;
                if (scale) {
                    scaleBox.SetUserSpecifiedScale((0, utils_1.safeParseFloat)(scale));
                }
            }
            this.externalSlot = scaleBox.AddChild(widget);
            return scaleBox;
        }
        else {
            return widget;
        }
    }
    /** Tracks the BackgroundBlur wrapper when filter/backdropFilter blur is active */
    blurWidget = null;
    /** Tracks the ScrollBox wrapper when overflow:scroll/auto is active */
    scrollBoxWrapper = null;
    /**
     * Tracks z-index values for children in non-Canvas containers.
     * Used to determine insertion order when z-index is specified.
     * Maps child widget -> z-index value.
     */
    childZIndices = new Map();
    /**
     * Determines if the container's overflow style requires scrolling.
     * Returns the orientation to use, or null if no scrolling is needed.
     */
    detectScrollOverflow() {
        const style = this.containerStyle;
        if (!style)
            return null;
        const overflow = (style.overflow || '').toString().trim().toLowerCase();
        const overflowX = (style.overflowX || '').toString().trim().toLowerCase();
        const overflowY = (style.overflowY || '').toString().trim().toLowerCase();
        const isScrollable = (v) => v === 'scroll' || v === 'auto';
        // Global overflow shorthand
        if (isScrollable(overflow)) {
            return 'both';
        }
        const scrollX = isScrollable(overflowX);
        const scrollY = isScrollable(overflowY);
        if (scrollX && scrollY)
            return 'both';
        if (scrollX)
            return 'horizontal';
        if (scrollY)
            return 'vertical';
        return null;
    }
    /**
     * Wraps a widget in a ScrollBox if overflow:scroll/auto is detected.
     * Returns the original widget if no wrapping is needed.
     */
    setupScrollOverflow(widget, existingScrollBox) {
        const scrollDirection = this.detectScrollOverflow();
        if (!scrollDirection) {
            return widget;
        }
        let scrollBox;
        if (existingScrollBox) {
            scrollBox = existingScrollBox;
        }
        else {
            scrollBox = new UE.ScrollBox(this.outer);
        }
        // Configure orientation based on the detected overflow direction
        if (scrollDirection === 'horizontal') {
            scrollBox.SetOrientation(UE.EOrientation.Orient_Horizontal);
        }
        else {
            // 'vertical' and 'both' default to vertical scrolling
            // (UMG ScrollBox is single-axis; vertical covers most use cases)
            scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
        }
        // Only add the child widget on initial creation (not updates)
        if (!existingScrollBox) {
            scrollBox.AddChild(widget);
            this.scrollBoxWrapper = scrollBox;
        }
        (0, batch_sync_1.queueWidgetSync)(scrollBox);
        return scrollBox;
    }
    /**
     * Wraps a widget in a UBackgroundBlur when CSS `filter: blur()` or
     * `backdropFilter: blur()` is detected. Also applies non-blur filter
     * effects (brightness, opacity) as ColorAndOpacity/RenderOpacity tints.
     */
    setupFilterEffects(widget, existingBlur, updateProps) {
        let style = this.containerStyle;
        if (updateProps) {
            style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, updateProps);
        }
        if (!style)
            return widget;
        // Parse both filter and backdropFilter
        const filterStr = style.filter ?? style.WebkitFilter;
        const backdropStr = style.backdropFilter ?? style.WebkitBackdropFilter;
        const filters = filterStr ? (0, css_filter_parser_1.parseFilter)(filterStr) : [];
        const backdropFilters = backdropStr ? (0, css_filter_parser_1.parseFilter)(backdropStr) : [];
        // Determine blur radius: backdrop-filter blur is the primary use case
        // for UBackgroundBlur. Regular filter blur also applies.
        const backdropBlur = (0, css_filter_parser_1.getBlurRadius)(backdropFilters);
        const filterBlur = (0, css_filter_parser_1.getBlurRadius)(filters);
        const blurRadius = Math.max(backdropBlur, filterBlur);
        if (blurRadius > 0) {
            let blurBox;
            if (existingBlur) {
                blurBox = existingBlur;
            }
            else {
                blurBox = new UE.BackgroundBlur(this.outer);
            }
            blurBox.SetBlurRadius(Math.round(blurRadius));
            // Only add child on initial creation
            if (!existingBlur) {
                blurBox.AddChild(widget);
                this.blurWidget = blurBox;
            }
            (0, batch_sync_1.queueWidgetSync)(blurBox);
            widget = blurBox;
        }
        // Apply non-blur filter effects as tints/opacity on the widget itself
        const brightness = (0, css_filter_parser_1.getCombinedBrightness)(filters);
        if (brightness !== 1.0 && widget) {
            // Approximate brightness as a uniform color multiplier
            const b = Math.max(0, Math.min(brightness, 3));
            widget.SetColorAndOpacity(new UE.LinearColor(b, b, b, 1));
        }
        const opacity = (0, css_filter_parser_1.getCombinedOpacity)(filters);
        if (opacity < 1.0 && widget) {
            widget.SetRenderOpacity(Math.max(0, Math.min(opacity, 1)));
        }
        return widget;
    }
    initClipChildWidget(parentWidget) {
        const style = this.containerStyle;
        const overflow = (style?.overflow || '').toString().trim().toLowerCase();
        const visibility = style?.visibility;
        // Apply clipping for overflow:hidden
        if (overflow === 'hidden' || visibility === 'clip') {
            parentWidget.SetClipping(UE.EWidgetClipping.ClipToBounds);
        }
    }
    initChildAlignmentForExternalSlot(childProps) {
        if (childProps && this.externalSlot) {
            const Style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, childProps);
            const childAlignment = (0, alignment_parser_1.parseWidgetSelfAlignment)(Style);
            if (this.externalSlot instanceof UE.SizeBoxSlot) {
                this.externalSlot.SetHorizontalAlignment(childAlignment.horizontal);
                this.externalSlot.SetVerticalAlignment(childAlignment.vertical);
                this.externalSlot.SetPadding(childAlignment.padding);
            }
            else if (this.externalSlot instanceof UE.ScaleBoxSlot) {
                this.externalSlot.SetHorizontalAlignment(childAlignment.horizontal);
                this.externalSlot.SetVerticalAlignment(childAlignment.vertical);
                this.externalSlot.SetPadding(childAlignment.padding);
            }
            else if (this.externalSlot instanceof UE.BorderSlot) {
                this.externalSlot.SetHorizontalAlignment(childAlignment.horizontal);
                this.externalSlot.SetVerticalAlignment(childAlignment.vertical);
                this.externalSlot.SetPadding(childAlignment.padding);
            }
            else if (this.externalSlot instanceof UE.WrapBoxSlot) {
                this.externalSlot.SetHorizontalAlignment(childAlignment.horizontal);
                this.externalSlot.SetVerticalAlignment(childAlignment.vertical);
                this.externalSlot.SetPadding(childAlignment.padding);
            }
        }
    }
    /**
     * Extracts the z-index value from a child's style, returning 0 as the default.
     * Supports both 'zIndex' and 'zOrder' property names.
     */
    extractZIndex(childStyle) {
        if (!childStyle)
            return 0;
        const raw = childStyle.zIndex ?? childStyle.zOrder;
        if (raw === undefined || raw === null)
            return 0;
        const parsed = parseInt(String(raw), 10);
        return isNaN(parsed) ? 0 : parsed;
    }
    /**
     * Determines the correct insertion index for a child with a given z-index
     * within a panel widget, so that children remain sorted by z-index.
     * Higher z-index values are appended later (rendered on top).
     *
     * @param parent    - The panel widget to query existing children
     * @param zIndex    - The z-index of the child being inserted
     * @returns The index at which the child should be inserted, or -1 to append
     */
    findZIndexInsertionPoint(parent, zIndex) {
        if (!parent || zIndex === 0)
            return -1; // default z-index appends at end
        const childCount = parent.GetChildrenCount();
        if (childCount === 0)
            return -1;
        // Walk existing children and find the first one with a higher z-index
        for (let i = 0; i < childCount; i++) {
            const existingChild = parent.GetChildAt(i);
            if (!existingChild)
                continue;
            const existingZ = this.childZIndices.get(existingChild) ?? 0;
            if (existingZ > zIndex) {
                return i;
            }
        }
        return -1; // append at end (this child has the highest z-index)
    }
    /**
     * Returns true when the child widget's current visibility is Collapsed.
     * Used by subclass converters to decide whether expensive slot setup
     * should be deferred until the child becomes visible.
     */
    isChildCollapsed(child) {
        if (!child)
            return false;
        try {
            return child.Visibility === UE.ESlateVisibility.Collapsed;
        }
        catch {
            return false;
        }
    }
    /**
     * Completes deferred slot configuration for a child widget that has
     * transitioned from Collapsed to a visible state.  The base implementation
     * delegates to the proxy converter (Flex, Overlay, Canvas, etc.).
     * Subclasses override this to perform the actual slot init using the
     * slot that already exists on the child from the initial AddChild call.
     *
     * @param parent   The native parent panel widget
     * @param child    The native child widget whose slot needs configuring
     */
    completeDeferredSlotSetup(parent, child) {
        // Delegate to the proxy converter that holds the actual deferred data
        if (this.proxy && typeof this.proxy.completeDeferredSlotSetup === 'function') {
            this.proxy.completeDeferredSlotSetup(this.originalWidget, child);
        }
        // Complete any text styling that was skipped for collapsed children
        this._applyTextInstanceStyles(child);
    }
    initChildPadding(panelSlot, childStyle) {
        if (!panelSlot || typeof panelSlot.SetPadding !== 'function') {
            return;
        }
        const margin = (0, css_margin_parser_1.convertMargin)(childStyle);
        if (margin) {
            panelSlot.SetPadding(margin);
        }
        const padding = (0, css_margin_parser_1.convertPadding)(childStyle);
        if (padding) {
            panelSlot.SetPadding(padding);
        }
    }
    createNativeWidget() {
        let widget = null;
        if (!this.proxy) {
            this.proxy = this.createProxy();
        }
        if (this.proxy) {
            widget = this.proxy.createNativeWidget();
            this.originalWidget = widget;
            // When position:relative is set, wrap the flow layout widget in an
            // Overlay so that absolute-positioned children can be layered on top
            // of the normal flex/grid flow. The flow widget fills the overlay as
            // the first child; absolute children are added later via appendChild.
            const position = (this.containerStyle?.position || '').toString().trim().toLowerCase();
            if (position === 'relative' && widget) {
                this._relativeOverlay = new UE.Overlay(this.outer);
                const flowSlot = this._relativeOverlay.AddChildToOverlay(widget);
                if (flowSlot) {
                    flowSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
                    flowSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
                }
                widget = this._relativeOverlay;
            }
            // Wrap in ScrollBox if overflow:scroll/auto is specified
            if (widget) {
                widget = this.setupScrollOverflow(widget);
            }
            // Wrap in BackgroundBlur if filter/backdrop-filter blur is specified
            if (widget) {
                widget = this.setupFilterEffects(widget);
            }
            if (widget) {
                widget = this.setupBackground(widget);
                this.borderWidget = widget instanceof UE.Border ? widget : null;
            }
            if (widget) {
                widget = this.setupBoxSize(widget);
                this.sizeBoxWidget = widget instanceof UE.SizeBox ? widget : null;
            }
            if (widget) {
                widget = this.setupBoxScale(widget);
                this.scaleBoxWidget = widget instanceof UE.ScaleBox ? widget : null;
            }
            // Inject ::before pseudo-element content into the original panel widget.
            // This runs after all wrappers are created so the text appears inside
            // the container's layout flow.
            this._injectPseudoElements();
        }
        return widget;
    }
    /**
     * Synthetic TextBlock children injected for ::before and ::after pseudo-elements.
     * We keep references to remove/update them if the container is re-rendered.
     */
    _beforePseudoWidget = null;
    _afterPseudoWidget = null;
    /**
     * Checks for ::before and ::after pseudo-element styles with a `content` property
     * and injects synthetic TextBlock children at the start/end of the container.
     */
    _injectPseudoElements() {
        if (!this.originalWidget || !(this.originalWidget instanceof UE.PanelWidget))
            return;
        const panel = this.originalWidget;
        // Check for ::before pseudo-element styles
        const beforeStyles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, '::before')
            ?? (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, 'before');
        if (beforeStyles?.content && typeof beforeStyles.content === 'string') {
            const content = this._resolvePseudoContent(beforeStyles.content);
            if (content) {
                const textBlock = new UE.TextBlock(this.outer);
                textBlock.SetText(content);
                this._applyPseudoTextStyles(textBlock, beforeStyles);
                panel.AddChild(textBlock);
                this._beforePseudoWidget = textBlock;
                (0, batch_sync_1.queueWidgetSync)(textBlock);
            }
        }
        // Check for ::after pseudo-element styles
        const afterStyles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, '::after')
            ?? (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, 'after');
        if (afterStyles?.content && typeof afterStyles.content === 'string') {
            const content = this._resolvePseudoContent(afterStyles.content);
            if (content) {
                const textBlock = new UE.TextBlock(this.outer);
                textBlock.SetText(content);
                this._applyPseudoTextStyles(textBlock, afterStyles);
                panel.AddChild(textBlock);
                this._afterPseudoWidget = textBlock;
                (0, batch_sync_1.queueWidgetSync)(textBlock);
            }
        }
    }
    /**
     * Resolves the CSS `content` property value by stripping quotes
     * and handling special values like 'none', 'normal', '' etc.
     */
    _resolvePseudoContent(content) {
        if (!content)
            return null;
        const trimmed = content.trim();
        if (trimmed === 'none' || trimmed === 'normal' || trimmed === '""' || trimmed === "''") {
            return null;
        }
        // Strip surrounding quotes
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }
    /**
     * Applies styling from the pseudo-element's style declaration to a TextBlock.
     * Covers color, font, and common text properties.
     */
    _applyPseudoTextStyles(textBlock, styles) {
        // Color
        const fontColor = styles.color;
        if (fontColor) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(fontColor);
            const specifiedColor = textBlock.ColorAndOpacity?.SpecifiedColor;
            if (specifiedColor) {
                specifiedColor.R = rgba.r;
                specifiedColor.G = rgba.g;
                specifiedColor.B = rgba.b;
                specifiedColor.A = rgba.a;
            }
        }
        // Font styles
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
    }
    update(widget, oldProps, changedProps) {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
            // Update filter/blur effects
            if (this.blurWidget) {
                this.setupFilterEffects(widget, this.blurWidget, changedProps);
            }
            // Update background
            if (this.borderWidget) {
                this.setupBackground(widget, this.borderWidget, changedProps);
            }
            if (this.sizeBoxWidget) {
                this.setupBoxSize(widget, this.sizeBoxWidget, changedProps);
            }
            if (this.scaleBoxWidget) {
                this.setupBoxScale(widget, this.scaleBoxWidget, changedProps);
            }
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (this.proxy) {
            this.initClipChildWidget(parent);
            this.initChildAlignmentForExternalSlot(childProps);
            // When this container has position:relative, check if the child
            // is absolutely positioned. If so, route it to the overlay wrapper
            // instead of the flow layout — matching CSS stacking context semantics.
            if (this._relativeOverlay) {
                const childStyle = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
                const childPos = (childStyle?.position || '').toString().trim().toLowerCase();
                if (childPos === 'absolute' || childPos === 'fixed') {
                    this._appendAbsoluteChild(child, childStyle);
                    this._absoluteOverlayChildren.add(child);
                    // Still apply inherited text styles for inline text children
                    if (!this.isChildCollapsed(child) && childProps["_children_text_instance"]) {
                        this._applyTextInstanceStyles(child);
                    }
                    return;
                }
            }
            this.proxy.appendChild(this.originalWidget, child, childTypeName, childProps);
        }
        // Skip expensive text styling for collapsed children.
        // The styling will be applied when completeDeferredSlotSetup runs
        // after the child transitions to a visible state.
        if (this.isChildCollapsed(child)) {
            return;
        }
        if (childProps["_children_text_instance"]) {
            this._applyTextInstanceStyles(child);
        }
    }
    /**
     * Applies container-inherited text styles (font, color, alignment, etc.)
     * to an inline text instance child.  Mirrors the logic from
     * TextConverter.setupTextBlockProperties so children inherit the
     * parent container's typographic settings.
     */
    _applyTextInstanceStyles(child) {
        if (!(child instanceof UE.TextBlock))
            return;
        const styles = this.containerStyle ?? {};
        // Font family/size/weight/outline/spacing
        if ((0, css_font_parser_1.hasFontStyles)(styles)) {
            if (!child.Font) {
                const fontStyles = new UE.SlateFontInfo();
                (0, css_font_parser_1.setupFontStyles)(child, fontStyles, styles);
                child.SetFont(fontStyles);
            }
            else {
                (0, css_font_parser_1.setupFontStyles)(child, child.Font, styles);
            }
        }
        // Color
        const fontColor = styles?.color ?? styles?.fontColor;
        if (fontColor) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(fontColor);
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
            }
            else if (v === 'right') {
                child.Justification = UE.ETextJustify.Right;
            }
            else {
                child.Justification = UE.ETextJustify.Left;
            }
        }
        // Text transform
        const textTransform = styles?.textTransform;
        if (textTransform) {
            const v = String(textTransform).toLowerCase();
            if (v === 'uppercase') {
                child.TextTransformPolicy = UE.ETextTransformPolicy.ToUpper;
            }
            else if (v === 'lowercase') {
                child.TextTransformPolicy = UE.ETextTransformPolicy.ToLower;
            }
            else {
                child.TextTransformPolicy = UE.ETextTransformPolicy.None;
            }
        }
        // Line height
        const lineHeight = styles?.lineHeight;
        if (lineHeight !== undefined && lineHeight !== null) {
            let resolved = null;
            if (typeof lineHeight === 'number') {
                resolved = lineHeight;
            }
            else if (typeof lineHeight === 'string' && lineHeight.trim().length > 0) {
                resolved = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(lineHeight, styles);
            }
            if (resolved !== null && resolved !== undefined) {
                child.LineHeightPercentage = resolved;
            }
        }
        // Text shadow (inherited from parent container style)
        const textShadow = styles?.textShadow;
        if (textShadow) {
            const parsed = (0, css_font_parser_1.parseTextShadow)(textShadow, styles);
            if (parsed) {
                child.SetShadowOffset(new UE.Vector2D(parsed.offsetX, parsed.offsetY));
                if (parsed.color) {
                    child.SetShadowColorAndOpacity(new UE.LinearColor(parsed.color.r, parsed.color.g, parsed.color.b, parsed.color.a));
                }
                else {
                    child.SetShadowColorAndOpacity(new UE.LinearColor(0, 0, 0, 0.5));
                }
            }
        }
        // Text overflow policy (inherited from parent container style)
        const textOverflow = styles?.textOverflow;
        if (textOverflow) {
            const normalized = String(textOverflow).toLowerCase().trim();
            if (normalized === 'ellipsis') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Ellipsis);
            }
            else if (normalized === 'clip') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Clip);
            }
        }
        // Word break / overflow wrap (inherited from parent container style)
        const wordBreak = styles?.wordBreak ?? styles?.overflowWrap;
        if (wordBreak) {
            const normalized = String(wordBreak).toLowerCase().trim();
            if (normalized === 'break-all' || normalized === 'break-word') {
                child.AutoWrapText = true;
            }
            else if (normalized === 'keep-all' || normalized === 'nowrap') {
                child.AutoWrapText = false;
            }
        }
        (0, batch_sync_1.queueWidgetSync)(child);
    }
    /**
     * Adds an absolute-positioned child to the _relativeOverlay wrapper.
     * Computes alignment and padding from CSS left/top/right/bottom values
     * to approximate the absolute positioning within the overlay.
     *
     * @param child      The native child widget to add
     * @param childStyle The resolved CSS styles for the child
     */
    _appendAbsoluteChild(child, childStyle) {
        if (!this._relativeOverlay)
            return;
        const overlaySlot = this._relativeOverlay.AddChildToOverlay(child);
        if (!overlaySlot)
            return;
        // Determine which edges are specified to infer alignment
        const hasLeft = childStyle?.left !== undefined && childStyle.left !== null;
        const hasRight = childStyle?.right !== undefined && childStyle.right !== null;
        const hasTop = childStyle?.top !== undefined && childStyle.top !== null;
        const hasBottom = childStyle?.bottom !== undefined && childStyle.bottom !== null;
        // Horizontal alignment: if both left and right are set, fill (stretch).
        // Otherwise align to the specified edge.
        if (hasLeft && hasRight) {
            overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
        }
        else if (hasRight && !hasLeft) {
            overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
        }
        else {
            overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
        }
        // Vertical alignment: if both top and bottom are set, fill (stretch).
        // Otherwise align to the specified edge.
        if (hasTop && hasBottom) {
            overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        }
        else if (hasBottom && !hasTop) {
            overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Bottom);
        }
        else {
            overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
        }
        // Convert CSS offsets to padding on the overlay slot
        const leftPx = hasLeft ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(childStyle.left, childStyle) : 0;
        const topPx = hasTop ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(childStyle.top, childStyle) : 0;
        const rightPx = hasRight ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(childStyle.right, childStyle) : 0;
        const bottomPx = hasBottom ? (0, css_length_parser_1.convertLengthUnitToSlateUnit)(childStyle.bottom, childStyle) : 0;
        overlaySlot.SetPadding(new UE.Margin(leftPx, topPx, rightPx, bottomPx));
        (0, batch_sync_1.queueSlotSync)(overlaySlot);
    }
    removeChild(parent, child) {
        // If this child was routed to the position:relative overlay,
        // detach it from there instead of from the flow layout proxy.
        if (this._absoluteOverlayChildren.has(child)) {
            this._absoluteOverlayChildren.delete(child);
            child.RemoveFromParent();
        }
        else if (this.proxy) {
            // Delegate to the proxy so subclass converters (e.g. OverlayConverter)
            // can clean up internal tracking maps (absoluteChildren, etc.)
            this.proxy.removeChild(this.originalWidget, child);
        }
        else {
            child.RemoveFromParent();
        }
        // Clear any deferred slot entry for this child.
        // Check both the proxy's map (when `this` is the outer CC) and
        // our own map (when `this` IS the proxy, e.g. FlexConverter).
        this._deferredSlots.delete(child);
        if (this.proxy) {
            this.proxy._deferredSlots?.delete(child);
        }
    }
}
exports.ContainerConverter = ContainerConverter;
//# sourceMappingURL=container_converter.js.map