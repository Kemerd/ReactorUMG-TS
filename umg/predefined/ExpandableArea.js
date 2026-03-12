"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpandableAreaConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const cssstyle_parser_1 = require("../../parsers/cssstyle_parser");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const css_color_parser_1 = require("../../parsers/css_color_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class ExpandableAreaConverter extends umg_converter_1.UMGConverter {
    headerWidget;
    areaWidget;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    resolveWidget(content) {
        if (!content) {
            return null;
        }
        if (content instanceof UE.Widget) {
            return content;
        }
        const native = content?.native;
        if (native instanceof UE.Widget) {
            return native;
        }
        return null;
    }
    setHeaderContent(area, content) {
        const widget = this.resolveWidget(content);
        if (this.headerWidget === widget) {
            return false;
        }
        if (this.headerWidget && this.headerWidget !== widget) {
            this.headerWidget?.RemoveFromParent?.();
        }
        const setter = area.SetHeaderContent;
        if (typeof setter === 'function') {
            setter.call(area, widget);
        }
        else {
            area.HeaderContent = widget;
        }
        this.headerWidget = widget;
        return true;
    }
    setAreaContent(area, content) {
        const widget = this.resolveWidget(content);
        if (this.areaWidget === widget) {
            return false;
        }
        if (this.areaWidget && this.areaWidget !== widget) {
            this.areaWidget?.RemoveFromParent?.();
        }
        const setter = area.SetAreaContent ?? area.SetBodyContent;
        if (typeof setter === 'function') {
            setter.call(area, widget);
        }
        else {
            area.BodyContent = widget;
        }
        this.areaWidget = widget;
        return true;
    }
    applyProps(area, props) {
        let updated = false;
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
        if (props?.expanded !== undefined) {
            area.SetIsExpanded(!!props.expanded);
            updated = true;
        }
        if (props?.maxHeight !== undefined) {
            area.MaxHeight = props.maxHeight;
            updated = true;
        }
        if (props?.rolloutAnimationLasts !== undefined) {
            area.Style.RolloutAnimationSeconds = props.rolloutAnimationLasts;
            updated = true;
        }
        if (props?.headerPadding !== undefined) {
            const margin = (0, css_margin_parser_1.convertToUEMargin)(styles, props.headerPadding, '', '', '', '');
            if (margin) {
                area.HeaderPadding = margin;
                updated = true;
            }
        }
        if (props?.areaPadding !== undefined) {
            const margin = (0, css_margin_parser_1.convertToUEMargin)(styles, props.areaPadding, '', '', '', '');
            if (margin) {
                area.AreaPadding = margin;
                updated = true;
            }
        }
        if (props?.collapsedIcon) {
            area.Style.CollapsedImage = (0, brush_parser_1.parseBrush)(props.collapsedIcon);
            updated = true;
        }
        if (props?.expandedIcon) {
            area.Style.ExpandedImage = (0, brush_parser_1.parseBrush)(props.expandedIcon);
            updated = true;
        }
        if (props?.borderImage) {
            area.BorderBrush = (0, brush_parser_1.parseBrush)(props.borderImage);
            updated = true;
        }
        if (props?.borderColor) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(props.borderColor);
            area.BorderColor = new UE.SlateColor(new UE.LinearColor(rgba.r, rgba.g, rgba.b, rgba.a), UE.ESlateColorStylingMode.UseColor_Specified);
            updated = true;
        }
        if (props?.onExpansionChanged) {
            area.OnExpansionChanged.Add(props.onExpansionChanged);
        }
        return updated;
    }
    applyContent(area, props, applyAll) {
        let changed = false;
        if (applyAll || (props && Object.prototype.hasOwnProperty.call(props, 'header'))) {
            changed = this.setHeaderContent(area, props?.header) || changed;
        }
        if (applyAll || (props && Object.prototype.hasOwnProperty.call(props, 'area'))) {
            changed = this.setAreaContent(area, props?.area) || changed;
        }
        return changed;
    }
    createNativeWidget() {
        const area = new UE.ExpandableArea(this.outer);
        const propsUpdated = this.applyProps(area, this.props);
        const contentUpdated = this.applyContent(area, this.props, true);
        if (propsUpdated || contentUpdated) {
            (0, batch_sync_1.queueWidgetSync)(area);
        }
        return area;
    }
    update(widget, _oldProps, changedProps) {
        const area = widget;
        const propsUpdated = this.applyProps(area, changedProps);
        const contentUpdated = this.applyContent(area, changedProps, false);
        if (propsUpdated || contentUpdated) {
            (0, batch_sync_1.queueWidgetSync)(area);
        }
    }
    appendChild(parent, child) {
        const area = parent;
        if (!this.headerWidget) {
            this.setHeaderContent(area, child);
        }
        else {
            this.setAreaContent(area, child);
        }
    }
    removeChild(parent, child) {
        const area = parent;
        if (child === this.headerWidget) {
            this.setHeaderContent(area, null);
            return;
        }
        if (child === this.areaWidget) {
            this.setAreaContent(area, null);
            return;
        }
        child?.RemoveFromParent?.();
    }
}
exports.ExpandableAreaConverter = ExpandableAreaConverter;
//# sourceMappingURL=ExpandableArea.js.map