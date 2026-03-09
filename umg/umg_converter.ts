import * as UE from 'ue';
import { ElementConverter } from '../converter';
import { getAllStyles } from '../parsers/cssstyle_parser';
import { parseWidgetSelfAlignment } from '../parsers/alignment_parser';

export class UMGConverter extends ElementConverter {
    private readonly predefinedWidgets: string[];

    /**
     * Maps type names to their module file when the converter class lives
     * in a different file than the type name would suggest.
     * e.g. 'TreeViewItem' -> 'TreeView' means TreeViewItemConverter lives in TreeView.ts
     */
    private readonly moduleOverrides: Record<string, string>;

    private proxy: UMGConverter;
    constructor(typeName: string, props: any, outer: any) {
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
        ]

        // Converter classes that live in a module file different from their type name
        this.moduleOverrides = {
            'TreeViewItem': 'TreeView',
        };

        this.proxy = null;
    }

    private createProxy(typeName: string): UMGConverter {
        // Create proxy converter for predefined widget types
        let proxy: UMGConverter;
        if (this.predefinedWidgets.includes(typeName)) {
            // Resolve the module file: use override mapping if present, otherwise the type name
            const moduleName = this.moduleOverrides[typeName] ?? typeName;
            const Module = require(`./predefined/${moduleName}`);
            if (Module) {
                const ClassName = `${typeName}Converter`;
                proxy = new Module[ClassName](this.typeName, this.props, this.outer);
            }
        } else {
            // Fall through to the generic native widget converter for unrecognized UMG types
            const NativeWidgetModule = require('./native_widget_converter');
            if (NativeWidgetModule) {
                proxy = new NativeWidgetModule["NativeWidgetConverter"](this.typeName, this.props, this.outer);
            }
        }

        return proxy;
    }

    private hasMethod(obj: any, methodName: string): boolean {
        const method = obj?.[methodName];
        return typeof method === 'function';
    }

    initPanelChildSlot(slot: any, childTypeName: string, childProps: any): void {
        if (slot) {
            const childStyle = getAllStyles(childTypeName, childProps);
            const alignment = parseWidgetSelfAlignment(childStyle);
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
    createNativeWidget(): UE.Widget {
        if (!this.proxy) {
            this.proxy = this.createProxy(this.typeName);
        }

        if (this.proxy) {
            return this.proxy.createNativeWidget();
        }

        return null;
    }
    
    update(widget: UE.Widget, oldProps: any, changedProps: any): void {
        if (this.proxy) {
            this.proxy.update(widget, oldProps, changedProps);
        }
    }

    appendChild(parent: UE.Widget, child: UE.Widget, childTypeName: string, childProps: any): void {
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
    
    removeChild(parent: UE.Widget, child: UE.Widget): void {
        if (this.proxy) {
            this.proxy.removeChild(parent, child);
            return;
        }

        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }

    dispose(): void {
        if (this.proxy) {
            this.proxy.dispose();
        }
        super.dispose();
    }
    
}
