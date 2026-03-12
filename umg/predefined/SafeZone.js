"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeZoneConverter = void 0;
const umg_converter_1 = require("../umg_converter");
const UE = require("ue");
const batch_sync_1 = require("../../perf/batch_sync");
class SafeZoneConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    initSafeZoneProps(safeZone, props) {
        let propsInit = false;
        const padLeft = props?.padLeft;
        if (padLeft) {
            safeZone.PadLeft = padLeft;
            propsInit = true;
        }
        const padRight = props?.padRight;
        if (padRight) {
            safeZone.PadRight = padRight;
            propsInit = true;
        }
        const padTop = props?.padTop;
        if (padTop) {
            safeZone.PadTop = padTop;
            propsInit = true;
        }
        const padBottom = props?.padBottom;
        if (padBottom) {
            safeZone.PadBottom = padBottom;
            propsInit = true;
        }
        return propsInit;
    }
    createNativeWidget() {
        const safeZone = new UE.SafeZone(this.outer);
        const propsInit = this.initSafeZoneProps(safeZone, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(safeZone);
        }
        return safeZone;
    }
    update(widget, oldProps, changedProps) {
        const safeZone = widget;
        const propsChanged = this.initSafeZoneProps(safeZone, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(safeZone);
        }
    }
}
exports.SafeZoneConverter = SafeZoneConverter;
//# sourceMappingURL=SafeZone.js.map