"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliderConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class SliderConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    initSliderCommonProps(slider, props) {
        if (!props || !slider)
            return false;
        let propsInit = false;
        const valueConvertKeyMap = {
            'value': 'Value',
            'stepSize': 'StepSize',
            'locked': 'Locked',
            'useMouseStep': 'MouseUsesStep',
            'controllerLock': 'RequiresControllerLock',
            'focusable': 'IsFocusable'
        };
        const colorKeyMap = {
            'sliderBarColor': 'SliderBarColor',
            'sliderThumbColor': 'SliderHandleColor',
        };
        const styleKeyMap = {
            'normalBarBackground': 'NormalBarImage',
            'hoverBarBackground': 'HoveredBarImage',
            'disabledBarBackground': 'DisabledBarImage',
            'normalThumbBackground': 'NormalThumbImage',
            'hoveredThumbBackground': 'HoveredThumbImage',
            'disabledThumbBackground': 'DisabledThumbImage'
        };
        const eventKeyMap = {
            'onValueChanged': 'OnValueChanged',
            'onMouseCaptureBegin': 'OnMouseCaptureBegin',
            'onMouseCaptureEnd': 'OnMouseCaptureEnd',
            'onControllerCaptureBegin': 'OnControllerCaptureBegin',
            'onControllerCaptureEnd': 'OnControllerCaptureEnd',
        };
        for (const key in props) {
            if (valueConvertKeyMap[key]) {
                slider[valueConvertKeyMap[key]] = props[key];
                propsInit = true;
            }
            else if (colorKeyMap[key]) {
                if (props?.sliderStyle) {
                    const color = (0, css_color_parser_1.parseToLinearColor)(props.sliderStyle[key]);
                    slider[colorKeyMap[key]] = new UE.LinearColor(color.r, color.g, color.b, color.a);
                    propsInit = true;
                }
            }
            else if (styleKeyMap[key]) {
                if (props?.sliderStyle) {
                    slider.WidgetStyle[styleKeyMap[key]] = (0, brush_parser_1.parseBrush)(props.sliderStyle[key]);
                    propsInit = true;
                }
            }
            else if (key === 'barThickness') {
                if (props?.sliderStyle) {
                    slider.WidgetStyle.BarThickness = props.sliderStyle.barThickness;
                    propsInit = true;
                }
            }
            if (typeof props[key] === 'function') {
                if (eventKeyMap[key]) {
                    slider[eventKeyMap[key]].Add(props[key]);
                    propsInit = true;
                }
                else if (key === 'valueBinding') {
                    slider.ValueDelegate.Bind(props[key]);
                    propsInit = true;
                }
            }
        }
        return propsInit;
    }
    initProps(slider, props) {
        if (!slider)
            return false;
        let propsInit = false;
        const minValue = props?.minValue;
        if (minValue) {
            slider.MinValue = minValue;
            propsInit = true;
        }
        const maxValue = props?.maxValue;
        if (maxValue) {
            slider.MaxValue = maxValue;
            propsInit = true;
        }
        const indentHandle = props?.indentHandle;
        if (indentHandle) {
            slider.IndentHandle = indentHandle;
            propsInit = true;
        }
        const orientation = props?.orientation;
        if (orientation) {
            switch (orientation) {
                case 'horizontal':
                    slider.Orientation = UE.EOrientation.Orient_Horizontal;
                    break;
                case 'vertical':
                    slider.Orientation = UE.EOrientation.Orient_Vertical;
                    break;
                default:
                    slider.Orientation = UE.EOrientation.Orient_Horizontal;
                    break;
            }
            propsInit = true;
        }
        return this.initSliderCommonProps(slider, props) || propsInit;
    }
    createNativeWidget() {
        const slider = new UE.Slider(this.outer);
        const propsInit = this.initProps(slider, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(slider);
        }
        return slider;
    }
    update(widget, oldProps, changedProps) {
        const slider = widget;
        const propsChanged = this.initProps(slider, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(slider);
        }
    }
}
exports.SliderConverter = SliderConverter;
//# sourceMappingURL=Slider.js.map