"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class CheckBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    setupCheckboxStyle(checkbox, props) {
        const checkboxStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
        if (!checkboxStyle) {
            return false;
        }
        let propsChanged = false;
        const imageStyleMap = {
            'uncheckedBackground': 'UncheckedImage',
            'uncheckedHoveredBackground': 'UncheckedHoveredImage',
            'uncheckedPressedBackground': 'UncheckedPressedImage',
            'checkedBackground': 'CheckedImage',
            'checkedHoveredBackground': 'CheckedHoveredImage',
            'checkedPressedBackground': 'CheckedPressedImage',
            'undeterminedBackground': 'UndeterminedImage',
            'undeterminedHoveredBackground': 'UndeterminedHoveredImage',
            'undeterminedPressedBackground': 'UndeterminedPressedBrush',
            'normalBackground': 'BackgroundImage',
            'normalHoveredBackground': 'BackgroundHoveredImage',
            'normalPressedBackground': 'BackgroundPressedImage',
        };
        const soundMap = {
            'checkSound': 'CheckedSlateSound',
            'uncheckSound': 'UncheckedSlateSound',
            'hoveredSound': 'HoveredSlateSound',
        };
        for (const [key, value] of Object.entries(checkboxStyle)) {
            if (imageStyleMap[key]) {
                checkbox.WidgetStyle[imageStyleMap[key]] = (0, brush_parser_1.parseBrush)(value);
                propsChanged = true;
            }
            else if (soundMap[key]) {
                // todo@Caleb196x: 需要解析sound
                checkbox.WidgetStyle[soundMap[key]] = {};
                propsChanged = true;
            }
            else if (key === 'padding') {
                checkbox.WidgetStyle.Padding = (0, css_margin_parser_1.convertPadding)(checkboxStyle);
                propsChanged = true;
            }
            else if (key === 'color') {
                const rgba = (0, css_color_parser_1.parseToLinearColor)(value);
                checkbox.WidgetStyle.ForegroundColor.SpecifiedColor.R = rgba.r;
                checkbox.WidgetStyle.ForegroundColor.SpecifiedColor.G = rgba.g;
                checkbox.WidgetStyle.ForegroundColor.SpecifiedColor.B = rgba.b;
                checkbox.WidgetStyle.ForegroundColor.SpecifiedColor.A = rgba.a;
                propsChanged = true;
            }
            else if (key === 'type') {
                switch (value) {
                    case 'checkbox':
                        checkbox.WidgetStyle.CheckBoxType = UE.ESlateCheckBoxType.CheckBox;
                        break;
                    case 'toggle':
                        checkbox.WidgetStyle.CheckBoxType = UE.ESlateCheckBoxType.ToggleButton;
                        break;
                    case 'default':
                    default:
                        checkbox.WidgetStyle.CheckBoxType = UE.ESlateCheckBoxType.CheckBox;
                        break;
                }
                propsChanged = true;
            }
        }
        return propsChanged;
    }
    setupProps(checkBox, props) {
        let propsChanged = this.setupCheckboxStyle(checkBox, props);
        const checked = props?.checked;
        if (checked) {
            checkBox.SetIsChecked(checked);
            propsChanged = true;
        }
        const stateBinding = props?.checkStateBinding;
        if (stateBinding && typeof stateBinding === 'function') {
            checkBox.CheckedStateDelegate.Bind(stateBinding);
            propsChanged = true;
        }
        return propsChanged;
    }
    createNativeWidget() {
        const checkBox = new UE.CheckBox(this.outer);
        const propsInit = this.setupProps(checkBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(checkBox);
        }
        return checkBox;
    }
    update(widget, oldProps, changedProps) {
        const checkBox = widget;
        const propsChanged = this.setupProps(checkBox, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(checkBox);
        }
    }
}
exports.CheckBoxConverter = CheckBoxConverter;
//# sourceMappingURL=CheckBox.js.map