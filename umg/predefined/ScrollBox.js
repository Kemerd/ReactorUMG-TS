"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrollBoxConverter = void 0;
const UE = require("ue");
const umg_converter_1 = require("../umg_converter");
const css_margin_parser_1 = require("../../parsers/css_margin_parser");
const brush_parser_1 = require("../../parsers/brush_parser");
const batch_sync_1 = require("../../perf/batch_sync");
class ScrollBoxConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    styleKeyMap = {
        'barHorizontalBackground': 'HorizontalBackgroundImage',
        'barVerticalBackground': 'VerticalBackgroundImage',
        'normalThumbBackground': 'NormalThumbImage',
        'hoveredThumbBackground': 'HoveredThumbImage',
        'draggedThumbBackground': 'DraggedThumbImage',
        'verticalTopSlotBackground': 'VerticalTopSlotImage',
        'verticalBottomSlotBackground': 'VerticalBottomSlotImage',
        'horizontalLeftSlotBackground': 'HorizontalTopSlotImage',
        'horizontalRightSlotBackground': 'HorizontalBottomSlotImage',
    };
    setOrientation(scrollBox, orientation) {
        if (!orientation)
            return false;
        switch (orientation) {
            case 'horizontal':
                scrollBox.SetOrientation(UE.EOrientation.Orient_Horizontal);
                break;
            case 'vertical':
                scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
                break;
            default:
                scrollBox.SetOrientation(UE.EOrientation.Orient_Vertical);
                break;
        }
        return true;
    }
    setNavigationDestination(scrollBox, destination) {
        if (!destination)
            return false;
        switch (destination) {
            case 'into-view':
                scrollBox.SetNavigationDestination(UE.EDescendantScrollDestination.IntoView);
                break;
            case 'center':
                scrollBox.SetNavigationDestination(UE.EDescendantScrollDestination.Center);
                break;
            case 'top-left':
                scrollBox.SetNavigationDestination(UE.EDescendantScrollDestination.TopOrLeft);
                break;
            case 'bottom-right':
                scrollBox.SetNavigationDestination(UE.EDescendantScrollDestination.BottomOrRight);
                break;
            default:
                scrollBox.SetNavigationDestination(UE.EDescendantScrollDestination.IntoView);
                break;
        }
        return true;
    }
    setVisibility(scrollBox, visibility) {
        if (!visibility)
            return false;
        switch (visibility) {
            case 'hidden':
                scrollBox.SetScrollBarVisibility(UE.ESlateVisibility.Hidden);
                break;
            case 'collapse':
            case 'collapsed':
                scrollBox.SetScrollBarVisibility(UE.ESlateVisibility.Collapsed);
                break;
            case 'hit-test-invisible':
                scrollBox.SetScrollBarVisibility(UE.ESlateVisibility.HitTestInvisible);
                break;
            case 'self-hit-test-invisible':
                scrollBox.SetScrollBarVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
                break;
            default:
                scrollBox.SetScrollBarVisibility(UE.ESlateVisibility.Visible);
                break;
        }
        return true;
    }
    setStyle(scrollBox, props) {
        if (!props)
            return false;
        let updated = false;
        for (const key of Object.keys(props)) {
            if (this.styleKeyMap[key]) {
                scrollBox.WidgetBarStyle[this.styleKeyMap[key]] = (0, brush_parser_1.parseBrush)(props[key]);
                updated = true;
            }
        }
        if (typeof props.barThickness === 'number') {
            const thickness = props.barThickness;
            scrollBox.SetScrollbarThickness(new UE.Vector2D(thickness, thickness));
            scrollBox.WidgetBarStyle.Thickness = thickness;
            updated = true;
        }
        if (props.barPadding !== undefined) {
            scrollBox.SetScrollbarPadding((0, css_margin_parser_1.convertToUEMargin)(props, props.barPadding, '', '', '', ''));
            updated = true;
        }
        return updated;
    }
    initProps(scrollBox, props) {
        if (!scrollBox || !props)
            return false;
        let updated = false;
        updated = this.setOrientation(scrollBox, props.orientation) || updated;
        updated = this.setNavigationDestination(scrollBox, props.navigationDestination) || updated;
        updated = this.setVisibility(scrollBox, props.visibility) || updated;
        updated = this.setStyle(scrollBox, props) || updated;
        if (typeof props.alwaysShowBars === 'boolean') {
            scrollBox.SetAlwaysShowScrollbar(props.alwaysShowBars);
            updated = true;
        }
        if (typeof props.alwaysShowBarTrack === 'boolean') {
            scrollBox.AlwaysShowScrollbarTrack = props.alwaysShowBarTrack;
            updated = true;
        }
        if (typeof props.allowDragging === 'boolean') {
            scrollBox.bAllowRightClickDragScrolling = props.allowDragging;
            updated = true;
        }
        if (typeof props.allowOverscroll === 'boolean') {
            scrollBox.SetAllowOverscroll(props.allowOverscroll);
            updated = true;
        }
        return updated;
    }
    createNativeWidget() {
        const scrollBox = new UE.ScrollBox(this.outer);
        const propsInit = this.initProps(scrollBox, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(scrollBox);
        }
        return scrollBox;
    }
    update(widget, oldProps, changedProps) {
        const scrollBox = widget;
        const propsInit = this.initProps(scrollBox, changedProps);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(scrollBox);
        }
    }
}
exports.ScrollBoxConverter = ScrollBoxConverter;
//# sourceMappingURL=ScrollBox.js.map