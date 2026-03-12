"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasConverter = void 0;
const css_length_parser_1 = require("../parsers/css_length_parser");
const css_length_parser_2 = require("../parsers/css_length_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const container_converter_1 = require("./container_converter");
const UE = require("ue");
class CanvasConverter extends container_converter_1.ContainerConverter {
    predefinedAnchors;
    childInfo;
    childCanvasSlot;
    containerWidthRef = 0;
    containerHeightRef = 0;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.childInfo = new Map();
        this.childCanvasSlot = new Map();
        this.predefinedAnchors = {
            // 预设16种锚点
            'top left': { min_x: 0, min_y: 0, max_x: 0, max_y: 0 },
            'top center': { min_x: 0.5, min_y: 0, max_x: 0.5, max_y: 0 },
            'top right': { min_x: 1, min_y: 0, max_x: 1, max_y: 0 },
            'center left': { min_x: 0, min_y: 0.5, max_x: 0, max_y: 0.5 },
            'center center': { min_x: 0.5, min_y: 0.5, max_x: 0.5, max_y: 0.5 },
            'center right': { min_x: 1, min_y: 0.5, max_x: 1, max_y: 0.5 },
            'bottom left': { min_x: 0, min_y: 1, max_x: 0, max_y: 1 },
            'bottom center': { min_x: 0.5, min_y: 1, max_x: 0.5, max_y: 1 },
            'bottom right': { min_x: 1, min_y: 1, max_x: 1, max_y: 1 },
            'top fill': { min_x: 0, min_y: 0, max_x: 1, max_y: 0 },
            'center fill': { min_x: 0, min_y: 0.5, max_x: 1, max_y: 0.5 },
            'bottom fill': { min_x: 0, min_y: 1, max_x: 1, max_y: 1 },
            'top span-all': { min_x: 0, min_y: 0, max_x: 1, max_y: 0 },
            'center span-all': { min_x: 0, min_y: 0.5, max_x: 1, max_y: 0.5 },
            'bottom span-all': { min_x: 0, min_y: 1, max_x: 1, max_y: 1 },
            'span-all left': { min_x: 0, min_y: 0, max_x: 0, max_y: 1 },
            'span-all center': { min_x: 0.5, min_y: 0, max_x: 0.5, max_y: 1 },
            'span-all right': { min_x: 1, min_y: 0, max_x: 1, max_y: 1 },
            'fill left': { min_x: 0, min_y: 0, max_x: 0, max_y: 1 },
            'fill center': { min_x: 0.5, min_y: 0, max_x: 0.5, max_y: 1 },
            'fill right': { min_x: 1, min_y: 0, max_x: 1, max_y: 1 },
            'fill': { min_x: 0, min_y: 0, max_x: 1, max_y: 1 },
            'span-all': { min_x: 0, min_y: 0, max_x: 1, max_y: 1 },
            // todo@Caleb196x: 添加更多CSS描述
        };
    }
    createNativeWidget() {
        const widget = new UE.CanvasPanel(this.outer);
        // Prepare container reference size for % units on children
        this.updateContainerRefSize(this.containerStyle);
        return widget;
    }
    update(widget, oldProps, changedProps) {
        const mergedProps = { ...oldProps, ...changedProps };
        this.props = mergedProps;
        this.containerStyle = (0, cssstyle_parser_1.getAllStyles)(this.typeName, mergedProps);
        // Update container reference size when container size-related styles change
        this.updateContainerRefSize(this.containerStyle);
        const panel = widget;
        if (!panel || !panel.GetChildrenCount)
            return;
        const childCount = panel.GetChildrenCount();
        for (let i = 0; i < childCount; i++) {
            const child = panel.GetChildAt(i);
            if (!child)
                continue;
            const canvasSlot = this.childCanvasSlot.get(child);
            if (!canvasSlot)
                continue;
            const info = this.childInfo.get(child);
            const childStyle = info ? (0, cssstyle_parser_1.getAllStyles)(info.typeName, info.props) : undefined;
            if (childStyle) {
                this.initCanvasSlot(canvasSlot, childStyle);
            }
            else {
                const positionAnchor = this.containerStyle?.positionAnchor;
                const offsetAnchor = this.containerStyle?.offsetAnchor;
                const anchors = positionAnchor ? this.predefinedAnchors[positionAnchor]
                    : (offsetAnchor ? this.predefinedAnchors[offsetAnchor] : null);
                if (anchors) {
                    canvasSlot.SetAnchors(new UE.Anchors(new UE.Vector2D(anchors.min_x, anchors.min_y), new UE.Vector2D(anchors.max_x, anchors.max_y)));
                }
            }
        }
    }
    initCanvasSlot(canvasSlot, childStyle) {
        if (!canvasSlot)
            return;
        // child can override container anchor settings
        const positionAnchor = childStyle?.positionAnchor ?? this.containerStyle?.positionAnchor;
        const offsetAnchor = childStyle?.offsetAnchor ?? this.containerStyle?.offsetAnchor;
        const width = childStyle?.width || 'none';
        const height = childStyle?.height || 'none';
        const scale = childStyle?.scale || 1.0;
        const aspectRatio = childStyle?.aspectRatio || 'auto';
        let positionAnchors = null;
        if (positionAnchor) {
            positionAnchors = this.predefinedAnchors[positionAnchor];
        }
        else if (offsetAnchor) {
            positionAnchors = this.predefinedAnchors[offsetAnchor];
        }
        // default to absolute (top-left) when not specified
        const anchors = positionAnchors ?? { min_x: 0, min_y: 0, max_x: 0, max_y: 0 };
        canvasSlot.SetAnchors(new UE.Anchors(new UE.Vector2D(anchors.min_x, anchors.min_y), new UE.Vector2D(anchors.max_x, anchors.max_y)));
        // loction
        const top = childStyle?.top || '0px';
        const left = childStyle?.left || '0px';
        const right = childStyle?.right || '0px';
        const bottom = childStyle?.bottom || '0px';
        const topSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(top, childStyle, this.containerHeightRef);
        const leftSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(left, childStyle, this.containerWidthRef);
        const rightSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(right, childStyle, this.containerWidthRef);
        const bottomSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(bottom, childStyle, this.containerHeightRef);
        const isStretchedX = anchors.min_x !== anchors.max_x;
        const isStretchedY = anchors.min_y !== anchors.max_y;
        if (isStretchedX || isStretchedY) {
            // When stretched, offsets define distances to each anchor edge
            canvasSlot.SetOffsets(new UE.Margin(leftSU, topSU, rightSU, bottomSU));
        }
        else {
            // Non-stretched: absolute position + explicit size or autosize
            canvasSlot.SetPosition(new UE.Vector2D(leftSU, topSU));
        }
        if (!isStretchedX && !isStretchedY && width !== 'none' && height !== 'none') {
            const widthSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(width, childStyle, this.containerWidthRef);
            const heightSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(height, childStyle, this.containerHeightRef);
            canvasSlot.SetSize(new UE.Vector2D(widthSU * scale, heightSU * scale));
        }
        else if (!isStretchedX && !isStretchedY && width !== 'none' && height === 'none') {
            const widthSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(width, childStyle, this.containerWidthRef);
            if (aspectRatio !== 'auto') {
                const desiredHeight = widthSU / (0, css_length_parser_1.parseAspectRatio)(aspectRatio);
                canvasSlot.SetSize(new UE.Vector2D(widthSU * scale, desiredHeight * scale));
            }
            else {
                canvasSlot.SetSize(new UE.Vector2D(widthSU * scale, widthSU * scale));
            }
        }
        else if (!isStretchedX && !isStretchedY && height !== 'none' && width === 'none') {
            const heightSU = (0, css_length_parser_2.convertLengthUnitToSlateUnit)(height, childStyle, this.containerHeightRef);
            if (aspectRatio !== 'auto') {
                const desiredWidth = heightSU * (0, css_length_parser_1.parseAspectRatio)(aspectRatio);
                canvasSlot.SetSize(new UE.Vector2D(desiredWidth * scale, heightSU * scale));
            }
            else {
                canvasSlot.SetSize(new UE.Vector2D(heightSU * scale, heightSU * scale));
            }
        }
        else if (!isStretchedX && !isStretchedY) {
            canvasSlot.SetAutoSize(true);
        }
        // optional: per-child alignment (pivot) within the slot
        // supports: anchorAlign: "left|center|right top|center|bottom" or anchorPivot: "x y"
        const parseAlignToken = (t) => {
            const v = t.toLowerCase();
            if (v === 'left' || v === 'top' || v === 'start')
                return 0;
            if (v === 'center' || v === 'middle')
                return 0.5;
            if (v === 'right' || v === 'bottom' || v === 'end')
                return 1;
            const n = parseFloat(v);
            if (!isNaN(n))
                return Math.min(1, Math.max(0, n));
            return 0.5;
        };
        const anchorAlign = childStyle?.anchorAlign;
        const anchorPivot = childStyle?.anchorPivot;
        if (anchorAlign) {
            const parts = anchorAlign.trim().split(/\s+/);
            const h = parseAlignToken(parts[0] ?? 'center');
            const v = parseAlignToken(parts[1] ?? 'center');
            canvasSlot.SetAlignment(new UE.Vector2D(h, v));
        }
        else if (anchorPivot) {
            const parts = anchorPivot.trim().split(/\s+/);
            const h = parseAlignToken(parts[0] ?? '0.5');
            const v = parseAlignToken(parts[1] ?? '0.5');
            canvasSlot.SetAlignment(new UE.Vector2D(h, v));
        }
        // z-index mapping
        const zIndex = (() => {
            if (childStyle?.zOrder !== undefined)
                return parseInt(childStyle.zOrder);
            if (childStyle?.zIndex !== undefined)
                return parseInt(childStyle.zIndex);
            return null;
        })();
        if (zIndex !== null && !isNaN(zIndex)) {
            canvasSlot.SetZOrder(zIndex);
        }
        this.initChildPadding(canvasSlot, childStyle);
    }
    updateContainerRefSize(style) {
        if (!style) {
            this.containerWidthRef = 0;
            this.containerHeightRef = 0;
            return;
        }
        const w = style?.width;
        const h = style?.height;
        // Only resolve to absolute Slate units if not 'auto'
        this.containerWidthRef = (w && w !== 'auto') ? (0, css_length_parser_2.convertLengthUnitToSlateUnit)(w, style) : 0;
        this.containerHeightRef = (h && h !== 'auto') ? (0, css_length_parser_2.convertLengthUnitToSlateUnit)(h, style) : 0;
    }
    appendChild(parent, child, childTypeName, childProps) {
        const canvasPanel = parent;
        const childCanvasSlot = canvasPanel.AddChildToCanvas(child);
        this.childCanvasSlot.set(child, childCanvasSlot);
        // Lazy slot: defer expensive anchor/position/size computation
        // when the child is Collapsed at mount time
        if (this.isChildCollapsed(child)) {
            this._deferredSlots.set(child, { typeName: childTypeName, props: childProps });
            return;
        }
        const childStyle = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
        this.initCanvasSlot(childCanvasSlot, childStyle);
        this.childInfo.set(child, { typeName: childTypeName, props: childProps });
    }
    /**
     * Completes deferred canvas slot configuration for a child that was
     * Collapsed at mount time.  Uses the existing CanvasPanelSlot to
     * apply anchoring, positioning, and sizing.
     */
    completeDeferredSlotSetup(parent, child) {
        const deferred = this._deferredSlots.get(child);
        if (!deferred)
            return;
        this._deferredSlots.delete(child);
        // Store child info for future update cycles
        this.childInfo.set(child, { typeName: deferred.typeName, props: deferred.props });
        const canvasSlot = this.childCanvasSlot.get(child);
        if (!canvasSlot)
            return;
        const childStyle = (0, cssstyle_parser_1.getAllStyles)(deferred.typeName, deferred.props);
        this.initCanvasSlot(canvasSlot, childStyle);
    }
}
exports.CanvasConverter = CanvasConverter;
//# sourceMappingURL=canvas.js.map