"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniformGridConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const alignment_parser_1 = require("../../parsers/alignment_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class UniformGridConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    parseIndex(value) {
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
        return undefined;
    }
    initProps(grid, props) {
        if (!props)
            return false;
        let updated = false;
        const minCellSize = props.minCellSize;
        if (minCellSize) {
            if (minCellSize.x !== undefined) {
                grid.MinDesiredSlotWidth = minCellSize.x;
                updated = true;
            }
            if (minCellSize.y !== undefined) {
                grid.MinDesiredSlotHeight = minCellSize.y;
                updated = true;
            }
        }
        if (props.cellPadding !== undefined) {
            grid.SlotPadding = (0, css_margin_parser_1.convertToUEMargin)(props, props.cellPadding, '', '', '', '');
            updated = true;
        }
        return updated;
    }
    createNativeWidget() {
        const grid = new UE.UniformGridPanel(this.outer);
        const propsInit = this.initProps(grid, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(grid);
        }
        return grid;
    }
    update(widget, oldProps, changedProps) {
        const grid = widget;
        const propsInit = this.initProps(grid, changedProps);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(grid);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (parent instanceof UE.UniformGridPanel) {
            const row = this.parseIndex(childProps?.row ?? childProps?.gridRow ?? childProps?.style?.gridRow);
            const column = this.parseIndex(childProps?.column ?? childProps?.gridColumn ?? childProps?.style?.gridColumn);
            const slot = parent.AddChildToUniformGrid(child, row ?? 0, column ?? 0);
            const childStyle = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
            const alignment = (0, alignment_parser_1.parseWidgetSelfAlignment)(childStyle);
            if (typeof slot.SetHorizontalAlignment === 'function') {
                slot.SetHorizontalAlignment(alignment.horizontal);
            }
            if (typeof slot.SetVerticalAlignment === 'function') {
                slot.SetVerticalAlignment(alignment.vertical);
            }
            if (row !== undefined) {
                slot.SetRow(row);
            }
            if (column !== undefined) {
                slot.SetColumn(column);
            }
            return;
        }
        super.appendChild(parent, child, childTypeName, childProps);
    }
}
exports.UniformGridConverter = UniformGridConverter;
//# sourceMappingURL=UniformGrid.js.map