"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularThrobberConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const brush_parser_1 = require("../../parsers/brush_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class CircularThrobberConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    valueConvertKeyMap = {
        'radius': 'Radius',
        'pieces': 'NumberOfPieces',
        'period': 'Period',
        'enableRadius': 'bEnableRadius',
    };
    setupProps(circularThrobber, props) {
        let propsChanged = false;
        for (const key in this.props) {
            if (this.valueConvertKeyMap[key]) {
                circularThrobber[this.valueConvertKeyMap[key]] = this.props[key];
                propsChanged = true;
            }
            else if (key === 'image') {
                circularThrobber.Image = (0, brush_parser_1.parseBrush)(this.props[key]);
                propsChanged = true;
            }
        }
        return propsChanged;
    }
    createNativeWidget() {
        const circularThrobber = new UE.CircularThrobber(this.outer);
        const propsInit = this.setupProps(circularThrobber, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(circularThrobber);
        }
        return circularThrobber;
    }
    update(widget, oldProps, changedProps) {
        const circularThrobber = widget;
        const propsChanged = this.setupProps(circularThrobber, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(circularThrobber);
        }
    }
}
exports.CircularThrobberConverter = CircularThrobberConverter;
//# sourceMappingURL=CircularThrobber.js.map