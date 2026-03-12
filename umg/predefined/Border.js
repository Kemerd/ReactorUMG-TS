"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BorderConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class BorderConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    setupProps(border, props) {
        const backgroundColor = props?.backgroundColor;
        if (backgroundColor) {
            const color = (0, css_color_parser_1.parseToLinearColor)(backgroundColor);
            border.SetBrushColor(new UE.LinearColor(color.r, color.g, color.b, color.a));
        }
        const backgroundImage = props?.backgroundImage;
        if (backgroundImage) {
            const image = (0, brush_parser_1.parseBrush)(backgroundImage);
            border.SetBrush(image);
        }
        const contentColor = props?.contentColor;
        if (contentColor) {
            const color = (0, css_color_parser_1.parseToLinearColor)(contentColor);
            border.SetContentColorAndOpacity(new UE.LinearColor(color.r, color.g, color.b, color.a));
        }
        const contentHorizontalAlign = props?.contentHorizontalAlign;
        if (contentHorizontalAlign) {
            switch (contentHorizontalAlign) {
                case 'left':
                    border.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
                    break;
                case 'center':
                    border.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
                    break;
                case 'right':
                    border.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
                    break;
                case 'fill':
                    border.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
                    break;
                default:
                    console.warn(`Invalid content horizontal align: ${contentHorizontalAlign}`);
                    border.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
                    break;
            }
        }
        const contentVerticalAlign = props?.contentVerticalAlign;
        if (contentVerticalAlign) {
            switch (contentVerticalAlign) {
                case 'top':
                    border.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
                    break;
                case 'center':
                    border.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
                    break;
                case 'bottom':
                    border.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Bottom);
                    break;
                case 'fill':
                    border.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
                    break;
                default:
                    console.warn(`Invalid content vertical align: ${contentVerticalAlign}`);
                    border.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
                    break;
            }
        }
        const padding = props?.contentPadding || props?.contentMargin;
        if (padding) {
            const style = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
            const pdd = (0, css_margin_parser_1.convertToUEMargin)(style, padding, '', '', '', '');
            if (pdd) {
                border.SetPadding(pdd);
            }
        }
    }
    bindEvent(border, props) {
        let bindEvent = false;
        const onMouseButtonDown = props?.onMouseButtonDown;
        if (onMouseButtonDown && typeof onMouseButtonDown === 'function') {
            border.OnMouseButtonDownEvent.Bind((MyGeometry, MouseEvent) => {
                onMouseButtonDown();
                return new UE.EventReply();
            });
            bindEvent = true;
        }
        const onMouseButtonUp = props?.onMouseButtonUp;
        if (onMouseButtonUp && typeof onMouseButtonUp === 'function') {
            border.OnMouseButtonUpEvent.Bind((MyGeometry, MouseEvent) => {
                onMouseButtonUp();
                return new UE.EventReply();
            });
            bindEvent = true;
        }
        const onMouseMove = props?.onMouseMove;
        if (onMouseMove && typeof onMouseMove === 'function') {
            border.OnMouseMoveEvent.Bind((MyGeometry, MouseEvent) => {
                onMouseMove();
                return new UE.EventReply();
            });
            bindEvent = true;
        }
        const onMouseDoubleClick = props?.onMouseDoubleClick;
        if (onMouseDoubleClick && typeof onMouseDoubleClick === 'function') {
            border.OnMouseDoubleClickEvent.Bind((MyGeometry, MouseEvent) => {
                onMouseDoubleClick();
                return new UE.EventReply();
            });
            bindEvent = true;
        }
        return bindEvent;
    }
    createNativeWidget() {
        const border = new UE.Border(this.outer);
        this.setupProps(border, this.props);
        const bindEvent = this.bindEvent(border, this.props);
        if (bindEvent) {
            (0, batch_sync_1.queueWidgetSync)(border);
        }
        return border;
    }
    update(widget, oldProps, changedProps) {
        const border = widget;
        this.setupProps(border, changedProps);
        const bindEvent = this.bindEvent(border, changedProps);
        if (bindEvent) {
            (0, batch_sync_1.queueWidgetSync)(border);
        }
    }
}
exports.BorderConverter = BorderConverter;
//# sourceMappingURL=Border.js.map