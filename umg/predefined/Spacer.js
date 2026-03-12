"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpacerConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const batch_sync_1 = require("../../perf/batch_sync");
class SpacerConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    createNativeWidget() {
        const spacer = new UE.Spacer(this.outer);
        const size = this.props?.size;
        if (size) {
            spacer.Size.X = size.x;
            spacer.Size.Y = size.y;
            (0, batch_sync_1.queueWidgetSync)(spacer);
        }
        return spacer;
    }
    update(widget, oldProps, changedProps) {
        const spacer = widget;
        const size = changedProps?.size;
        if (size) {
            spacer.Size.X = size.x;
            spacer.Size.Y = size.y;
            (0, batch_sync_1.queueWidgetSync)(spacer);
        }
    }
}
exports.SpacerConverter = SpacerConverter;
//# sourceMappingURL=Spacer.js.map