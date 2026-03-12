"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeViewItemConverter = exports.TreeViewConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const css_length_parser_1 = require("../../parsers/css_length_parser");
const batch_sync_1 = require("../../perf/batch_sync");
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
class TreeViewConverter extends umg_converter_1.UMGConverter {
    /* ------------------------------------------------------------------ */
    /*  Internal child slot tracking                                       */
    /* ------------------------------------------------------------------ */
    childSlots = new Map();
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    /* ================================================================== */
    /*  Orientation (trees are typically vertical but can be overridden)   */
    /* ================================================================== */
    applyOrientation(scrollBox, props) {
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
    applyIndentation(scrollBox, props) {
        const indent = props?.indentation ?? props?.indent;
        if (indent === undefined || indent === null)
            return false;
        const indentPx = typeof indent === 'number'
            ? indent
            : (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(indent), (0, cssstyle_parser_1.getAllStyles)(this.typeName, props));
        // Store indentation value on the widget for TreeViewItem children to read
        scrollBox.__treeViewIndent = indentPx;
        return true;
    }
    /* ================================================================== */
    /*  Item spacing (gap between sibling tree nodes)                      */
    /* ================================================================== */
    applySpacing(scrollBox, props) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
        const gap = styles?.gap ?? props?.gap ?? props?.spacing;
        if (gap === undefined || gap === null)
            return false;
        const spacingPx = typeof gap === 'number'
            ? gap
            : (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(gap), styles);
        scrollBox.__treeViewSpacing = spacingPx;
        return true;
    }
    /* ================================================================== */
    /*  Scrollbar configuration                                            */
    /* ================================================================== */
    applyScrollbarStyle(scrollBox, props) {
        let updated = false;
        if (typeof props?.barThickness === 'number') {
            const t = props.barThickness;
            scrollBox.SetScrollbarThickness(new UE.Vector2D(t, t));
            updated = true;
        }
        if (typeof props?.showScrollbar === 'boolean') {
            scrollBox.SetScrollBarVisibility(props.showScrollbar
                ? UE.ESlateVisibility.Visible
                : UE.ESlateVisibility.Collapsed);
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
    initProps(scrollBox, props) {
        if (!scrollBox || !props)
            return false;
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
    createNativeWidget() {
        const scrollBox = new UE.ScrollBox(this.outer);
        // Trees are vertical by default
        scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
        // Default indentation of 16px per tree depth level
        scrollBox.__treeViewIndent = 16;
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
    /*  Child management                                                   */
    /* ================================================================== */
    appendChild(parent, child, childTypeName, childProps) {
        if (!(parent instanceof UE.PanelWidget))
            return;
        const slot = parent.AddChild(child);
        if (!slot)
            return;
        this.childSlots.set(child, slot);
        // Apply spacing between sibling tree nodes
        const spacingPx = parent.__treeViewSpacing;
        if (typeof spacingPx === 'number' && spacingPx > 0) {
            slot.SetPadding(new UE.Margin(0, spacingPx, 0, 0));
        }
        // Apply child alignment
        this.initPanelChildSlot(slot, childTypeName, childProps);
    }
    removeChild(parent, child) {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
exports.TreeViewConverter = TreeViewConverter;
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
class TreeViewItemConverter extends umg_converter_1.UMGConverter {
    childSlots = new Map();
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    /* ================================================================== */
    /*  Indentation via left padding based on depth level                  */
    /* ================================================================== */
    applyDepthIndentation(verticalBox, props) {
        const depth = props?.depth ?? 0;
        const indentPerLevel = props?.indentation ?? 16;
        const totalIndent = depth * indentPerLevel;
        if (totalIndent > 0) {
            // Store for child slot padding application
            verticalBox.__treeItemIndent = totalIndent;
        }
        return totalIndent > 0;
    }
    /* ================================================================== */
    /*  Expansion state (visual only -- React manages actual state)        */
    /* ================================================================== */
    applyExpansionState(verticalBox, props) {
        // The expanded prop controls visibility of child items in the tree.
        // Since React reconciler handles adding/removing children, this is
        // primarily used for initial render optimization.
        const expanded = props?.expanded;
        if (expanded === false) {
            verticalBox.SetVisibility(UE.ESlateVisibility.Collapsed);
            return true;
        }
        else {
            verticalBox.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
            return true;
        }
    }
    /* ================================================================== */
    /*  Lifecycle                                                          */
    /* ================================================================== */
    createNativeWidget() {
        const verticalBox = new UE.VerticalBox(this.outer);
        this.applyDepthIndentation(verticalBox, this.props);
        // Don't apply expansion state on create -- let React handle visibility
        // through its normal child rendering flow
        (0, batch_sync_1.queueWidgetSync)(verticalBox);
        return verticalBox;
    }
    update(widget, _oldProps, changedProps) {
        const verticalBox = widget;
        let propsChanged = false;
        propsChanged = this.applyDepthIndentation(verticalBox, changedProps) || propsChanged;
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(verticalBox);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (!(parent instanceof UE.PanelWidget))
            return;
        const slot = parent.AddChild(child);
        if (!slot)
            return;
        this.childSlots.set(child, slot);
        // Apply indentation as left padding on the slot
        const indent = parent.__treeItemIndent;
        if (typeof indent === 'number' && indent > 0 && typeof slot.SetPadding === 'function') {
            slot.SetPadding(new UE.Margin(indent, 0, 0, 0));
        }
        this.initPanelChildSlot(slot, childTypeName, childProps);
    }
    removeChild(parent, child) {
        this.childSlots.delete(child);
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
exports.TreeViewItemConverter = TreeViewItemConverter;
//# sourceMappingURL=TreeView.js.map