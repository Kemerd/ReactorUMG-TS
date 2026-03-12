"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverlayConverter = void 0;
const alignment_parser_1 = require("../parsers/alignment_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const container_converter_1 = require("./container_converter");
const batch_sync_1 = require("../perf/batch_sync");
const UE = require("ue");
class OverlayConverter extends container_converter_1.ContainerConverter {
    absoluteChildren;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.absoluteChildren = new Map();
    }
    createNativeWidget() {
        const widget = new UE.Overlay(this.outer);
        return widget;
    }
    update(widget, oldProps, changedProps) {
        if (!widget) {
            return;
        }
        this.absoluteChildren.forEach((meta) => {
            if (!meta) {
                return;
            }
            const style = (0, cssstyle_parser_1.getAllStyles)(meta.typeName, meta.props);
            this.scheduleAbsoluteChildLayout(meta, style, 0);
        });
    }
    appendChild(parent, child, childTypeName, childProps) {
        const overlay = parent;
        // Lazy slot: add collapsed children to the overlay but skip
        // the style resolution, alignment, and absolute layout work.
        if (this.isChildCollapsed(child)) {
            overlay.AddChildToOverlay(child);
            this._deferredSlots.set(child, { typeName: childTypeName, props: childProps });
            return;
        }
        const overlaySlot = overlay.AddChildToOverlay(child);
        const style = (0, cssstyle_parser_1.getAllStyles)(childTypeName, childProps);
        if (!overlaySlot) {
            return;
        }
        // Track z-index for render ordering in the overlay
        const zIndex = this.extractZIndex(style);
        if (zIndex !== 0) {
            this.childZIndices.set(child, zIndex);
        }
        const alignment = (0, alignment_parser_1.parseWidgetSelfAlignment)(style);
        overlaySlot.SetHorizontalAlignment(alignment.horizontal);
        overlaySlot.SetVerticalAlignment(alignment.vertical);
        overlaySlot.SetPadding(alignment.padding);
        const isAbsolute = this.isAbsolutePositioned(style);
        if (!isAbsolute) {
            this.absoluteChildren.delete(child);
            return;
        }
        const meta = {
            child,
            parent: overlay,
            slot: overlaySlot,
            typeName: childTypeName,
            props: childProps,
        };
        this.absoluteChildren.set(child, meta);
        // When using absolute positioning we reset slot alignment to top/left so we can fully control translation.
        overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
        overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
        overlaySlot.SetPadding(new UE.Margin(0, 0, 0, 0));
        const styleLeft = style?.left;
        const styleTop = style?.top;
        if (!styleLeft && !styleTop)
            return;
        if (styleLeft.endsWith("%") && styleLeft === "50%") {
            overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
        }
        if (styleTop.endsWith("%") && styleTop === "50%") {
            overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
        }
        (0, batch_sync_1.queueSlotSync)(overlaySlot);
        this.scheduleAbsoluteChildLayout(meta, style, 0);
    }
    /**
     * Completes deferred slot configuration for an overlay child that
     * was Collapsed at mount time.  Applies alignment, absolute
     * positioning, and padding using the existing slot.
     */
    completeDeferredSlotSetup(parent, child) {
        const deferred = this._deferredSlots.get(child);
        if (!deferred)
            return;
        this._deferredSlots.delete(child);
        const style = (0, cssstyle_parser_1.getAllStyles)(deferred.typeName, deferred.props);
        const overlaySlot = child.Slot;
        if (!overlaySlot)
            return;
        const overlay = parent;
        // Track z-index
        const zIndex = this.extractZIndex(style);
        if (zIndex !== 0) {
            this.childZIndices.set(child, zIndex);
        }
        const alignment = (0, alignment_parser_1.parseWidgetSelfAlignment)(style);
        overlaySlot.SetHorizontalAlignment(alignment.horizontal);
        overlaySlot.SetVerticalAlignment(alignment.vertical);
        overlaySlot.SetPadding(alignment.padding);
        // Handle absolute positioning if relevant
        const isAbsolute = this.isAbsolutePositioned(style);
        if (!isAbsolute) {
            this.absoluteChildren.delete(child);
            (0, batch_sync_1.queueSlotSync)(overlaySlot);
            return;
        }
        const meta = {
            child,
            parent: overlay,
            slot: overlaySlot,
            typeName: deferred.typeName,
            props: deferred.props,
        };
        this.absoluteChildren.set(child, meta);
        overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
        overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
        overlaySlot.SetPadding(new UE.Margin(0, 0, 0, 0));
        const styleLeft = style?.left;
        const styleTop = style?.top;
        if (styleLeft || styleTop) {
            if (styleLeft && styleLeft.endsWith("%") && styleLeft === "50%") {
                overlaySlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
            }
            if (styleTop && styleTop.endsWith("%") && styleTop === "50%") {
                overlaySlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            }
            (0, batch_sync_1.queueSlotSync)(overlaySlot);
            this.scheduleAbsoluteChildLayout(meta, style, 0);
        }
    }
    removeChild(parent, child) {
        this.absoluteChildren.delete(child);
        child.RemoveFromParent();
    }
    isAbsolutePositioned(style) {
        if (!style) {
            return false;
        }
        if (style.position && style.position.toString().toLowerCase() === "absolute") {
            return true;
        }
        return ["left", "right", "top", "bottom"].some((key) => style[key] !== undefined);
    }
    scheduleAbsoluteChildLayout(meta, style, attempt) {
        const maxAttempts = 10;
        const parentSize = this.getWidgetPixelSize(meta.parent);
        const childSize = this.getWidgetPixelSize(meta.child);
        if (!this.isSizeValid(parentSize) || !this.isSizeValid(childSize)) {
            if (attempt >= maxAttempts) {
                return;
            }
            console.log("delay setup child layout");
            setTimeout(() => this.scheduleAbsoluteChildLayout(meta, style, attempt + 1), 2000);
            return;
        }
        this.applyAbsoluteLayout(meta, style, parentSize, childSize);
    }
    getWidgetPixelSize(widget) {
        if (!widget) {
            return new UE.Vector2D(0, 0);
        }
        try {
            const size = UE.UMGManager.GetWidgetScreenPixelSize(widget);
            if (this.isSizeValid(size)) {
                return size;
            }
        }
        catch (err) {
            // ignore and fallback
        }
        return widget.GetDesiredSize();
    }
    isSizeValid(size) {
        if (!size) {
            return false;
        }
        return size.X > 0 && size.Y > 0;
    }
    applyAbsoluteLayout(meta, style, parentSize, childSize) {
        const { child, slot } = meta;
        const styleLeft = style?.left;
        const styleTop = style?.top;
        if (!styleLeft && !styleTop)
            return;
        // center case
        let donotSetValue = false;
        if (styleLeft.endsWith("%") && styleLeft === "50%") {
            slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center);
            donotSetValue = true;
        }
        if (styleTop.endsWith("%") && styleTop === "50%") {
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            donotSetValue = true;
        }
        if (!donotSetValue) {
            const left = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style?.left, style, parentSize.X);
            const top = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(style?.top, style, parentSize.Y);
            const transformTranslate = this.computeTransformTranslation(style, childSize);
            const paddingLeft = left + transformTranslate.X;
            const paddingTop = top + transformTranslate.Y;
            slot.SetPadding(new UE.Margin(paddingLeft, paddingTop, 0, 0));
        }
        (0, batch_sync_1.queueSlotSync)(slot);
    }
    computeTransformTranslation(style, childSize) {
        let translateX = 0;
        let translateY = 0;
        const accumulate = (value, axis) => {
            const reference = axis === "x" ? childSize.X : childSize.Y;
            const resolved = (0, css_length_parser_1.convertLengthUnitToSlateUnit)(value, style, reference);
            if (resolved !== null) {
                if (axis === "x") {
                    translateX += resolved;
                }
                else {
                    translateY += resolved;
                }
            }
        };
        const parseTranslateList = (raw, axis) => {
            if (!raw) {
                return;
            }
            const parts = raw.split(/[, ]+/).filter((p) => p.length > 0);
            if (parts.length === 0) {
                return;
            }
            accumulate(parts[0], "x");
            if (parts.length > 1) {
                accumulate(parts[1], "y");
            }
            else if (axis === "y") {
                accumulate(parts[0], "y");
            }
        };
        const transform = style?.transform;
        if (typeof transform === "string" && transform.length > 0) {
            const regex = /(translate(?:3d|X|Y)?)\(([^)]+)\)/g;
            let match;
            while ((match = regex.exec(transform)) !== null) {
                const fn = match[1];
                const args = match[2];
                switch (fn) {
                    case "translate":
                        parseTranslateList(args, "x");
                        break;
                    case "translate3d":
                        parseTranslateList(args, "x");
                        break;
                    case "translateX":
                        accumulate(args, "x");
                        break;
                    case "translateY":
                        accumulate(args, "y");
                        break;
                }
            }
        }
        if (style?.translate) {
            parseTranslateList(style.translate.toString(), "x");
        }
        if (style?.translateX !== undefined) {
            accumulate(style.translateX, "x");
        }
        if (style?.translateY !== undefined) {
            accumulate(style.translateY, "y");
        }
        return { X: translateX, Y: translateY };
    }
}
exports.OverlayConverter = OverlayConverter;
//# sourceMappingURL=overlay.js.map