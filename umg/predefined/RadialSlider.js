"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RadialSliderConverter = void 0;
const UE = require("ue");
const Slider_1 = require("./Slider");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class RadialSliderConverter extends Slider_1.SliderConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    valueConvertKeyMap = {
        'defaultValue': 'CustomDefaultValue',
        'thumbStartAngle': 'SliderHandleStartAngle',
        'thumbEndPointAngle': 'SliderHandleEndAngle',
        'thumbAngularOffset': 'AngularOffset',
        'showSliderThumb': 'ShowSliderHandle',
        'showSliderHand': 'ShowSliderHand'
    };
    colorKeyMap = {
        'sliderProgressColor': 'SliderProgressColor',
        'backgroundColor': 'CenterBackgroundColor',
    };
    initRadialSliderProps(radialSlider, props) {
        let propsInit = false;
        for (const key in props) {
            if (this.valueConvertKeyMap[key]) {
                radialSlider[this.valueConvertKeyMap[key]] = props[key];
            }
            else if (this.colorKeyMap[key]) {
                const color = (0, css_color_parser_1.parseToLinearColor)(props[key]);
                radialSlider[this.colorKeyMap[key]] = new UE.LinearColor(color.r, color.g, color.b, color.a);
            }
            else if (key === 'valueTags') {
                props[key].map((tag) => radialSlider.ValueTags.Add(tag));
            }
        }
        return this.initSliderCommonProps(radialSlider, props) || propsInit;
    }
    createNativeWidget() {
        const radialSlider = new UE.RadialSlider(this.outer);
        const propsInit = this.initRadialSliderProps(radialSlider, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(radialSlider);
        }
        return radialSlider;
    }
    update(widget, oldProps, changedProps) {
        const radialSlider = widget;
        const propsChanged = this.initRadialSliderProps(radialSlider, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(radialSlider);
        }
    }
}
exports.RadialSliderConverter = RadialSliderConverter;
//# sourceMappingURL=RadialSlider.js.map