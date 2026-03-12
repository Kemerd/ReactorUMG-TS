"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpinBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class SpinBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    valueConvertKeyMap = {
        'value': 'Value',
        'minValue': 'MinValue',
        'maxValue': 'MaxValue',
        'minSliderValue': 'MinSliderValue',
        'maxSliderValue': 'MaxSliderValue',
        'minFractionDigits': 'MinFractionDigits',
        'maxFractionDigits': 'MaxFractionDigits',
        'useDeltaSnap': 'bAlwaysUsesDeltaSnap',
        'enableSlider': 'bEnableSlider',
        'deltaValue': 'Delta',
        'sliderExponent': 'SliderExponent',
        'minDesiredWidth': 'MinDesiredWidth',
        'clearKeyboardFocusOnCommit': 'ClearKeyboardFocusOnCommit',
        'selectAllTextOnFocus': 'SelectAllTextOnCommit',
        'foregroundColor': 'ForegroundColor',
    };
    eventKeyMap = {
        'onValueChanged': 'OnValueChanged',
        'onValueCommitted': 'OnValueCommitted',
        'onBeginSliderMovement': 'OnBeginSliderMovement',
        'onEndSliderMovement': 'OnEndSliderMovement',
    };
    styleKeyMap = {
        'arrowBackground': 'ArrowImage',
        'normalBackground': 'BackgroundBrush',
        'activeBackground': 'ActiveBackgroundBrush',
        'hoveredBackground': 'HoveredBackgroundBrush',
        'activeFillBackground': 'ActiveFillBrush',
        'hoveredFillBackground': 'HoveredFillBrush',
        'inactiveFillBackground': 'InactiveFillBrush',
    };
    paddingKeyMap = {
        'textPadding': 'TextPadding',
        'insetPadding': 'InsetPadding',
    };
    colorKeyMap = {
        'foregroundColor': 'ForegroundColor',
    };
    initSpinBoxProps(spinBox, props) {
        let propsInit = false;
        for (const key in props) {
            if (this.valueConvertKeyMap[key]) {
                spinBox[this.valueConvertKeyMap[key]] = props[key];
                propsInit = true;
            }
            else if (this.eventKeyMap[key] && typeof props[key] === 'function') {
                spinBox[this.eventKeyMap[key]].Add(props[key]);
                propsInit = true;
            }
            else if (this.styleKeyMap[key]) {
                spinBox.WidgetStyle[this.styleKeyMap[key]] = (0, brush_parser_1.parseBrush)(props[key]);
                propsInit = true;
            }
            else if (this.paddingKeyMap[key]) {
                spinBox.WidgetStyle[this.paddingKeyMap[key]] = (0, css_margin_parser_1.convertToUEMargin)({}, props[key], '', '', '', '');
                propsInit = true;
            }
            else if (this.colorKeyMap[key]) {
                const rgba = (0, css_color_parser_1.parseToLinearColor)(props[key]);
                spinBox.WidgetStyle[this.colorKeyMap[key]] = new UE.LinearColor(rgba.r, rgba.g, rgba.b, rgba.a);
                propsInit = true;
            }
            else if (key === 'textAlign') {
                switch (props[key]) {
                    case 'left':
                        spinBox.Justification = UE.ETextJustify.Left;
                        break;
                    case 'right':
                        spinBox.Justification = UE.ETextJustify.Right;
                        break;
                    case 'center':
                        spinBox.Justification = UE.ETextJustify.Center;
                        break;
                    default:
                        spinBox.Justification = UE.ETextJustify.Left;
                        break;
                }
                propsInit = true;
            }
            else if (key === 'keyboardType') {
                switch (props[key]) {
                    case 'number':
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.Number;
                        break;
                    case 'web':
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.Web;
                        break;
                    case 'email':
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.Email;
                        break;
                    case 'password':
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.Password;
                        break;
                    case 'alpha-numberic':
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.AlphaNumeric;
                        break;
                    default:
                        spinBox.KeyboardType = UE.EVirtualKeyboardType.Default;
                        break;
                }
                propsInit = true;
            }
            else if (key === 'valueBinding') {
                spinBox.ValueDelegate.Bind(props[key]);
                propsInit = true;
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const spinBox = new UE.SpinBox(this.outer);
        const propsInit = this.initSpinBoxProps(spinBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(spinBox);
        }
        return spinBox;
    }
    update(widget, oldProps, changedProps) {
        const spinBox = widget;
        const propsInit = this.initSpinBoxProps(spinBox, changedProps);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(spinBox);
        }
    }
}
exports.SpinBoxConverter = SpinBoxConverter;
//# sourceMappingURL=SpinBox.js.map