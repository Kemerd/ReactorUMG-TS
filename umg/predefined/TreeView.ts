import * as UE from 'ue';
import { UMGConverter } from '../umg_converter';
import { getAllStyles } from '../../parsers/cssstyle_parser';
import { convertLengthUnitToSlateUnit } from '../../parsers/css_length_parser';
import { queueWidgetSync } from '../../perf/batch_sync';

/**
 * TreeView converter: renders a scrollable, expandable/collapsible tree structure.
 *
 * Architecture note:
 *   UE's native UTreeView extends UListView and requires UObject items with a
 *   BP_OnGetItemChildren delegate + compiled UserWidget entry classes. This
 *   fundamentally conflicts with React's declarative child model.
 *
 *   Instead, we build on UScrollBox as the scrollable container. The tree
 *   structure is expressed by nesting React <TreeViewItem> components as
 *   children. Each <TreeViewItem> manages its own expand/collapse state and
 *   indentation level, rendered as a vertical box containing:
 *     - A clickable header (button) for expand/collapse toggling
 *     - A child container (vertical box) that holds nested items
 *
 *   This approach keeps the component fully compatible with React's reconciler
 *   while exposing a tree-like API. True virtualized tree rendering can be
 *   added at the C++ layer later.
 */
export class TreeViewConverter extends UMGConverter {

    /* ------------------------------------------------------------------ */
    /*  Internal child slot tracking                                       */
    /* ------------------------------------------------------------------ */
    private childSlots: Map<UE.Widget, UE.ScrollBoxSlot> = new Map();

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    /* ================================================================== */
    /*  Orientation (trees are typically vertical but can be overridden)   */
    /* ================================================================== */
    private applyOrientation(scrollBox: UE.ScrollBox, props: any): boolean {
        const orientation = props?.orientation;
        if (orientation === 'horizontal') {
            scrollBox.SetOrientation(UE.EOrientation.Orient_Horizontal);
            return true;
        }
        // Default: vertical tree
        scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
        return true;
    }

    /* ================================================================== */
    /*  Indentation configuration                                          */
    /* ================================================================== */
    private applyIndentation(scrollBox: UE.ScrollBox, props: any): boolean {
        const indent = props?.indentation ?? props?.indent;
        if (indent === undefined || indent === null) return false;

        const indentPx = typeof indent === 'number'
            ? indent
            : convertLengthUnitToSlateUnit(String(indent), getAllStyles(this.typeName, props));

        // Store indentation value on the widget for TreeViewItem children to read
        (scrollBox as any).__treeViewIndent = indentPx;
        return true;
    }

    /* ================================================================== */
    /*  Item spacing (gap between sibling tree nodes)                      */
    /* ================================================================== */
    private applySpacing(scrollBox: UE.ScrollBox, props: any): boolean {
        const styles = getAllStyles(this.typeName, props);
        const gap = styles?.gap ?? props?.gap ?? props?.spacing;
        if (gap === undefined || gap === null) return false;

        const spacingPx = typeof gap === 'number'
            ? gap
            : convertLengthUnitToSlateUnit(String(gap), styles);

        (scrollBox as any).__treeViewSpacing = spacingPx;
        return true;
    }

    /* ================================================================== */
    /*  Scrollbar configuration                                            */
    /* ================================================================== */
    private applyScrollbarStyle(scrollBox: UE.ScrollBox, props: any): boolean {
        let updated = false;

        if (typeof props?.barThickness === 'number') {
            const t = props.barThickness;
            scrollBox.SetScrollbarThickness(new UE.Vector2D(t, t));
            updated = true;
        }

        if (typeof props?.showScrollbar === 'boolean') {
            scrollBox.SetScrollBarVisibility(
                props.showScrollbar
                    ? UE.ESlateVisibility.Visible
                    : UE.ESlateVisibility.Collapsed
            );
            updated = true;
        }

        if (typeof props?.alwaysShowScrollbar === 'boolean') {
            scrollBox.SetAlwaysShowScrollbar(props.alwaysShowScrollbar);
            updated = true;
        }

        return updated;
    }

    /* ================================================================== */
    /*  Aggregate property application                                     */
    /* ================================================================== */
    private initProps(scrollBox: UE.ScrollBox, props: any): boolean {
        if (!scrollBox || !props) return false;
        let updated = false;

        updated = this.applyOrientation(scrollBox, props) || updated;
        updated = this.applyIndentation(scrollBox, props) || updated;
        updated = this.applySpacing(scrollBox, props) || updated;
        updated = this.applyScrollbarStyle(scrollBox, props) || updated;

        // Allow overscroll
        if (typeof props?.allowOverscroll === 'boolean') {
            scrollBox.SetAllowOverscroll(props.allowOverscroll);
            updated = true;
        }

        return updated;
    }

    /* ================================================================== */
    /*  Lifecycle: create                                                  */
    /* ================================================================== */
    createNativeWidget(): UE.Widget {
        const scrollBox = new UE.ScrollBox(this.outer);

        // Trees are vertical by default
        scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);

        // Default indentation of 16px per tree depth level
        (scrollBox as any).__treeViewIndent = 16;

        const propsApplied = this.initProps(scrollBox, this.props);
        if (propsApplied) {
            queueWidgetSync(scrollBox);
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
            queueWidgetSync(scrollBox);
        }
    }

    /* ================================================================== */
    /*  Child management                                                   */
    /* ================================================================== */
    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        if (!(parent instanceof UE.PanelWidget)) return;

        const slot = parent.AddChild(child) as UE.ScrollBoxSlot;
        if (!slot) return;

        this.childSlots.set(child, slot);

        // Apply spacing between sibling tree nodes
        const spacingPx = (parent as any).__treeViewSpacing;
        if (typeof spacingPx === 'number' && spacingPx > 0) {
            slot.SetPadding(new UE.Margin(0, spacingPx, 0, 0));
        }

        // Apply child alignment
        this.initPanelChildSlot(slot, childTypeName, childProps);
    }

    removeChild(parent: UE.Widget, child: UE.Widget): void {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}

/**
 * TreeViewItem converter: represents a single node in the tree.
 *
 * Each TreeViewItem is rendered as a vertical box containing the item's
 * content. The expand/collapse behavior and indentation are managed by
 * React state on the JS side -- this converter simply renders the
 * container and applies indentation based on the `depth` prop.
 *
 * Usage in React:
 *   <TreeView>
 *     <TreeViewItem depth={0} expanded={true}>
 *       <div>Root Node</div>
 *       <TreeViewItem depth={1}>
 *         <div>Child Node</div>
 *       </TreeViewItem>
 *     </TreeViewItem>
 *   </TreeView>
 */
export class TreeViewItemConverter extends UMGConverter {

    private childSlots: Map<UE.Widget, UE.PanelSlot> = new Map();

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    /* ================================================================== */
    /*  Indentation via left padding based on depth level                  */
    /* ================================================================== */
    private applyDepthIndentation(verticalBox: UE.VerticalBox, props: any): boolean {
        const depth = props?.depth ?? 0;
        const indentPerLevel = props?.indentation ?? 16;
        const totalIndent = depth * indentPerLevel;

        if (totalIndent > 0) {
            // Store for child slot padding application
            (verticalBox as any).__treeItemIndent = totalIndent;
        }
        return totalIndent > 0;
    }

    /* ================================================================== */
    /*  Expansion state (visual only -- React manages actual state)        */
    /* ================================================================== */
    private applyExpansionState(verticalBox: UE.VerticalBox, props: any): boolean {
        // The expanded prop controls visibility of child items in the tree.
        // Since React reconciler handles adding/removing children, this is
        // primarily used for initial render optimization.
        const expanded = props?.expanded;
        if (expanded === false) {
            verticalBox.SetVisibility(UE.ESlateVisibility.Collapsed);
            return true;
        } else {
            verticalBox.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
            return true;
        }
    }

    /* ================================================================== */
    /*  Lifecycle                                                          */
    /* ================================================================== */
    createNativeWidget(): UE.Widget {
        const verticalBox = new UE.VerticalBox(this.outer);

        this.applyDepthIndentation(verticalBox, this.props);

        // Don't apply expansion state on create -- let React handle visibility
        // through its normal child rendering flow

        queueWidgetSync(verticalBox);
        return verticalBox;
    }

    update(widget: UE.Widget, _oldProps: any, changedProps: any): void {
        const verticalBox = widget as UE.VerticalBox;
        let propsChanged = false;

        propsChanged = this.applyDepthIndentation(verticalBox, changedProps) || propsChanged;

        if (propsChanged) {
            queueWidgetSync(verticalBox);
        }
    }

    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
        if (!(parent instanceof UE.PanelWidget)) return;

        const slot = parent.AddChild(child);
        if (!slot) return;

        this.childSlots.set(child, slot);

        // Apply indentation as left padding on the slot
        const indent = (parent as any).__treeItemIndent;
        if (typeof indent === 'number' && indent > 0 && typeof (slot as any).SetPadding === 'function') {
            (slot as any).SetPadding(new UE.Margin(indent, 0, 0, 0));
        }

        this.initPanelChildSlot(slot, childTypeName, childProps);
    }

    removeChild(parent: UE.Widget, child: UE.Widget): void {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
