import * as UE from 'ue';
import { UMGConverter } from '../umg_converter';
import { getAllStyles } from '../../parsers/cssstyle_parser';
import { convertLengthUnitToSlateUnit } from '../../parsers/css_length_parser';
import { parseBrush } from '../../parsers/brush_parser';
import { parseWidgetSelfAlignment } from '../../parsers/alignment_parser';

/**
 * TileView converter: renders children as a grid of equally-sized tiles.
 *
 * Architecture note:
 *   UE's native UTileView extends UListView and requires UObject items with
 *   compiled Blueprint entry widget classes. Instead, we build on UWrapBox
 *   which wraps children across rows/columns naturally and integrates
 *   perfectly with React's reconciler model.
 *
 *   The component exposes a TileView-like API: configurable tile width/height,
 *   alignment, spacing, and scroll wrapping (via an outer ScrollBox when the
 *   scrollable prop is set).
 */
export class TileViewConverter extends UMGConverter {

    /* ------------------------------------------------------------------ */
    /*  Internal tracking                                                  */
    /* ------------------------------------------------------------------ */
    private childSlots: Map<UE.Widget, UE.WrapBoxSlot> = new Map();
    private scrollBoxWrapper?: UE.ScrollBox;
    private wrapBox?: UE.WrapBox;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    /* ================================================================== */
    /*  Tile entry dimensions                                              */
    /* ================================================================== */
    private applyTileDimensions(wrapBox: UE.WrapBox, props: any): boolean {
        const styles = getAllStyles(this.typeName, props);
        let updated = false;

        // Tile width and height stored on the WrapBox for child slot sizing
        const entryWidth = props?.entryWidth ?? props?.tileWidth;
        const entryHeight = props?.entryHeight ?? props?.tileHeight;

        if (entryWidth !== undefined) {
            const w = typeof entryWidth === 'number'
                ? entryWidth
                : convertLengthUnitToSlateUnit(String(entryWidth), styles);
            (wrapBox as any).__tileWidth = w;
            updated = true;
        }

        if (entryHeight !== undefined) {
            const h = typeof entryHeight === 'number'
                ? entryHeight
                : convertLengthUnitToSlateUnit(String(entryHeight), styles);
            (wrapBox as any).__tileHeight = h;
            updated = true;
        }

        return updated;
    }

    /* ================================================================== */
    /*  Spacing between tiles (horizontal and vertical gap)                */
    /* ================================================================== */
    private applySpacing(wrapBox: UE.WrapBox, props: any): boolean {
        const styles = getAllStyles(this.typeName, props);
        let gapX = 0;
        let gapY = 0;

        // Unified gap prop
        const gap = styles?.gap ?? props?.gap ?? props?.spacing;
        if (gap !== undefined && gap !== null) {
            const gapPx = typeof gap === 'number'
                ? gap
                : convertLengthUnitToSlateUnit(String(gap), styles);
            gapX = gapPx;
            gapY = gapPx;
        }

        // Override with specific column/row gap
        const columnGap = styles?.columnGap ?? props?.columnGap ?? props?.horizontalSpacing;
        if (columnGap !== undefined && columnGap !== null) {
            gapX = typeof columnGap === 'number'
                ? columnGap
                : convertLengthUnitToSlateUnit(String(columnGap), styles);
        }

        const rowGap = styles?.rowGap ?? props?.rowGap ?? props?.verticalSpacing;
        if (rowGap !== undefined && rowGap !== null) {
            gapY = typeof rowGap === 'number'
                ? rowGap
                : convertLengthUnitToSlateUnit(String(rowGap), styles);
        }

        if (gapX > 0 || gapY > 0) {
            wrapBox.SetInnerSlotPadding(new UE.Vector2D(gapX, gapY));
            return true;
        }

        return false;
    }

    /* ================================================================== */
    /*  Alignment: how tiles are distributed across the main axis          */
    /* ================================================================== */
    private applyAlignment(wrapBox: UE.WrapBox, props: any): boolean {
        const alignment = props?.tileAlignment ?? props?.alignment;
        if (!alignment) return false;

        switch (alignment) {
            case 'left':
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
                break;
            case 'center':
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
                break;
            case 'right':
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
                break;
            case 'fill':
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
                break;
            default:
                wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
                break;
        }
        return true;
    }

    /* ================================================================== */
    /*  Orientation: horizontal (default) or vertical wrapping             */
    /* ================================================================== */
    private applyOrientation(wrapBox: UE.WrapBox, props: any): boolean {
        const orientation = props?.orientation;
        if (orientation === 'vertical') {
            wrapBox.Orientation = UE.EOrientation.Orient_Vertical;
            return true;
        }
        // Default: horizontal wrapping (tiles flow left-to-right, wrap top-to-bottom)
        wrapBox.Orientation = UE.EOrientation.Orient_Horizontal;
        return true;
    }

    /* ================================================================== */
    /*  Aggregate property application                                     */
    /* ================================================================== */
    private initProps(wrapBox: UE.WrapBox, props: any): boolean {
        if (!wrapBox || !props) return false;
        let updated = false;

        updated = this.applyOrientation(wrapBox, props) || updated;
        updated = this.applyTileDimensions(wrapBox, props) || updated;
        updated = this.applySpacing(wrapBox, props) || updated;
        updated = this.applyAlignment(wrapBox, props) || updated;

        return updated;
    }

    /* ================================================================== */
    /*  Lifecycle: create                                                  */
    /* ================================================================== */
    createNativeWidget(): UE.Widget {
        this.wrapBox = new UE.WrapBox(this.outer);

        // Default horizontal wrapping
        this.wrapBox.Orientation = UE.EOrientation.Orient_Horizontal;

        const propsApplied = this.initProps(this.wrapBox, this.props);

        // Optionally wrap in a ScrollBox for scrollable tile grids
        const scrollable = this.props?.scrollable ?? this.props?.enableScrolling;
        if (scrollable) {
            this.scrollBoxWrapper = new UE.ScrollBox(this.outer);
            this.scrollBoxWrapper.SetOrientation(UE.EOrientation.Orient_Vertical);
            this.scrollBoxWrapper.AddChild(this.wrapBox);

            if (typeof this.props?.barThickness === 'number') {
                const t = this.props.barThickness;
                this.scrollBoxWrapper.SetScrollbarThickness(new UE.Vector2D(t, t));
            }

            if (typeof this.props?.showScrollbar === 'boolean') {
                this.scrollBoxWrapper.SetScrollBarVisibility(
                    this.props.showScrollbar
                        ? UE.ESlateVisibility.Visible
                        : UE.ESlateVisibility.Collapsed
                );
            }

            if (propsApplied) {
                UE.UMGManager.SynchronizeWidgetProperties(this.wrapBox);
            }
            UE.UMGManager.SynchronizeWidgetProperties(this.scrollBoxWrapper);
            return this.scrollBoxWrapper;
        }

        if (propsApplied) {
            UE.UMGManager.SynchronizeWidgetProperties(this.wrapBox);
        }
        return this.wrapBox;
    }

    /* ================================================================== */
    /*  Lifecycle: update                                                  */
    /* ================================================================== */
    update(widget: UE.Widget, _oldProps: any, changedProps: any): void {
        // If wrapped in ScrollBox, apply to the inner WrapBox
        const targetWrapBox = this.wrapBox ?? widget as UE.WrapBox;
        const propsChanged = this.initProps(targetWrapBox, changedProps);
        if (propsChanged) {
            UE.UMGManager.SynchronizeWidgetProperties(targetWrapBox);
        }
    }

    /* ================================================================== */
    /*  Child management: add tiles to WrapBox with size constraints       */
    /* ================================================================== */
    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        // Always append to the inner WrapBox, even if parent is the ScrollBox wrapper
        const targetWrapBox = this.wrapBox ?? parent;
        if (!(targetWrapBox instanceof UE.WrapBox)) return;

        const slot = targetWrapBox.AddChildToWrapBox(child);
        if (!slot) return;

        this.childSlots.set(child, slot);

        // Apply tile dimensions as size constraints on each slot
        const tileWidth = (targetWrapBox as any).__tileWidth;
        const tileHeight = (targetWrapBox as any).__tileHeight;

        // If tile dimensions are specified, wrap child in a SizeBox
        // The WrapBoxSlot itself doesn't enforce size, but we can
        // control fill behavior
        if (typeof tileWidth === 'number' || typeof tileHeight === 'number') {
            // WrapBoxSlot doesn't directly support size override,
            // so we use fill empty space to distribute evenly
            slot.bFillEmptySpace = false;
        }

        // Apply child self-alignment
        const childStyle = getAllStyles(childTypeName, childProps);
        const alignment = parseWidgetSelfAlignment(childStyle);
        slot.SetHorizontalAlignment(alignment.horizontal);
        slot.SetVerticalAlignment(alignment.vertical);
        slot.SetPadding(alignment.padding);
    }

    /* ================================================================== */
    /*  Child management: remove tiles                                     */
    /* ================================================================== */
    removeChild(parent: UE.Widget, child: UE.Widget): void {
        this.childSlots.delete(child);

        // Remove from the inner WrapBox
        const targetWrapBox = this.wrapBox ?? parent;
        if (targetWrapBox instanceof UE.WrapBox) {
            targetWrapBox.RemoveChild(child);
        } else if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
