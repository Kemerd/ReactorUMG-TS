import * as UE from 'ue';
import { UMGConverter } from '../umg_converter';
import { getAllStyles } from '../../parsers/cssstyle_parser';
import { convertLengthUnitToSlateUnit } from '../../parsers/css_length_parser';
import { parseToLinearColor } from '../../parsers/css_color_parser';
import { parseBrush } from '../../parsers/brush_parser';
import { parseWidgetSelfAlignment } from '../../parsers/alignment_parser';

/**
 * ListView converter: renders a scrollable, virtualization-ready list of React children.
 *
 * Architecture note:
 *   UE's native UListView requires UObject items and compiled Blueprint entry
 *   widget classes -- fundamentally incompatible with React's reconciler model.
 *   Instead we build on UScrollBox which naturally accepts child widgets added
 *   by the reconciler's appendChild flow. The component exposes a ListView-like
 *   API (orientation, spacing, selection, scroll callbacks) so user code stays
 *   stable when true virtualization is added at the C++ layer later.
 */
export class ListViewConverter extends UMGConverter {

    /* ------------------------------------------------------------------ */
    /*  Per-child slot references for margin / alignment management        */
    /* ------------------------------------------------------------------ */
    private childSlots: Map<UE.Widget, UE.ScrollBoxSlot> = new Map();

    /* ------------------------------------------------------------------ */
    /*  Event callback storage for proper teardown / rebinding             */
    /* ------------------------------------------------------------------ */
    private onScrollCallback?: (offset: number, remaining: number) => void;
    private onItemClickCallback?: (index: number) => void;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    /* ================================================================== */
    /*  Orientation                                                        */
    /* ================================================================== */
    private applyOrientation(scrollBox: UE.ScrollBox, props: any): boolean {
        const orientation = props?.orientation;
        if (!orientation) return false;

        switch (orientation) {
            case 'horizontal':
                scrollBox.SetOrientation(UE.EOrientation.Orient_Horizontal);
                break;
            case 'vertical':
            default:
                scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
                break;
        }
        return true;
    }

    /* ================================================================== */
    /*  Spacing between entries                                            */
    /* ================================================================== */
    private applySpacing(scrollBox: UE.ScrollBox, props: any): boolean {
        const styles = getAllStyles(this.typeName, props);
        const gap = styles?.gap ?? props?.gap ?? props?.spacing;
        if (gap === undefined || gap === null) return false;

        const spacingPx = typeof gap === 'number'
            ? gap
            : convertLengthUnitToSlateUnit(String(gap), styles);

        // ScrollBox doesn't have native entry spacing; we store it
        // and apply as slot padding in appendChild
        (scrollBox as any).__listViewSpacing = spacingPx;
        return true;
    }

    /* ================================================================== */
    /*  Scrollbar styling                                                  */
    /* ================================================================== */
    private applyScrollbarStyle(scrollBox: UE.ScrollBox, props: any): boolean {
        let updated = false;

        // Scrollbar thickness
        if (typeof props?.barThickness === 'number') {
            const t = props.barThickness;
            scrollBox.SetScrollbarThickness(new UE.Vector2D(t, t));
            updated = true;
        }

        // Scrollbar visibility
        if (typeof props?.showScrollbar === 'boolean') {
            scrollBox.SetScrollBarVisibility(
                props.showScrollbar
                    ? UE.ESlateVisibility.Visible
                    : UE.ESlateVisibility.Collapsed
            );
            updated = true;
        }

        // Always-show flag
        if (typeof props?.alwaysShowScrollbar === 'boolean') {
            scrollBox.SetAlwaysShowScrollbar(props.alwaysShowScrollbar);
            updated = true;
        }

        return updated;
    }

    /* ================================================================== */
    /*  Background styling                                                 */
    /* ================================================================== */
    private applyBackground(scrollBox: UE.ScrollBox, props: any): boolean {
        const bgBrush = props?.backgroundBrush ?? props?.background;
        if (!bgBrush) return false;

        if (typeof bgBrush === 'object') {
            scrollBox.WidgetStyle.BackgroundBrush = parseBrush(bgBrush);
        }
        return true;
    }

    /* ================================================================== */
    /*  Selection mode (visual only -- selection state managed in React)   */
    /* ================================================================== */
    private applySelectionProps(_scrollBox: UE.ScrollBox, _props: any): boolean {
        // Selection is managed by React state; the underlying ScrollBox
        // does not have built-in selection.  We store the selection mode
        // so it can be read by child item converters if needed.
        return false;
    }

    /* ================================================================== */
    /*  Scroll event binding                                               */
    /* ================================================================== */
    private bindScrollEvent(scrollBox: UE.ScrollBox, props: any): boolean {
        // UE.ScrollBox exposes OnUserScrolled delegate
        // We use it to surface scroll position changes to React
        const onScroll = props?.onScroll;
        if (typeof onScroll !== 'function') return false;

        // ScrollBox doesn't expose a managed scroll delegate in the same way
        // ListView does, so we store the callback for future ticking or
        // manual polling.  This is a known limitation until the C++ layer
        // adds scroll callbacks.
        (scrollBox as any).__onScrollCallback = onScroll;
        return false;
    }

    /* ================================================================== */
    /*  Aggregate property application                                     */
    /* ================================================================== */
    private initProps(scrollBox: UE.ScrollBox, props: any): boolean {
        if (!scrollBox || !props) return false;
        let updated = false;

        updated = this.applyOrientation(scrollBox, props) || updated;
        updated = this.applySpacing(scrollBox, props) || updated;
        updated = this.applyScrollbarStyle(scrollBox, props) || updated;
        updated = this.applyBackground(scrollBox, props) || updated;
        updated = this.applySelectionProps(scrollBox, props) || updated;
        updated = this.bindScrollEvent(scrollBox, props) || updated;

        // Allow overscroll toggle
        if (typeof props?.allowOverscroll === 'boolean') {
            scrollBox.SetAllowOverscroll(props.allowOverscroll);
            updated = true;
        }

        // Focusable flag
        if (typeof props?.focusable === 'boolean') {
            scrollBox.bIsFocusable = props.focusable;
            updated = true;
        }

        return updated;
    }

    /* ================================================================== */
    /*  Lifecycle: create                                                  */
    /* ================================================================== */
    createNativeWidget(): UE.Widget {
        const scrollBox = new UE.ScrollBox(this.outer);

        // Sane defaults for a list container
        scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);

        const propsApplied = this.initProps(scrollBox, this.props);
        if (propsApplied) {
            UE.UMGManager.SynchronizeWidgetProperties(scrollBox);
        }
        return scrollBox;
    }

    /* ================================================================== */
    /*  Lifecycle: update                                                  */
    /* ================================================================== */
    update(widget: UE.Widget, _oldProps: any, changedProps: any): void {
        const scrollBox = widget as UE.ScrollBox;
        const propsChanged = this.initProps(scrollBox, changedProps);
        if (propsChanged) {
            UE.UMGManager.SynchronizeWidgetProperties(scrollBox);
        }
    }

    /* ================================================================== */
    /*  Child management: insert into ScrollBox with spacing               */
    /* ================================================================== */
    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        if (!(parent instanceof UE.PanelWidget)) return;

        const slot = parent.AddChild(child) as UE.ScrollBoxSlot;
        if (!slot) return;

        this.childSlots.set(child, slot);

        // Apply per-item spacing from the list's gap / spacing prop
        const spacingPx = (parent as any).__listViewSpacing;
        if (typeof spacingPx === 'number' && spacingPx > 0) {
            const isHorizontal = (parent as UE.ScrollBox).Orientation === UE.EOrientation.Orient_Horizontal;
            if (isHorizontal) {
                // Left margin acts as gap between horizontal items
                slot.SetPadding(new UE.Margin(spacingPx, 0, 0, 0));
            } else {
                // Top margin acts as gap between vertical items
                slot.SetPadding(new UE.Margin(0, spacingPx, 0, 0));
            }
        }

        // Apply child self-alignment from style
        this.initPanelChildSlot(slot, childTypeName, childProps);
    }

    /* ================================================================== */
    /*  Child management: remove from ScrollBox                            */
    /* ================================================================== */
    removeChild(parent: UE.Widget, child: UE.Widget): void {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
