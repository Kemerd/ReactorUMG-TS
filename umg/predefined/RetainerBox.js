"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetainerBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const batch_sync_1 = require("../../perf/batch_sync");
class RetainerBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    initRetainerBoxProps(retainerBox, props) {
        let propsInit = false;
        const retainRender = props?.retainRender;
        if (retainRender) {
            retainerBox.bRetainRender = retainRender;
            propsInit = true;
        }
        const renderOnInvalidate = props?.renderOnInvalidate;
        if (renderOnInvalidate) {
            retainerBox.RenderOnInvalidation = renderOnInvalidate;
            propsInit = true;
        }
        const renderOnPhase = props?.renderOnPhase;
        if (renderOnPhase) {
            retainerBox.RenderOnPhase = renderOnPhase;
            propsInit = true;
        }
        const phase = props?.phase;
        if (phase) {
            retainerBox.Phase = phase;
            propsInit = true;
        }
        const phaseCount = props?.phaseCount;
        if (phaseCount) {
            retainerBox.PhaseCount = phaseCount;
            propsInit = true;
        }
        return propsInit;
    }
    createNativeWidget() {
        const retainerBox = new UE.RetainerBox(this.outer);
        const propsInit = this.initRetainerBoxProps(retainerBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(retainerBox);
        }
        return retainerBox;
    }
    update(widget, oldProps, changedProps) {
        const retainerBox = widget;
        const propsChanged = this.initRetainerBoxProps(retainerBox, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(retainerBox);
        }
    }
}
exports.RetainerBoxConverter = RetainerBoxConverter;
//# sourceMappingURL=RetainerBox.js.map