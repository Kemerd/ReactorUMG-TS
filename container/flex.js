"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlexConverter = void 0;
const UE = require("ue");
const container_converter_1 = require("./container_converter");
const alignment_parser_1 = require("../parsers/alignment_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_margin_parser_1 = require("../parsers/css_margin_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const utils_1 = require("../misc/utils");
const batch_sync_1 = require("../perf/batch_sync");
class FlexConverter extends container_converter_1.ContainerConverter {
    isRow;
    isReverse;
    isWrap;
    mainAxisGap;
    crossAxisGap;
    boxWidgetWhenUsingWrapbox;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        [this.isRow, this.isReverse] = this.parseFlexDirection();
        this.resolveFlexWrap();
        this.computeGapValues();
    }
    parseFlexDirection() {
        const style = this.containerStyle || {};
        let flexDirection = style?.flexDirection;
        const flexFlow = style?.flexFlow;
        const display = style?.display;
        if (flexFlow) {
            const flexFlowArray = flexFlow.trim().split(' ');
            if (flexFlowArray.length >= 1) {
                flexDirection = flexFlowArray[0];
            }
        }
        if (display && display === 'flex' && !flexDirection) {
            flexDirection = 'row'; // Default to row if display is flex
        }
        else if (!flexDirection) {
            flexDirection = 'column'; // Default to column if not specified
        }
        const normalized = flexDirection.trim().toLowerCase();
        return [
            normalized.startsWith('row'),
            normalized.endsWith('-reverse')
        ];
    }
    resolveFlexWrap() {
        const style = this.containerStyle || {};
        let flexWrap = style.flexWrap;
        if (!flexWrap && style.flexFlow) {
            const flexFlowArray = style.flexFlow.trim().split(' ');
            if (flexFlowArray.length >= 2) {
                flexWrap = flexFlowArray[1];
            }
        }
        const normalized = (flexWrap || '').toString().trim().toLowerCase();
        this.isWrap = normalized === 'wrap' || normalized === 'wrap-reverse';
    }
    convertLengthValue(value) {
        if (value === undefined || value === null) {
            return 0;
        }
        if (typeof value === 'number') {
            return value;
        }
        const stringValue = value.toString().trim();
        if (!stringValue || stringValue === 'normal') {
            return 0;
        }
        return (0, css_length_parser_1.convertLengthUnitToSlateUnit)(stringValue, this.containerStyle);
    }
    computeGapValues() {
        const style = this.containerStyle || {};
        let columnGap = 0;
        let rowGap = 0;
        if (style.gap) {
            const gapVector = (0, css_margin_parser_1.convertGap)(style.gap, style);
            columnGap = gapVector.X;
            rowGap = gapVector.Y;
        }
        if (style.columnGap) {
            columnGap = this.convertLengthValue(style.columnGap);
        }
        if (style.rowGap) {
            rowGap = this.convertLengthValue(style.rowGap);
        }
        columnGap = isNaN(columnGap) ? 0 : columnGap;
        rowGap = isNaN(rowGap) ? 0 : rowGap;
        if (this.isRow) {
            this.mainAxisGap = columnGap;
            this.crossAxisGap = rowGap;
        }
        else {
            this.mainAxisGap = rowGap;
            this.crossAxisGap = columnGap;
        }
    }
    getFlexGrowValue(style) {
        if (!style) {
            return null;
        }
        if (style.flexGrow !== undefined) {
            const value = (0, utils_1.safeParseFloat)(style.flexGrow);
            return isNaN(value) ? null : value;
        }
        if (style.flex !== undefined) {
            if (typeof style.flex === 'number') {
                return style.flex;
            }
            if (typeof style.flex === 'string') {
                const tokens = style.flex.trim().split(/\s+/);
                for (const token of tokens) {
                    const value = (0, utils_1.safeParseFloat)(token);
                    if (!isNaN(value)) {
                        return value;
                    }
                }
                if (style.flex === 'auto') {
                    return 1;
                }
                if (style.flex === 'none') {
                    return 0;
                }
            }
        }
        return null;
    }
    setAlignmentUsingActions(slot, alignmentActions, childStyle) {
        const justifyContent = this.containerStyle?.justifyContent || '';
        const alignItems = this.containerStyle?.alignItems || '';
        const childJustifySelf = childStyle?.justifySelf || '';
        const childAlignSelf = childStyle?.alignSelf || '';
        if (justifyContent === 'space-between' &&
            typeof alignmentActions.spaceBetween === 'function' &&
            typeof slot.SetSize === 'function') {
            const flexGrow = this.getFlexGrowValue(childStyle) ?? 1;
            alignmentActions.spaceBetween(slot, flexGrow);
        }
        const alignSelfValue = childAlignSelf?.split(' ').find((v) => alignmentActions.alignSelf[v]);
        if (alignSelfValue) {
            alignmentActions.alignSelf[alignSelfValue](slot);
        }
        else {
            const alignItemsValue = alignItems.split(' ').find((v) => alignmentActions.alignSelf[v]);
            if (alignItemsValue) {
                alignmentActions.alignSelf[alignItemsValue](slot);
            }
        }
        const justifySelfValue = childJustifySelf?.split(' ').find((v) => alignmentActions.justifySelf[v]);
        if (justifySelfValue) {
            alignmentActions.justifySelf[justifySelfValue](slot);
        }
        else {
            const justifyContentValue = justifyContent.split(' ').find((v) => alignmentActions.justifySelf[v]);
            if (justifyContentValue) {
                alignmentActions.justifySelf[justifyContentValue](slot);
            }
        }
    }
    initHorizontalBoxSlot(horizontalBoxSlot, childStyle) {
        const alignmentActions = (0, alignment_parser_1.parseFlexHorizontalAlignmentActions)();
        this.setAlignmentUsingActions(horizontalBoxSlot, alignmentActions, childStyle);
    }
    initVerticalBoxSlot(verticalBoxSlot, childStyle) {
        const alignmentActions = (0, alignment_parser_1.parseFlexVerticalAlignmentActions)();
        this.setAlignmentUsingActions(verticalBoxSlot, alignmentActions, childStyle);
    }
    initWrapBoxSlot(wrapBoxSlot, childStyle) {
        const alignmentActions = this.isRow
            ? (0, alignment_parser_1.parseFlexHorizontalAlignmentActions)()
            : (0, alignment_parser_1.parseFlexVerticalAlignmentActions)();
        this.setAlignmentUsingActions(wrapBoxSlot, alignmentActions, childStyle);
    }
    applyFlexSizingToSlot(slot, childStyle) {
        const flexGrowValue = this.getFlexGrowValue(childStyle);
        if (flexGrowValue === null || isNaN(flexGrowValue)) {
            // if (slot instanceof UE.HorizontalBoxSlot) {
            //     slot.SetSize(new UE.SlateChildSize(1, UE.ESlateSizeRule.Fill));
            // }
            return;
        }
        if (slot instanceof UE.HorizontalBoxSlot || slot instanceof UE.VerticalBoxSlot) {
            slot.SetSize(new UE.SlateChildSize(flexGrowValue, UE.ESlateSizeRule.Fill));
        }
        else if (slot instanceof UE.WrapBoxSlot) {
            slot.SetFillEmptySpace(flexGrowValue > 0);
            if (flexGrowValue > 0) {
                slot.SetFillSpanWhenLessThan(flexGrowValue);
            }
        }
    }
    applyGapToSlot(slot, isFirstChild) {
        if (!this.mainAxisGap || this.mainAxisGap <= 0) {
            return;
        }
        const currentPadding = slot.Padding
            ? new UE.Margin(slot.Padding.Left, slot.Padding.Top, slot.Padding.Right, slot.Padding.Bottom)
            : new UE.Margin(0, 0, 0, 0);
        if (!isFirstChild) {
            if (this.isRow) {
                if (this.isReverse) {
                    currentPadding.Right += this.mainAxisGap;
                }
                else {
                    currentPadding.Left += this.mainAxisGap;
                }
            }
            else {
                if (this.isReverse) {
                    currentPadding.Bottom += this.mainAxisGap;
                }
                else {
                    currentPadding.Top += this.mainAxisGap;
                }
            }
        }
        slot.SetPadding(currentPadding);
    }
    configureWrapBox(wrapBox, update) {
        wrapBox.Orientation = this.isRow
            ? UE.EOrientation.Orient_Horizontal
            : UE.EOrientation.Orient_Vertical;
        const paddingX = this.isRow ? (this.mainAxisGap || 0) : (this.crossAxisGap || 0);
        const paddingY = this.isRow ? (this.crossAxisGap || 0) : (this.mainAxisGap || 0);
        wrapBox.SetInnerSlotPadding(new UE.Vector2D(paddingX, paddingY));
        // if (!update)
        //     wrapBox.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
        // Apply flow direction preference based on direction and reverse settings
        if (this.isRow) {
            wrapBox.FlowDirectionPreference = this.isReverse
                ? UE.EFlowDirectionPreference.RightToLeft
                : UE.EFlowDirectionPreference.LeftToRight;
        }
        else {
            // For column wrap, reverse affects the cross-axis wrapping direction
            wrapBox.FlowDirectionPreference = this.isReverse
                ? UE.EFlowDirectionPreference.RightToLeft
                : UE.EFlowDirectionPreference.LeftToRight;
        }
        // Queued for batched sync – changes take effect when the queue flushes
        (0, batch_sync_1.queueWidgetSync)(wrapBox);
    }
    createNativeWidget() {
        if (this.isWrap) {
            const wrapBox = new UE.WrapBox(this.outer);
            this.configureWrapBox(wrapBox);
            return wrapBox;
        }
        const widget = this.isRow ? new UE.HorizontalBox(this.outer) : new UE.VerticalBox(this.outer);
        if (this.isRow) {
            widget.FlowDirectionPreference = this.isReverse
                ? UE.EFlowDirectionPreference.RightToLeft
                : UE.EFlowDirectionPreference.LeftToRight;
        }
        else if (this.isReverse) {
            // todo: column-reverse requires manual child order adjustments when appending/removing children
        }
        // if (this.isWrap) {
        //     const wrapBox = new UE.WrapBox(this.outer);
        //     this.configureWrapBox(wrapBox);
        //     wrapBox.AddChildToWrapBox(widget);
        //     this.boxWidgetWhenUsingWrapbox = widget;
        //     return wrapBox;
        // }
        return widget;
    }
    update(widget, oldProps, changedProps) {
        const mergedProps = { ...oldProps, ...changedProps };
        this.props = mergedProps;
        this.containerStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, mergedProps);
        [this.isRow, this.isReverse] = this.parseFlexDirection();
        this.resolveFlexWrap();
        this.computeGapValues();
        if (widget instanceof UE.WrapBox) {
            this.configureWrapBox(widget, true);
        }
        else if (widget instanceof UE.HorizontalBox) {
            widget.FlowDirectionPreference = this.isReverse
                ? UE.EFlowDirectionPreference.RightToLeft
                : UE.EFlowDirectionPreference.LeftToRight;
            (0, batch_sync_1.queueWidgetSync)(widget);
        }
        else if (widget instanceof UE.VerticalBox) {
            // Left intentionally blank: reversing vertical flow requires reordering slots which is handled during append/remove.
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        const panelParent = parent;
        const existingCount = panelParent ? panelParent.GetChildrenCount() : 0;
        // ------------------------------------------------------------------
        // Lazy slot creation: when a child mounts with Collapsed visibility,
        // add it to the panel (preserving tree structure) but skip the
        // expensive style resolution, alignment parsing, padding conversion,
        // and flex sizing computation.  The slot keeps its default values
        // until the child transitions to a visible state, at which point
        // completeDeferredSlotSetup applies the full configuration.
        // ------------------------------------------------------------------
        if (this.isChildCollapsed(child)) {
            if (parent instanceof UE.WrapBox) {
                parent.AddChildToWrapBox(child);
            }
            else if (parent instanceof UE.HorizontalBox) {
                parent.AddChildToHorizontalBox(child);
            }
            else if (parent instanceof UE.VerticalBox) {
                parent.AddChildToVerticalBox(child);
            }
            this._deferredSlots.set(child, { typeName: childTypeName, props: childProps });
            return;
        }
        const childStyle = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
        // Track z-index for this child for future insertion ordering
        const zIndex = this.extractZIndex(childStyle);
        if (zIndex !== 0) {
            this.childZIndices.set(child, zIndex);
        }
        if (parent instanceof UE.WrapBox) {
            const wrapBox = parent;
            const wrapSlot = wrapBox.AddChildToWrapBox(child);
            this.initWrapBoxSlot(wrapSlot, childStyle);
            super.initChildPadding(wrapSlot, childStyle);
            this.applyFlexSizingToSlot(wrapSlot, childStyle);
            return;
        }
        if (parent instanceof UE.HorizontalBox) {
            const horizontalBox = parent;
            const horizontalBoxSlot = horizontalBox.AddChildToHorizontalBox(child);
            this.initHorizontalBoxSlot(horizontalBoxSlot, childStyle);
            super.initChildPadding(horizontalBoxSlot, childStyle);
            this.applyFlexSizingToSlot(horizontalBoxSlot, childStyle);
            this.applyGapToSlot(horizontalBoxSlot, existingCount === 0);
            return;
        }
        if (parent instanceof UE.VerticalBox) {
            const verticalBox = parent;
            const verticalBoxSlot = verticalBox.AddChildToVerticalBox(child);
            this.initVerticalBoxSlot(verticalBoxSlot, childStyle);
            super.initChildPadding(verticalBoxSlot, childStyle);
            this.applyFlexSizingToSlot(verticalBoxSlot, childStyle);
            this.applyGapToSlot(verticalBoxSlot, existingCount === 0);
        }
    }
    /**
     * Completes the deferred slot configuration for a child that was
     * Collapsed at mount time and has now become visible.  Retrieves the
     * existing slot via child.Slot and applies the full alignment,
     * padding, sizing, and gap configuration that was skipped earlier.
     */
    completeDeferredSlotSetup(parent, child) {
        const deferred = this._deferredSlots.get(child);
        if (!deferred)
            return;
        this._deferredSlots.delete(child);
        const childStyle = (0, cssstyle_parser_1.getAllStyles)(deferred.typeName, deferred.props);
        const slot = child.Slot;
        if (!slot)
            return;
        // Track z-index now that we're applying the full config
        const zIndex = this.extractZIndex(childStyle);
        if (zIndex !== 0) {
            this.childZIndices.set(child, zIndex);
        }
        // Determine if this is the first child for gap application
        const panelParent = parent;
        const isFirstChild = panelParent && panelParent.GetChildrenCount() > 0
            && panelParent.GetChildAt(0) === child;
        // Apply the full slot configuration based on slot type
        if (slot instanceof UE.WrapBoxSlot) {
            this.initWrapBoxSlot(slot, childStyle);
            super.initChildPadding(slot, childStyle);
            this.applyFlexSizingToSlot(slot, childStyle);
        }
        else if (slot instanceof UE.HorizontalBoxSlot) {
            this.initHorizontalBoxSlot(slot, childStyle);
            super.initChildPadding(slot, childStyle);
            this.applyFlexSizingToSlot(slot, childStyle);
            this.applyGapToSlot(slot, isFirstChild);
        }
        else if (slot instanceof UE.VerticalBoxSlot) {
            this.initVerticalBoxSlot(slot, childStyle);
            super.initChildPadding(slot, childStyle);
            this.applyFlexSizingToSlot(slot, childStyle);
            this.applyGapToSlot(slot, isFirstChild);
        }
    }
}
exports.FlexConverter = FlexConverter;
//# sourceMappingURL=flex.js.map