"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrobberConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const brush_parser_1 = require("../../parsers/brush_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class ThrobberConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    valueConvertKeyMap = {
        'pieces': 'NumberOfPieces',
        'animationHorizontal': 'bAnimationHorizontal',
        'animationVertical': 'bAnimationVertical',
        'animationOpacity': 'bAnimationOpacity',
    };
    initProps(throbber, props) {
        let propsInit = false;
        for (const key in props) {
            if (this.valueConvertKeyMap[key]) {
                throbber[this.valueConvertKeyMap[key]] = props[key];
                propsInit = true;
            }
            else if (key === 'image') {
                throbber.Image = (0, brush_parser_1.parseBrush)(props[key]);
                propsInit = true;
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const throbber = new UE.Throbber(this.outer);
        const propsInit = this.initProps(throbber, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(throbber);
        }
        return throbber;
    }
    update(widget, oldProps, changedProps) {
        const throbber = widget;
        const propsChanged = this.initProps(throbber, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(throbber);
        }
    }
}
exports.ThrobberConverter = ThrobberConverter;
//# sourceMappingURL=Throbber.js.map