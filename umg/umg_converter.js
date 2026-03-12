"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UMGConverter = void 0;
const UE = require("ue");
const converter_1 = require("../converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const alignment_parser_1 = require("../parsers/alignment_parser");
class UMGConverter extends converter_1.ElementConverter {
    predefinedWidgets;
    /**
     * Maps type names to their module file when the converter class lives
     * in a different file than the type name would suggest.
     * e.g. 'TreeViewItem' -> 'TreeView' means TreeViewItemConverter lives in TreeView.ts
     */
    moduleOverrides;
    proxy;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.predefinedWidgets = [
            'Button',
            'Border',
            'CheckBox',
            'CircularThrobber',
            'Throbber',
            'ComboBox',
            'ProgressBar',
            'RadialSlider',
            'Slider',
            'Rive',
            'Spine',
            'SafeZone',
            'ScaleBox',
            'SizeBox',
            'Spacer',
            'SpinBox',
            'RetainerBox',
            'InvalidationBox',
            'Viewport',
            'UniformGrid',
            'ScrollBox',
            'ExpandableArea',
            'CanvasPanel',
            'TextBlock',
            'RichTextBlock',
            'ListView',
            'TreeView',
            'TreeViewItem',
            'TileView',
            'WrapBox'
        ];
        // Converter classes that live in a module file different from their type name
        this.moduleOverrides = {
            'TreeViewItem': 'TreeView',
        };
        this.proxy = null;
    }
    /**
     * Eagerly initializes the internal proxy converter without creating
     * a native widget.  Required when a recycled widget is used and
     * createNativeWidget is skipped — the proxy must exist so that
     * update() can delegate type-specific property application.
     */
    ensureReady() {
        if (!this.proxy) {
            this.proxy = this.createProxy(this.typeName);
        }
    }
    createProxy(typeName) {
        // Create proxy converter for predefined widget types
        let proxy;
        if (this.predefinedWidgets.includes(typeName)) {
            // Resolve the module file: use override mapping if present, otherwise the type name
            const moduleName = this.moduleOverrides[typeName] ?? typeName;
            const Module = require(`./predefined/${moduleName}`);
            if (Module) {
                const ClassName = `${typeName}Converter`;
                proxy = new Module[ClassName](this.typeName, this.props, this.outer);
            }
        }
        else {
            // Fall through to the generic native widget converter for unrecognized UMG types
            const NativeWidgetModule = require('./native_widget_converter');
            if (NativeWidgetModule) {
                proxy = new NativeWidgetModule["NativeWidgetConverter"](this.typeName, this.props, this.outer);
            }
        }
        return proxy;
    }
    hasMethod(obj, methodName) {
        const method = obj?.[methodName];
        return typeof method === 'function';
    }
    initPanelChildSlot(slot, childTypeName, childProps) {
        if (slot) {
            const childStyle = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
            const alignment = (0, alignment_parser_1.parseWidgetSelfAlignment)(childStyle);
            if (this.hasMethod(slot, 'SetHorizontalAlignment')) {
                slot.SetHorizontalAlignment(alignment.horizontal);
            }
            if (this.hasMethod(slot, 'SetVerticalAlignment')) {
                slot.SetVerticalAlignment(alignment.vertical);
            }
            if (this.hasMethod(slot, 'SetPadding')) {
                slot.SetPadding(alignment.padding);
            }
        }
    }
    /**
     * 根据自动生成的component类型，创建出对应的converter
     * 转换规则：
     * UWidget到React控件定义的转换规则：
     * 1. 根据Widget名称直接创建对应的Widget就可以；
     * 2. 基本类型转换；
     * 3. LineColor，SlateColor转换成Css Color；
     * 4. Margin转换成Css Padding；
     * 5. SlateBrush转换成ImageStyle;
     * 5-1. SlateFontInfo转换成自定义的FontInfo;
     * 6. 枚举值转换成对应的string取值串；
     * 7. WidgetStyle进行解包，将所有类型为对象类型的子元素递归的进行一次上述转换，并且自身也要设为Partial；
     * 8. 命名转换：DataDelegate转换成DataBinding;
     * 9. 命名转换：首字母大写转换成小写；
     *
     *
     * React控件定义到UWidget的转换规则：
     */
    createNativeWidget() {
        this.ensureReady();
        if (this.proxy) {
            return this.proxy.createNativeWidget();
        }
        return null;
    }
    update(widget, oldProps, changedProps) {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        // Dispatch to the predefined converter so it can apply custom child
        // management (e.g. ListView spacing, TreeView indentation, TileView
        // tile sizing, UniformGrid row/column slots, ExpandableArea header/body).
        // If the predefined converter doesn't override appendChild, it falls
        // through to this same default via the UMGConverter base class.
        if (this.proxy) {
            this.proxy.appendChild(parent, child, childTypeName, childProps);
            return;
        }
        if (parent instanceof UE.PanelWidget) {
            const slot = parent.AddChild(child);
            this.initPanelChildSlot(slot, childTypeName, childProps);
        }
    }
    removeChild(parent, child) {
        if (this.proxy) {
            this.proxy.removeChild(parent, child);
            return;
        }
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
    dispose() {
        if (this.proxy) {
            this.proxy.dispose();
        }
        super.dispose();
    }
}
exports.UMGConverter = UMGConverter;
//# sourceMappingURL=umg_converter.js.map