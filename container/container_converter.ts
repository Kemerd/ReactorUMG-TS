import * as UE from "ue";
import { ElementConverter } from "../converter";
import { getAllStyles } from "../parsers/cssstyle_parser";
import { convertMargin, convertPadding } from "../parsers/css_margin_parser";
import { parseBackgroundProps } from "../parsers/css_background_parser";
import { parseToLinearColor } from "../parsers/css_color_parser";
import { convertLengthUnitToSlateUnit, parseScale, parseAspectRatio } from "../parsers/css_length_parser";
import { safeParseFloat } from "../misc/utils";
import { parseWidgetSelfAlignment } from "../parsers/alignment_parser";
import { hasFontStyles, setupFontStyles } from "../parsers/css_font_parser";
import { processBorderStyles, applyOutlineToBrush, parseBoxShadow } from "../parsers/css_border_parser";

/**
 * 将容器参数以及布局参数转换中通用的功能实现在这个类中
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
        const semanticDivs = ['form', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside'];

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
                    // Absolute/fixed positioning maps to CanvasPanel for free placement
                    return 'canvas';
                case 'relative':
                    // Relative positioning uses Overlay (allows top/left offsets within flow)
                    return 'overlay';
                case 'static':
                case 'sticky':
                default:
                    // Normal flow uses flex layout
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

            if (parsedBackgroundProps?.image) {
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

        UE.UMGManager.SynchronizeWidgetProperties(scrollBox);
        return scrollBox;
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
        }

        return widget;
    }

    update(widget: UE.Widget, oldProps: any, changedProps: any): void {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
            // update props
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

        if (childProps["_children_text_instance"]) {
            // Mirror TextConverter.setupTextBlockProperties for inline text instances
            if (child instanceof UE.TextBlock) {
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

                UE.UMGManager.SynchronizeWidgetProperties(child);
            }
        }
    }

    removeChild(parent: UE.Widget, child: UE.Widget): void {
        child.RemoveFromParent();
    }
}
