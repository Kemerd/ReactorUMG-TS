"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SizeBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_length_parser_1 = require("../../parsers/css_length_parser");
const utils_1 = require("../../misc/utils");
const batch_sync_1 = require("../../perf/batch_sync");
class SizeBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    keyMap = {
        'width': 'WidthOverride',
        'height': 'HeightOverride',
        'minWidth': 'MinDesiredWidth',
        'minHeight': 'MinDesiredHeight',
        'maxWidth': 'MaxDesiredWidth',
        'maxHeight': 'MaxDesiredHeight',
        'minAspectRatio': 'MinAspectRatio',
        'maxAspectRatio': 'MaxAspectRatio',
    };
    initSizeBoxProps(sizeBox, props) {
        let propsInit = false;
        for (const key in props) {
            if (this.keyMap[key]) {
                const value = props[key];
                if (typeof value === 'number') {
                    sizeBox[this.keyMap[key]] = value;
                    propsInit = true;
                }
                else if (typeof value === 'string') {
                    if (key == 'minAspectRatio' || key == 'maxAspectRatio') {
                        sizeBox[this.keyMap[key]] = (0, css_length_parser_1.parseAspectRatio)(value);
                    }
                    else {
                        sizeBox[this.keyMap[key]] = (0, utils_1.safeParseFloat)(value);
                    }
                    propsInit = true;
                }
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const sizeBox = new UE.SizeBox(this.outer);
        const propsInit = this.initSizeBoxProps(sizeBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(sizeBox);
        }
        return sizeBox;
    }
    update(widget, oldProps, changedProps) {
        const sizeBox = widget;
        const propsInit = this.initSizeBoxProps(sizeBox, changedProps);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(sizeBox);
        }
    }
}
exports.SizeBoxConverter = SizeBoxConverter;
//# sourceMappingURL=SizeBox.js.map