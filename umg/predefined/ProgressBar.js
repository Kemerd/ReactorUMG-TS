"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressBarConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class ProgressBarConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    initProps(progressBar, props) {
        if (!progressBar) {
            return;
        }
        let propsInit = false;
        const backgroundImageMap = {
            'background': 'BackgroundImage',
            'fillBackground': 'FillImage',
            'marqueeBackground': 'MarqueeImage',
        };
        for (const [key, value] of Object.entries(props)) {
            if (backgroundImageMap[key]) {
                progressBar.WidgetStyle[backgroundImageMap[key]] = (0, brush_parser_1.parseBrush)(value);
                propsInit = true;
            }
            else if (key === 'enableFillAnimation') {
                progressBar.WidgetStyle.EnableFillAnimation = value;
                propsInit = true;
            }
            else if (key === 'fillColor') {
                const color = (0, css_color_parser_1.parseToLinearColor)(value);
                progressBar.FillColorAndOpacity.R = color.r;
                progressBar.FillColorAndOpacity.G = color.g;
                progressBar.FillColorAndOpacity.B = color.b;
                progressBar.FillColorAndOpacity.A = color.a;
                propsInit = true;
            }
            else if (key === 'barType') {
                switch (value) {
                    case 'left-to-right':
                        progressBar.BarFillType = UE.EProgressBarFillType.LeftToRight;
                        break;
                    case 'right-to-left':
                        progressBar.BarFillType = UE.EProgressBarFillType.RightToLeft;
                        break;
                    case 'top-to-bottom':
                        progressBar.BarFillType = UE.EProgressBarFillType.TopToBottom;
                        break;
                    case 'bottom-to-top':
                        progressBar.BarFillType = UE.EProgressBarFillType.BottomToTop;
                        break;
                    case 'fill-from-center':
                        progressBar.BarFillType = UE.EProgressBarFillType.FillFromCenter;
                        break;
                    case 'fill-from-center-x':
                        progressBar.BarFillType = UE.EProgressBarFillType.FillFromCenterHorizontal;
                        break;
                    case 'fill-from-center-y':
                        progressBar.BarFillType = UE.EProgressBarFillType.FillFromCenterVertical;
                        break;
                    default:
                        progressBar.BarFillType = UE.EProgressBarFillType.LeftToRight;
                        break;
                }
                propsInit = true;
            }
            else if (key === 'precentBinding' && typeof value === 'function') {
                progressBar.PercentDelegate.Bind(value);
                propsInit = true;
            }
            else if (key === 'fillColorBinding' && typeof value === 'function') {
                progressBar.FillColorAndOpacityDelegate.Bind(() => {
                    const color = (0, css_color_parser_1.parseToLinearColor)(value());
                    const linearColor = new UE.LinearColor();
                    linearColor.R = color.r;
                    linearColor.G = color.g;
                    linearColor.B = color.b;
                    linearColor.A = color.a;
                    return linearColor;
                });
                propsInit = true;
            }
            else if (key === 'precent') {
                progressBar.SetPercent(value);
            }
            else if (key === 'isMarquee') {
                progressBar.SetIsMarquee(value);
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const progressBar = new UE.ProgressBar(this.outer);
        const propsInit = this.initProps(progressBar, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(progressBar);
        }
        return progressBar;
    }
    update(widget, oldProps, changedProps) {
        const progressBar = widget;
        const propsChanged = this.initProps(progressBar, changedProps);
        if (propsChanged) {
            (0, batch_sync_1.queueWidgetSync)(progressBar);
        }
    }
}
exports.ProgressBarConverter = ProgressBarConverter;
//# sourceMappingURL=ProgressBar.js.map