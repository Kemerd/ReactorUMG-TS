import * as UE from "ue";
import { ElementConverter } from "../converter";
import { getAllStyles } from "../parsers/cssstyle_parser";
import { convertMargin, convertPadding } from "../parsers/css_margin_parser";
import { parseBackgroundProps } from "../parsers/css_background_parser";
import { createGradientBrush } from "../parsers/css_gradient_parser";
import { parseToLinearColor } from "../parsers/css_color_parser";
import { convertLengthUnitToSlateUnit, parseScale, parseAspectRatio } from "../parsers/css_length_parser";
import { safeParseFloat } from "../misc/utils";
import { parseWidgetSelfAlignment } from "../parsers/alignment_parser";
import { hasFontStyles, setupFontStyles, parseTextShadow } from "../parsers/css_font_parser";
import { processBorderStyles, applyOutlineToBrush, parseBoxShadow } from "../parsers/css_border_parser";
import { parseFilter, getBlurRadius, getCombinedBrightness, getCombinedOpacity, FilterFunction } from "../parsers/css_filter_parser";
import { queueWidgetSync } from "../perf/batch_sync";

/**
 * Base class for all container (panel) converters. Implements shared
 * functionality for layout parameter conversion, background/size/scale
 * wrapping, and the lazy-slot optimisation that defers expensive slot
 * configuration for children whose initial visibility is Collapsed.
 */
export class ContainerConverter extends ElementConverter {
    containerType: string;
    containerStyle: any;
    proxy: ElementConverter;
    originalWidget: UE.Widget;
    externalSlot: UE.PanelSlot; // 保存外部添加的容器slot
    sizeBoxWidget: UE.Widget; // 保存sizebox容器
    scaleBoxWidget: UE.Widget; // 保存scalebox容器
    borderWidget: UE.Widget; // 保存border容器

    /**
     * Children whose slot configuration was deferred because they were
     * Collapsed at mount time.  Keyed by the native child widget so we
     * can match them later when visibility changes.
     */
    protected _deferredSlots: Map<UE.Widget, { typeName: string; props: any }> = new Map();

    private childConverters: Record<string, string>;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
        this.containerStyle = getAllStyles(this.typeName, this.props);
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

    private createProxy(): ElementConverter {
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
     *   display: grid          -> GridConverter
     *   position: absolute     -> CanvasConverter  (removed from flow)
     *   position: fixed        -> CanvasConverter  (viewport-anchored)
     *   position: relative     -> OverlayConverter (stays in flow, allows offsets)
     *   position: static (default) -> FlexConverter (normal document flow)
     */
    private parseContainerType(type: string) {
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

            // CSS position determines the container strategy
            const position = (this.containerStyle?.position || 'static').toString().trim().toLowerCase();

            switch (position) {
                case 'absolute':
                case 'fixed':
                    return 'canvas';
                case 'relative':
                    return 'overlay';
                case 'static':
                case 'sticky':
                default:
                    return 'flex';
            }
        } else {
            return normalizedType;
        }
    }

    private setupBackground(widget: UE.Widget, borderWidget?: UE.Widget, updateProps?: any): UE.Widget {
        let style = this.containerStyle;
        if (updateProps) {
            style = getAllStyles(this.typeName, updateProps);
        }

        const background = style?.background;
        const backgroundColor = style?.backgroundColor;
        const backgroundImage = style?.backgroundImage;
        const backgroundPosition = style?.backgroundPosition;

        // Check if we have any border/border-radius/box-shadow CSS properties too
        const borderOutline = processBorderStyles(style);
        const boxShadow = parseBoxShadow(style?.boxShadow, style);

        const usingBackground = backgroundColor || backgroundImage || backgroundPosition || background;
        const usingBorderStyling = borderOutline.hasOutline || borderOutline.drawAsRoundedBox || boxShadow;
        
        if (!usingBackground && !usingBorderStyling) {
            return widget;
        } else {
            const parsedBackgroundProps = parseBackgroundProps(style);
            
            let useBorder = false;  
            if (!borderWidget) {
                borderWidget = new UE.Border(this.outer);
            }
            const border = borderWidget as UE.Border;

            if (parsedBackgroundProps?.gradient) {
                // CSS gradient detected: generate a runtime texture via C++ helper
                const gradientBrush = createGradientBrush(parsedBackgroundProps.gradient, this.outer);
                if (gradientBrush) {
                    if (usingBorderStyling) {
                        applyOutlineToBrush(gradientBrush, borderOutline);
                    }
                    border.SetBrush(gradientBrush);
                    useBorder = true;
                }
            } else if (parsedBackgroundProps?.image) {
                // Apply border-radius/outline to the background image brush
                if (usingBorderStyling) {
                    applyOutlineToBrush(parsedBackgroundProps.image, borderOutline);
                }
                border.SetBrush(parsedBackgroundProps.image);
                useBorder = true;
            } else if (usingBorderStyling) {
                // No background image, but we have border styling. Create a brush
                // configured for rounded box rendering with the outline settings.
                const brush = new UE.SlateBrush();
                brush.DrawAs = borderOutline.drawAsRoundedBox
                    ? UE.ESlateBrushDrawType.RoundedBox
                    : UE.ESlateBrushDrawType.NoDrawType;

                applyOutlineToBrush(brush, borderOutline);

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
            border.SetDesiredSizeScale(parseScale(scale));
            
            // color
            const contentColor = style?.color;
            if (contentColor) {
                const color = parseToLinearColor(contentColor);
                border.SetContentColorAndOpacity(
                    new UE.LinearColor(color.r, color.g, color.b, color.a)
                );
            }

            if (useBorder && !updateProps) {
                this.externalSlot = border.AddChild(widget) as UE.BorderSlot;
            } else {
                return widget;
            }

            return border; 
        }
    }

    private setupBoxSize(Widget: UE.Widget, sizeBoxWidget?: UE.Widget, updateProps?: any): UE.Widget {
        let style = this.containerStyle;
        if (updateProps) {
            style = getAllStyles(this.typeName, updateProps);
        }

        const width = style?.width || 'auto';
        const height = style?.height || 'auto';

        if (width === 'auto' && height === 'auto') {
            return Widget;
        } else {
            if (!sizeBoxWidget) {
                sizeBoxWidget = new UE.SizeBox(this.outer);
            }
            const sizeBox = sizeBoxWidget as UE.SizeBox;
            if (width !== 'auto') {
                const widthPx = convertLengthUnitToSlateUnit(width, this.containerStyle, undefined);
                if (widthPx !== 0)
                    sizeBox.SetWidthOverride(widthPx);
            }

            if (height !== 'auto') {
                const heightPx = convertLengthUnitToSlateUnit(height, this.containerStyle, undefined);
                if (heightPx !== 0)
                    sizeBox.SetHeightOverride(heightPx);
            }

            const maxWidth = this.containerStyle?.maxWidth;
            if (maxWidth) {
                sizeBox.SetMaxDesiredWidth(convertLengthUnitToSlateUnit(maxWidth, this.containerStyle));
            }
            
            const maxHeight = this.containerStyle?.maxHeight;
            if (maxHeight) {
                sizeBox.SetMaxDesiredHeight(convertLengthUnitToSlateUnit(maxHeight, this.containerStyle));
            }

            const minWidth = this.containerStyle?.minWidth;
            if (minWidth) {
                sizeBox.SetMinDesiredWidth(convertLengthUnitToSlateUnit(minWidth, this.containerStyle));
            }

            const minHeight = this.containerStyle?.minHeight;
            if (minHeight) {
                sizeBox.SetMinDesiredHeight(convertLengthUnitToSlateUnit(minHeight, this.containerStyle));
            }

            const aspectRatio = this.containerStyle?.aspectRatio;
            if (aspectRatio) {
                sizeBox.SetMaxAspectRatio(parseAspectRatio(aspectRatio));
                sizeBox.SetMinAspectRatio(parseAspectRatio(aspectRatio));
            }

            if (!updateProps) {
                this.externalSlot = sizeBox.AddChild(Widget) as UE.SizeBoxSlot
            }

            return sizeBox;
        }
    }

    private setupBoxScale(widget: UE.Widget, scaleBoxWidget?: UE.Widget, updateProps?: any): UE.Widget {
        let style = this.containerStyle;
        if (updateProps) {
            style = getAllStyles(this.typeName, updateProps);
        }
        
        const objectFit = style?.objectFit;
        if (objectFit) {
            if (!scaleBoxWidget) {
                scaleBoxWidget = new UE.ScaleBox(this.outer);
            }
            const scaleBox = scaleBoxWidget as UE.ScaleBox;
            if (objectFit === 'contain') {
                scaleBox.SetStretch(UE.EStretch.ScaleToFit)
            } else if (objectFit === 'cover') {
                scaleBox.SetStretch(UE.EStretch.ScaleToFill);
            } else if (objectFit === 'fill') {
                scaleBox.SetStretch(UE.EStretch.Fill);
            } else if (objectFit === 'none') {
                scaleBox.SetStretch(UE.EStretch.None);
            } else if (objectFit === 'scale-down') {
                scaleBox.SetStretch(UE.EStretch.UserSpecifiedWithClipping);
                const scale = style?.scale;
                if (scale) {
                    scaleBox.SetUserSpecifiedScale(safeParseFloat(scale));
                }
            }
            
            this.externalSlot = scaleBox.AddChild(widget) as UE.ScaleBoxSlot;

            return scaleBox;
        } else {
            return widget;
        }
    }

    /** Tracks the BackgroundBlur wrapper when filter/backdropFilter blur is active */
    blurWidget: UE.BackgroundBlur | null = null;

    /** Tracks the ScrollBox wrapper when overflow:scroll/auto is active */
    scrollBoxWrapper: UE.ScrollBox | null = null;

    /**
     * Tracks z-index values for children in non-Canvas containers.
     * Used to determine insertion order when z-index is specified.
     * Maps child widget -> z-index value.
     */
    protected childZIndices: Map<UE.Widget, number> = new Map();

    /**
     * Determines if the container's overflow style requires scrolling.
     * Returns the orientation to use, or null if no scrolling is needed.
     */
    private detectScrollOverflow(): 'horizontal' | 'vertical' | 'both' | null {
        const style = this.containerStyle;
        if (!style) return null;

        const overflow = (style.overflow || '').toString().trim().toLowerCase();
        const overflowX = (style.overflowX || '').toString().trim().toLowerCase();
        const overflowY = (style.overflowY || '').toString().trim().toLowerCase();

        const isScrollable = (v: string) => v === 'scroll' || v === 'auto';

        // Global overflow shorthand
        if (isScrollable(overflow)) {
            return 'both';
        }

        const scrollX = isScrollable(overflowX);
        const scrollY = isScrollable(overflowY);

        if (scrollX && scrollY) return 'both';
        if (scrollX) return 'horizontal';
        if (scrollY) return 'vertical';

        return null;
    }

    /**
     * Wraps a widget in a ScrollBox if overflow:scroll/auto is detected.
     * Returns the original widget if no wrapping is needed.
     */
    private setupScrollOverflow(widget: UE.Widget, existingScrollBox?: UE.ScrollBox): UE.Widget {
        const scrollDirection = this.detectScrollOverflow();
        if (!scrollDirection) {
            return widget;
        }

        let scrollBox: UE.ScrollBox;
        if (existingScrollBox) {
            scrollBox = existingScrollBox;
        } else {
            scrollBox = new UE.ScrollBox(this.outer);
        }

        // Configure orientation based on the detected overflow direction
        if (scrollDirection === 'horizontal') {
            scrollBox.SetOrientation(UE.EOrientation.Orient_Horizontal);
        } else {
            // 'vertical' and 'both' default to vertical scrolling
            // (UMG ScrollBox is single-axis; vertical covers most use cases)
            scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
        }

        // Only add the child widget on initial creation (not updates)
        if (!existingScrollBox) {
            scrollBox.AddChild(widget);
            this.scrollBoxWrapper = scrollBox;
        }

        queueWidgetSync(scrollBox);
        return scrollBox;
    }

    /**
     * Wraps a widget in a UBackgroundBlur when CSS `filter: blur()` or
     * `backdropFilter: blur()` is detected. Also applies non-blur filter
     * effects (brightness, opacity) as ColorAndOpacity/RenderOpacity tints.
     */
    private setupFilterEffects(widget: UE.Widget, existingBlur?: UE.BackgroundBlur, updateProps?: any): UE.Widget {
        let style = this.containerStyle;
        if (updateProps) {
            style = getAllStyles(this.typeName, updateProps);
        }
        if (!style) return widget;

        // Parse both filter and backdropFilter
        const filterStr = style.filter ?? style.WebkitFilter;
        const backdropStr = style.backdropFilter ?? style.WebkitBackdropFilter;

        const filters: FilterFunction[] = filterStr ? parseFilter(filterStr) : [];
        const backdropFilters: FilterFunction[] = backdropStr ? parseFilter(backdropStr) : [];

        // Determine blur radius: backdrop-filter blur is the primary use case
        // for UBackgroundBlur. Regular filter blur also applies.
        const backdropBlur = getBlurRadius(backdropFilters);
        const filterBlur = getBlurRadius(filters);
        const blurRadius = Math.max(backdropBlur, filterBlur);

        if (blurRadius > 0) {
            let blurBox: UE.BackgroundBlur;
            if (existingBlur) {
                blurBox = existingBlur;
            } else {
                blurBox = new UE.BackgroundBlur(this.outer);
            }

            blurBox.SetBlurRadius(Math.round(blurRadius));

            // Only add child on initial creation
            if (!existingBlur) {
                blurBox.AddChild(widget);
                this.blurWidget = blurBox;
            }

            queueWidgetSync(blurBox);
            widget = blurBox;
        }

        // Apply non-blur filter effects as tints/opacity on the widget itself
        const brightness = getCombinedBrightness(filters);
        if (brightness !== 1.0 && widget) {
            // Approximate brightness as a uniform color multiplier
            const b = Math.max(0, Math.min(brightness, 3));
            widget.SetColorAndOpacity(new UE.LinearColor(b, b, b, 1));
        }

        const opacity = getCombinedOpacity(filters);
        if (opacity < 1.0 && widget) {
            widget.SetRenderOpacity(Math.max(0, Math.min(opacity, 1)));
        }

        return widget;
    }

    private initClipChildWidget(parentWidget: UE.Widget) {
        const style = this.containerStyle;
        const overflow = (style?.overflow || '').toString().trim().toLowerCase();
        const visibility = style?.visibility;

        // Apply clipping for overflow:hidden
        if (overflow === 'hidden' || visibility === 'clip') {
            parentWidget.SetClipping(UE.EWidgetClipping.ClipToBounds);
        }
    }

    private initChildAlignmentForExternalSlot(childProps: any) {
        if (childProps && this.externalSlot ) {
            const Style = getAllStyles(this.typeName, childProps);
            const childAlignment = parseWidgetSelfAlignment(Style);
            if (this.externalSlot instanceof UE.SizeBoxSlot) {
                (this.externalSlot as UE.SizeBoxSlot).SetHorizontalAlignment(childAlignment.horizontal);
                (this.externalSlot as UE.SizeBoxSlot).SetVerticalAlignment(childAlignment.vertical);
                (this.externalSlot as UE.SizeBoxSlot).SetPadding(childAlignment.padding);
            } else if (this.externalSlot instanceof UE.ScaleBoxSlot) {
                (this.externalSlot as UE.ScaleBoxSlot).SetHorizontalAlignment(childAlignment.horizontal);
                (this.externalSlot as UE.ScaleBoxSlot).SetVerticalAlignment(childAlignment.vertical);
                (this.externalSlot as UE.ScaleBoxSlot).SetPadding(childAlignment.padding);
            } else if (this.externalSlot instanceof UE.BorderSlot) {
                (this.externalSlot as UE.BorderSlot).SetHorizontalAlignment(childAlignment.horizontal);
                (this.externalSlot as UE.BorderSlot).SetVerticalAlignment(childAlignment.vertical);
                (this.externalSlot as UE.BorderSlot).SetPadding(childAlignment.padding);
            } else if (this.externalSlot instanceof UE.WrapBoxSlot) {
                (this.externalSlot as UE.WrapBoxSlot).SetHorizontalAlignment(childAlignment.horizontal);
                (this.externalSlot as UE.WrapBoxSlot).SetVerticalAlignment(childAlignment.vertical);
                (this.externalSlot as UE.WrapBoxSlot).SetPadding(childAlignment.padding);
            }
        }
    }

    /**
     * Extracts the z-index value from a child's style, returning 0 as the default.
     * Supports both 'zIndex' and 'zOrder' property names.
     */
    protected extractZIndex(childStyle: any): number {
        if (!childStyle) return 0;

        const raw = childStyle.zIndex ?? childStyle.zOrder;
        if (raw === undefined || raw === null) return 0;

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
    protected findZIndexInsertionPoint(parent: UE.PanelWidget, zIndex: number): number {
        if (!parent || zIndex === 0) return -1; // default z-index appends at end

        const childCount = parent.GetChildrenCount();
        if (childCount === 0) return -1;

        // Walk existing children and find the first one with a higher z-index
        for (let i = 0; i < childCount; i++) {
            const existingChild = parent.GetChildAt(i);
            if (!existingChild) continue;

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
    protected isChildCollapsed(child: UE.Widget): boolean {
        if (!child) return false;
        try {
            return child.Visibility === UE.ESlateVisibility.Collapsed;
        } catch {
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
    completeDeferredSlotSetup(parent: UE.Widget, child: UE.Widget): void {
        // Delegate to the proxy converter that holds the actual deferred data
        if (this.proxy && typeof (this.proxy as any).completeDeferredSlotSetup === 'function') {
            (this.proxy as any).completeDeferredSlotSetup(this.originalWidget, child);
        }

        // Complete any text styling that was skipped for collapsed children
        this._applyTextInstanceStyles(child);
    }

    initChildPadding(panelSlot: UE.PanelSlot, childStyle: any): void {
        if (!panelSlot || typeof (panelSlot as any).SetPadding !== 'function') {
            return;
        }

        const margin = convertMargin(childStyle);
        if (margin) {
            (panelSlot as any).SetPadding(margin);
        }
        
        const padding = convertPadding(childStyle);
        if (padding) {
            (panelSlot as any).SetPadding(padding);
        }
    }

    createNativeWidget(): UE.Widget {
        let widget: UE.Widget = null;
        if (!this.proxy) {
            this.proxy = this.createProxy();
        }

        if (this.proxy) {
            widget = this.proxy.createNativeWidget();
            this.originalWidget = widget;

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
    private _beforePseudoWidget: UE.TextBlock | null = null;
    private _afterPseudoWidget: UE.TextBlock | null = null;

    /**
     * Checks for ::before and ::after pseudo-element styles with a `content` property
     * and injects synthetic TextBlock children at the start/end of the container.
     */
    private _injectPseudoElements(): void {
        if (!this.originalWidget || !(this.originalWidget instanceof UE.PanelWidget)) return;

        const panel = this.originalWidget as UE.PanelWidget;

        // Check for ::before pseudo-element styles
        const beforeStyles = getAllStyles(this.typeName, this.props, '::before')
            ?? getAllStyles(this.typeName, this.props, 'before');
        if (beforeStyles?.content && typeof beforeStyles.content === 'string') {
            const content = this._resolvePseudoContent(beforeStyles.content);
            if (content) {
                const textBlock = new UE.TextBlock(this.outer);
                textBlock.SetText(content);
                this._applyPseudoTextStyles(textBlock, beforeStyles);
                panel.AddChild(textBlock);
                this._beforePseudoWidget = textBlock;
                queueWidgetSync(textBlock);
            }
        }

        // Check for ::after pseudo-element styles
        const afterStyles = getAllStyles(this.typeName, this.props, '::after')
            ?? getAllStyles(this.typeName, this.props, 'after');
        if (afterStyles?.content && typeof afterStyles.content === 'string') {
            const content = this._resolvePseudoContent(afterStyles.content);
            if (content) {
                const textBlock = new UE.TextBlock(this.outer);
                textBlock.SetText(content);
                this._applyPseudoTextStyles(textBlock, afterStyles);
                panel.AddChild(textBlock);
                this._afterPseudoWidget = textBlock;
                queueWidgetSync(textBlock);
            }
        }
    }

    /**
     * Resolves the CSS `content` property value by stripping quotes
     * and handling special values like 'none', 'normal', '' etc.
     */
    private _resolvePseudoContent(content: string): string | null {
        if (!content) return null;
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
    private _applyPseudoTextStyles(textBlock: UE.TextBlock, styles: Record<string, any>): void {
        // Color
        const fontColor = styles.color;
        if (fontColor) {
            const rgba = parseToLinearColor(fontColor);
            const specifiedColor = textBlock.ColorAndOpacity?.SpecifiedColor;
            if (specifiedColor) {
                specifiedColor.R = rgba.r;
                specifiedColor.G = rgba.g;
                specifiedColor.B = rgba.b;
                specifiedColor.A = rgba.a;
            }
        }

        // Font styles
        if (hasFontStyles(styles)) {
            if (!textBlock.Font) {
                const fontStyles = new UE.SlateFontInfo();
                setupFontStyles(textBlock, fontStyles, styles);
                textBlock.SetFont(fontStyles);
            } else {
                setupFontStyles(textBlock, textBlock.Font, styles);
            }
        }
    }

    update(widget: UE.Widget, oldProps: any, changedProps: any): void {
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

    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        if (this.proxy) {
            this.initClipChildWidget(parent);
            this.initChildAlignmentForExternalSlot(childProps);
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
    private _applyTextInstanceStyles(child: UE.Widget): void {
        if (!(child instanceof UE.TextBlock)) return;

        const styles = this.containerStyle ?? {};

        // Font family/size/weight/outline/spacing
        if (hasFontStyles(styles)) {
            if (!child.Font) {
                const fontStyles = new UE.SlateFontInfo();
                setupFontStyles(child, fontStyles, styles);
                child.SetFont(fontStyles);
            } else {
                setupFontStyles(child, child.Font, styles);
            }
        }

        // Color
        const fontColor = (styles as any)?.color ?? (styles as any)?.fontColor;
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
        const textAlign = (styles as any)?.textAlign;
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

        // Text transform
        const textTransform = (styles as any)?.textTransform;
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
        const lineHeight: any = (styles as any)?.lineHeight;
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

        // Text shadow (inherited from parent container style)
        const textShadow = (styles as any)?.textShadow;
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

        // Text overflow policy (inherited from parent container style)
        const textOverflow = (styles as any)?.textOverflow;
        if (textOverflow) {
            const normalized = String(textOverflow).toLowerCase().trim();
            if (normalized === 'ellipsis') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Ellipsis);
            } else if (normalized === 'clip') {
                child.SetTextOverflowPolicy(UE.ETextOverflowPolicy.Clip);
            }
        }

        // Word break / overflow wrap (inherited from parent container style)
        const wordBreak = (styles as any)?.wordBreak ?? (styles as any)?.overflowWrap;
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

    removeChild(parent: UE.Widget, child: UE.Widget): void {
        // Delegate to the proxy so subclass converters (e.g. OverlayConverter)
        // can clean up internal tracking maps (absoluteChildren, etc.)
        if (this.proxy) {
            this.proxy.removeChild(this.originalWidget, child);
        } else {
            child.RemoveFromParent();
        }

        // Clear any deferred slot entry for this child.
        // Check both the proxy's map (when `this` is the outer CC) and
        // our own map (when `this` IS the proxy, e.g. FlexConverter).
        this._deferredSlots.delete(child);
        if (this.proxy) {
            (this.proxy as ContainerConverter)._deferredSlots?.delete(child);
        }
    }
}
