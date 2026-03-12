"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListViewConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const css_length_parser_1 = require("../../parsers/css_length_parser");
const batch_sync_1 = require("../../perf/batch_sync");
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
class ListViewConverter extends umg_converter_1.UMGConverter {
    /* ------------------------------------------------------------------ */
    /*  Per-child slot references for margin / alignment management        */
    /* ------------------------------------------------------------------ */
    childSlots = new Map();
    /* ------------------------------------------------------------------ */
    /*  Event callback storage for proper teardown / rebinding             */
    /* ------------------------------------------------------------------ */
    onScrollHandler;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    /* ================================================================== */
    /*  Orientation                                                        */
    /* ================================================================== */
    applyOrientation(scrollBox, props) {
        const orientation = props?.orientation;
        if (!orientation)
            return false;
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
    applySpacing(scrollBox, props) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
        const gap = styles?.gap ?? props?.gap ?? props?.spacing;
        if (gap === undefined || gap === null)
            return false;
        const spacingPx = typeof gap === 'number'
            ? gap
            : (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(gap), styles);
        // ScrollBox doesn't have native entry spacing; we store it
        // and apply as slot padding in appendChild
        scrollBox.__listViewSpacing = spacingPx;
        return true;
    }
    /* ================================================================== */
    /*  Scrollbar styling                                                  */
    /* ================================================================== */
    applyScrollbarStyle(scrollBox, props) {
        let updated = false;
        // Scrollbar thickness
        if (typeof props?.barThickness === 'number') {
            const t = props.barThickness;
            scrollBox.SetScrollbarThickness(new UE.Vector2D(t, t));
            updated = true;
        }
        // Scrollbar visibility
        if (typeof props?.showScrollbar === 'boolean') {
            scrollBox.SetScrollBarVisibility(props.showScrollbar
                ? UE.ESlateVisibility.Visible
                : UE.ESlateVisibility.Collapsed);
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
    /*  Selection mode (visual only -- selection state managed in React)   */
    /* ================================================================== */
    applySelectionProps(_scrollBox, _props) {
        // Selection is managed by React state; the underlying ScrollBox
        // does not have built-in selection.  We store the selection mode
        // so it can be read by child item converters if needed.
        return false;
    }
    /* ================================================================== */
    /*  Scroll event binding via ScrollBox.OnUserScrolled delegate          */
    /* ================================================================== */
    bindScrollEvent(scrollBox, props) {
        const onScroll = props?.onScroll;
        // Teardown previous handler to avoid duplicate bindings
        if (this.onScrollHandler) {
            scrollBox.OnUserScrolled.Remove(this.onScrollHandler);
            this.onScrollHandler = undefined;
        }
        if (typeof onScroll !== 'function')
            return false;
        // Bind to the native OnUserScrolled delegate
        this.onScrollHandler = (currentOffset) => {
            try {
                onScroll(currentOffset);
            }
            catch (e) {
                console.warn('ListView onScroll error:', e);
            }
        };
        scrollBox.OnUserScrolled.Add(this.onScrollHandler);
        return true;
    }
    /* ================================================================== */
    /*  Aggregate property application                                     */
    /* ================================================================== */
    initProps(scrollBox, props) {
        if (!scrollBox || !props)
            return false;
        let updated = false;
        updated = this.applyOrientation(scrollBox, props) || updated;
        updated = this.applySpacing(scrollBox, props) || updated;
        updated = this.applyScrollbarStyle(scrollBox, props) || updated;
        updated = this.applySelectionProps(scrollBox, props) || updated;
        updated = this.bindScrollEvent(scrollBox, props) || updated;
        // Allow overscroll toggle
        if (typeof props?.allowOverscroll === 'boolean') {
            scrollBox.SetAllowOverscroll(props.allowOverscroll);
            updated = true;
        }
        return updated;
    }
    /* ================================================================== */
    /*  Lifecycle: create                                                  */
    /* ================================================================== */
    createNativeWidget() {
        const scrollBox = new UE.ScrollBox(this.outer);
        // Sane defaults for a list container
        scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
        const propsApplied = this.initProps(scrollBox, this.props);
        if (propsApplied) {
            (0, batch_sync_1.queueWidgetSync)(scrollBox);
        }
        return scrollBox;
    }
    /* ================================================================== */
    /*  Lifecycle: update                                                  */
    /* ================================================================== */
    update(widget, _oldProps, changedProps) {
        const scrollBox = widget;
        const propsChanged = this.initProps(scrollBox, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(scrollBox);
        }
    }
    /* ================================================================== */
    /*  Child management: insert into ScrollBox with spacing               */
    /* ================================================================== */
    appendChild(parent, child, childTypeName, childProps) {
        if (!(parent instanceof UE.PanelWidget))
            return;
        const slot = parent.AddChild(child);
        if (!slot)
            return;
        this.childSlots.set(child, slot);
        // Apply per-item spacing from the list's gap / spacing prop
        const spacingPx = parent.__listViewSpacing;
        if (typeof spacingPx === 'number' && spacingPx > 0) {
            const isHorizontal = parent.Orientation === UE.EOrientation.Orient_Horizontal;
            if (isHorizontal) {
                // Left margin acts as gap between horizontal items
                slot.SetPadding(new UE.Margin(spacingPx, 0, 0, 0));
            }
            else {
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
    removeChild(parent, child) {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
    /* ================================================================== */
    /*  Cleanup: unbind scroll event on disposal                           */
    /* ================================================================== */
    dispose() {
        this.onScrollHandler = undefined;
        this.childSlots.clear();
    }
}
exports.ListViewConverter = ListViewConverter;
//# sourceMappingURL=ListView.js.map