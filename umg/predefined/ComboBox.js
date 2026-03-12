"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComboBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class ComboBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    setupOptions(comboBox, props) {
        const options = props?.options;
        if (options) {
            comboBox.ClearOptions();
            options.forEach((option) => {
                comboBox.DefaultOptions.Add(option);
                comboBox.AddOption(option);
            });
        }
        const selectedOption = props?.selectedOption;
        if (selectedOption) {
            comboBox.SetSelectedOption(selectedOption);
        }
    }
    setupComboBoxStyle(comboBox, props) {
        const comboBoxStyle = props?.comboBoxStyle;
        if (!comboBoxStyle) {
            return false;
        }
        let styleInit = false;
        const styleMap = {
            'backgroundImage': 'Normal',
            'hoveredBackgroundImage': 'Hovered',
            'pressedBackgroundImage': 'Pressed',
            'disabledBackgroundImage': 'Disabled',
            'downArrowBackground': 'DownArrow',
        };
        const soundMap = {
            'pressedSound': 'PressedSlateSound',
            'selectionChangeSound': 'SelectionChangeSlateSound',
        };
        const paddingMap = {
            'rowPadding': 'MenuRowPadding',
            'downArrowPadding': 'DownArrowPadding',
        };
        for (const [key, value] of Object.entries(comboBoxStyle)) {
            if (styleMap[key]) {
                comboBox.WidgetStyle.ComboButtonStyle.ButtonStyle[styleMap[key]] = (0, brush_parser_1.parseBrush)(value);
                styleInit = true;
            }
            else if (soundMap[key]) {
                // todo@Caleb196x: 需要解析sound
                comboBox.WidgetStyle[soundMap[key]] = {};
                styleInit = true;
            }
            else if (paddingMap[key]) {
                const paddingVal = value;
                comboBox.WidgetStyle[paddingMap[key]] = (0, css_margin_parser_1.convertToUEMargin)(comboBoxStyle, paddingVal, '', '', '', '');
                styleInit = true;
            }
            else if (key === 'downArrowBackground') {
                comboBox.WidgetStyle.ComboButtonStyle.DownArrowImage = (0, brush_parser_1.parseBrush)(value);
                styleInit = true;
            }
            else if (key === 'downArrowPadding') {
                const paddingVal = value;
                comboBox.WidgetStyle.ComboButtonStyle.DownArrowPadding = (0, css_margin_parser_1.convertToUEMargin)(comboBoxStyle, paddingVal, '', '', '', '');
                styleInit = true;
            }
            else if (key === 'downArrowAlign') {
                switch (value) {
                    case 'left':
                    case 'top':
                        comboBox.WidgetStyle.ComboButtonStyle.DownArrowAlign = UE.EVerticalAlignment.VAlign_Top;
                        break;
                    case 'right':
                    case 'bottom':
                        comboBox.WidgetStyle.ComboButtonStyle.DownArrowAlign = UE.EVerticalAlignment.VAlign_Bottom;
                        break;
                    case 'center':
                        comboBox.WidgetStyle.ComboButtonStyle.DownArrowAlign = UE.EVerticalAlignment.VAlign_Center;
                        break;
                    default:
                        comboBox.WidgetStyle.ComboButtonStyle.DownArrowAlign = UE.EVerticalAlignment.VAlign_Top;
                        break;
                }
                styleInit = true;
            }
        }
        return styleInit;
    }
    setupComboBoxScrollBarStyle(comboBox, props) {
        const comboBoxScrollBarStyle = props?.scrollBarStyle;
        if (!comboBoxScrollBarStyle) {
            return false;
        }
        let barStyleInit = false;
        const styleMap = {
            'horizontalBackground': 'HorizontalBackgroundImage',
            'verticalBackground': 'VerticalBackgroundImage',
            'normalThumb': 'NormalThumbImage',
            'hoveredThumb': 'HoveredThumbImage',
            'draggedThumb': 'DraggedThumbImage',
        };
        for (const [key, value] of Object.entries(comboBoxScrollBarStyle)) {
            if (styleMap[key]) {
                comboBox.ScrollBarStyle[styleMap[key]] = (0, brush_parser_1.parseBrush)(value);
                barStyleInit = true;
            }
            else if (key === 'thickness') {
                comboBox.ScrollBarStyle.Thickness = value;
                barStyleInit = true;
            }
        }
        return barStyleInit;
    }
    setupComboBoxItemStyle(comboBox, props) {
        const comboBoxItemStyle = props?.itemStyle;
        if (!comboBoxItemStyle) {
            return false;
        }
        let itemStyleInit = false;
        const styleMap = {
            'activeBackground': 'ActiveBrush',
            'activeHoveredBackground': 'ActiveHoveredBrush',
            'focusedBackground': 'SelectorFocusedBrush',
            'inactiveBackground': 'InactiveBrush',
            'inactiveHoveredBackground': 'InactiveHoveredBrush',
            'menuRowBackground': 'MenuRowBrush',
            'evenMenuRowBackground': 'EvenMenuRowBrush',
            'oddMenuRowBackground': 'OddMenuRowBrush',
        };
        const colorMap = {
            'textColor': 'TextColor',
            'selectedTextColor': 'SelectedTextColor',
        };
        for (const [key, value] of Object.entries(comboBoxItemStyle)) {
            if (styleMap[key]) {
                // fixme@Caleb196x: 需要处理styleMap[key]不存在的情况
                comboBox.ItemStyle[styleMap[key]] = (0, brush_parser_1.parseBrush)(value);
                itemStyleInit = true;
            }
            else if (colorMap[key]) {
                const rgba = (0, css_color_parser_1.parseToLinearColor)(value);
                comboBox.ItemStyle[colorMap[key]].SpecifiedColor.R = rgba.r;
                comboBox.ItemStyle[colorMap[key]].SpecifiedColor.G = rgba.g;
                comboBox.ItemStyle[colorMap[key]].SpecifiedColor.B = rgba.b;
                comboBox.ItemStyle[colorMap[key]].SpecifiedColor.A = rgba.a;
                itemStyleInit = true;
            }
        }
        return itemStyleInit;
    }
    setupProps(comboBox, props) {
        this.setupOptions(comboBox, props);
        return this.setupComboBoxStyle(comboBox, props) ||
            this.setupComboBoxScrollBarStyle(comboBox, props) ||
            this.setupComboBoxItemStyle(comboBox, props);
    }
    createNativeWidget() {
        const comboBox = new UE.ComboBoxString(this.outer);
        const propsInit = this.setupProps(comboBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(comboBox);
        }
        return comboBox;
    }
    update(widget, oldProps, changedProps) {
        const comboBox = widget;
        const propsChanged = this.setupProps(comboBox, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(comboBox);
        }
    }
}
exports.ComboBoxConverter = ComboBoxConverter;
//# sourceMappingURL=ComboBox.js.map