"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewportConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const batch_sync_1 = require("../../perf/batch_sync");
class ViewportConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    createNativeWidget() {
        const viewport = new UE.Viewport(this.outer);
        return viewport;
    }
    update(widget, oldProps, changedProps) {
        const viewport = widget;
        (0, batch_sync_1.queueWidgetSync)(viewport);
    }
}
exports.ViewportConverter = ViewportConverter;
//# sourceMappingURL=Viewport.js.map