"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectConverter = void 0;
const UE = require("ue");
const jsx_converter_1 = require("./jsx_converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_background_parser_1 = require("../parsers/css_background_parser");
const css_font_parser_1 = require("../parsers/css_font_parser");
const css_color_parser_1 = require("../parsers/css_color_parser");
const batch_sync_1 = require("../perf/batch_sync");
class SelectConverter extends jsx_converter_1.JSXConverter {
    options = [];
    labelToValue = new Map();
    onChangeBound;
    nativeOnChangeLast;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    applyComboButtonBrushes(combo, style) {
        if (!combo || !style)
            return;
        const baseBg = (0, css_background_parser_1.parseBackgroundProps)(style);
        if (baseBg?.image) {
            combo.WidgetStyle.ComboButtonStyle.ButtonStyle.Normal = baseBg.image;
        }
        // Pseudo classes
        const hoverStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, 'hover');
        const activeStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, 'active');
        const disabledStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props, 'disabled');
        const hoverBg = (0, css_background_parser_1.parseBackgroundProps)(hoverStyle || {});
        const activeBg = (0, css_background_parser_1.parseBackgroundProps)(activeStyle || {});
        const disabledBg = (0, css_background_parser_1.parseBackgroundProps)(disabledStyle || {});
        if (hoverBg?.image) {
            combo.WidgetStyle.ComboButtonStyle.ButtonStyle.Hovered = hoverBg.image;
        }
        if (activeBg?.image) {
            combo.WidgetStyle.ComboButtonStyle.ButtonStyle.Pressed = activeBg.image;
        }
        if (disabledBg?.image) {
            combo.WidgetStyle.ComboButtonStyle.ButtonStyle.Disabled = disabledBg.image;
        }
    }
    applyTextStyles(combo, style) {
        if (!combo || !style)
            return;
        // font
        if ((0, css_font_parser_1.hasFontStyles)(style)) {
            if (!combo.Font) {
                combo.Font = new UE.SlateFontInfo();
            }
            (0, css_font_parser_1.setupFontStyles)(this.outer, combo.Font, style);
        }
        // color
        const textColor = style?.color ?? style?.textColor;
        if (textColor) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(textColor);
            if (!combo.ForegroundColor) {
                combo.ForegroundColor = new UE.SlateColor();
            }
            combo.ForegroundColor.SpecifiedColor.R = rgba.r;
            combo.ForegroundColor.SpecifiedColor.G = rgba.g;
            combo.ForegroundColor.SpecifiedColor.B = rgba.b;
            combo.ForegroundColor.SpecifiedColor.A = rgba.a;
        }
    }
    syncOptions(combo) {
        combo.ClearOptions();
        for (const opt of this.options) {
            combo.DefaultOptions.Add(opt.label);
            combo.AddOption(opt.label);
        }
    }
    setSelection(combo, props) {
        const value = props?.value ?? props?.defaultValue;
        if (value !== undefined && value !== null) {
            // find label by value
            let label;
            for (const opt of this.options) {
                if (String(opt.value) === String(value)) {
                    label = opt.label;
                    break;
                }
            }
            if (label !== undefined) {
                combo.SetSelectedOption(label);
            }
        }
    }
    ensureOnChange(combo, props, isUpdate) {
        const onChange = props?.onChange;
        const rebindOnChange = (onChange) => {
            if (!onChange)
                return;
            if (this.onChangeBound) {
                combo.OnSelectionChanged.Remove(this.onChangeBound);
            }
            this.onChangeBound = (selectedLabel, _type) => {
                const val = this.labelToValue.get(selectedLabel) ?? selectedLabel;
                try {
                    onChange({ target: { value: val } });
                }
                catch { }
            };
            combo.OnSelectionChanged.Add(this.onChangeBound);
        };
        if (isUpdate) {
            rebindOnChange(onChange);
            // if (!compareTwoFunctions(this.nativeOnChangeLast, onChange)) {
            //     rebindOnChange(onChange);
            // }
        }
        else {
            if (onChange && typeof onChange === 'function') {
                rebindOnChange(onChange);
                this.nativeOnChangeLast = onChange;
            }
        }
    }
    extractLabelFromChildren(children) {
        if (typeof children === 'string')
            return children;
        if (Array.isArray(children)) {
            for (const c of children) {
                if (typeof c === 'string')
                    return c;
            }
        }
        return undefined;
    }
    createNativeWidget() {
        const combo = new UE.ComboBoxString(this.outer);
        // apply styles
        const style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props);
        this.applyComboButtonBrushes(combo, style);
        this.applyTextStyles(combo, style);
        // disabled / focusable
        if (this.props?.disabled !== undefined) {
            combo.bIsEnabled = !this.props.disabled;
        }
        if (this.props?.focusable !== undefined) {
            combo.bIsFocusable = !!this.props.focusable;
        }
        // options will be appended via appendChild
        // initial selection and handler
        this.setSelection(combo, this.props);
        this.ensureOnChange(combo, this.props, false);
        (0, batch_sync_1.queueWidgetSync)(combo);
        return combo;
    }
    update(widget, _oldProps, changedProps) {
        const combo = widget;
        const style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, { ...this.props, ...changedProps });
        this.applyComboButtonBrushes(combo, style);
        this.applyTextStyles(combo, style);
        if (changedProps?.disabled !== undefined) {
            combo.bIsEnabled = !changedProps.disabled;
        }
        if (changedProps?.focusable !== undefined) {
            combo.bIsFocusable = !!changedProps.focusable;
        }
        this.setSelection(combo, changedProps);
        this.ensureOnChange(combo, changedProps, true);
        (0, batch_sync_1.queueWidgetSync)(combo);
    }
    appendChild(parent, _child, childTypeName, childProps) {
        const combo = parent;
        if (childTypeName !== 'option')
            return;
        const label = this.extractLabelFromChildren(childProps?.children) ?? String(childProps?.value ?? '');
        const value = String(childProps?.value ?? label ?? '');
        const item = { value, label: label ?? value };
        this.options.push(item);
        this.labelToValue.set(item.label, item.value);
        // reflect to native immediately
        combo.DefaultOptions.Add(item.label);
        combo.AddOption(item.label);
        // if this option matches selected value, set selection
        const curVal = this.props?.value ?? this.props?.defaultValue;
        if (curVal !== undefined && String(curVal) === item.value) {
            combo.SetSelectedOption(item.label);
        }
    }
    removeChild(parent, child) {
        // For option removal, we cannot infer props from native. Keep simple: no-op.
        // In practice, options rarely removed dynamically in current demos.
        if (!(parent instanceof UE.PanelWidget)) {
            // nothing to do; ComboBoxString is not a panel
        }
    }
}
exports.SelectConverter = SelectConverter;
//# sourceMappingURL=select.js.map