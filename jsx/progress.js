"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressConverter = void 0;
const jsx_converter_1 = require("./jsx_converter");
const UE = require("ue");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_background_parser_1 = require("../parsers/css_background_parser");
const css_color_parser_1 = require("../parsers/css_color_parser");
const utils_1 = require("../misc/utils");
const batch_sync_1 = require("../perf/batch_sync");
const DEFAULT_MAX = 100;
const DEFAULT_MIN = 0;
const DOUBLE_CLICK_THRESHOLD_MS = 320;
const KEY_POLL_INTERVAL_MS = 50;
const KEY_MAPPINGS = [
    { key: new UE.Key("Left"), eventKey: "ArrowLeft" },
    { key: new UE.Key("Right"), eventKey: "ArrowRight" },
    { key: new UE.Key("Up"), eventKey: "ArrowUp" },
    { key: new UE.Key("Down"), eventKey: "ArrowDown" }
];
function toLinearColor(colorSource) {
    const color = (0, css_color_parser_1.parseToLinearColor)(colorSource);
    return new UE.LinearColor(color.r, color.g, color.b, color.a);
}
function createSyntheticEvent(type, value, min, max) {
    return {
        type,
        target: {
            value,
            min,
            max
        },
        currentTarget: null,
        preventDefault() { },
        stopPropagation() { }
    };
}
function createKeyboardEvent(key, value, min, max) {
    return {
        key,
        code: key,
        target: {
            value,
            min,
            max
        },
        currentTarget: null,
        preventDefault() { },
        stopPropagation() { }
    };
}
class ProgressConverter extends jsx_converter_1.JSXConverter {
    styles;
    button;
    progressBar;
    currentMin;
    currentMax;
    currentValue;
    isMarquee;
    eventHandlers;
    keyPollHandle;
    lastClickTimestamp;
    focused;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.styles = (0, cssstyle_parser_1.getAllStyles)(typeName, props);
        this.currentMin = DEFAULT_MIN;
        this.currentMax = DEFAULT_MAX;
        this.currentValue = null;
        this.isMarquee = false;
        this.eventHandlers = {};
        this.lastClickTimestamp = 0;
        this.focused = false;
    }
    refreshStyles(props) {
        this.styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, props);
    }
    configureButtonBase(button) {
        const style = button.WidgetStyle;
        const setBrushTransparent = (brush) => {
            if (!brush) {
                return;
            }
            brush.TintColor = brush.TintColor ?? new UE.SlateColor();
            brush.TintColor.SpecifiedColor = new UE.LinearColor(0, 0, 0, 0);
            brush.DrawAs = UE.ESlateBrushDrawType.NoDrawType;
        };
        setBrushTransparent(style.Normal);
        setBrushTransparent(style.Hovered);
        setBrushTransparent(style.Pressed);
        setBrushTransparent(style.Disabled);
        button.SetBackgroundColor(new UE.LinearColor(0, 0, 0, 0));
        button.SetColorAndOpacity(new UE.LinearColor(1, 1, 1, 1));
        style.NormalPadding = new UE.Margin(0, 0, 0, 0);
        style.PressedPadding = new UE.Margin(0, 0, 0, 0);
    }
    applyProgressStyles(progressBar) {
        if (!progressBar) {
            return;
        }
        const parsedBackground = (0, css_background_parser_1.parseBackgroundProps)(this.styles);
        if (parsedBackground?.image) {
            progressBar.WidgetStyle.BackgroundImage = parsedBackground.image;
        }
        if (parsedBackground?.color) {
            progressBar.WidgetStyle.BackgroundImage.Tint = parsedBackground.color;
        }
        const fill = this.styles?.fill ??
            this.styles?.color ??
            this.styles?.backgroundColor ??
            this.styles?.fillColor;
        if (fill) {
            progressBar.SetFillColorAndOpacity(toLinearColor(fill));
        }
    }
    normalizeNumber(value, fallback) {
        if (value === undefined || value === null) {
            return fallback;
        }
        return (0, utils_1.safeParseFloat)(value);
    }
    isIndeterminate(props) {
        if (props && Object.prototype.hasOwnProperty.call(props, "indeterminate")) {
            return !!props.indeterminate;
        }
        if (props && Object.prototype.hasOwnProperty.call(props, "value")) {
            const raw = props.value;
            return raw === undefined || raw === null || raw === "";
        }
        return true;
    }
    applyValueState(props) {
        if (!this.progressBar) {
            return;
        }
        const min = this.normalizeNumber(props?.min, DEFAULT_MIN);
        let max = this.normalizeNumber(props?.max, DEFAULT_MAX);
        if (!Number.isFinite(max) || max <= min) {
            max = min + 1;
        }
        const indeterminate = this.isIndeterminate(props);
        this.currentMin = min;
        this.currentMax = max;
        this.isMarquee = indeterminate;
        if (indeterminate) {
            this.currentValue = null;
            this.progressBar.SetIsMarquee(true);
            return;
        }
        const rawValue = this.normalizeNumber(props?.value, min);
        const clamped = Math.min(Math.max(rawValue, min), max);
        this.currentValue = clamped;
        const range = max - min;
        const percent = range <= 0 ? 0 : (clamped - min) / range;
        this.progressBar.SetIsMarquee(false);
        this.progressBar.SetPercent(percent);
    }
    emitEvent(name, type) {
        const handler = this.props?.[name];
        if (typeof handler === "function") {
            handler(createSyntheticEvent(type, this.currentValue, this.currentMin, this.currentMax));
        }
    }
    emitKeyDown(key) {
        const handler = this.props?.onKeyDown;
        if (typeof handler === "function") {
            handler(createKeyboardEvent(key, this.currentValue, this.currentMin, this.currentMax));
        }
    }
    handleFocus(source) {
        if (!this.button || this.focused) {
            return;
        }
        this.focused = true;
        if (this.button.IsFocusable) {
            this.button.SetKeyboardFocus();
        }
        this.emitEvent("onFocus", `focus:${source}`);
        this.ensurePolling();
    }
    handleBlur(source) {
        if (!this.focused) {
            return;
        }
        this.focused = false;
        this.emitEvent("onBlur", `blur:${source}`);
        this.stopPolling();
    }
    ensurePolling() {
        if (this.keyPollHandle !== undefined) {
            return;
        }
        this.keyPollHandle = setInterval(() => {
            if (!this.button) {
                this.stopPolling();
                return;
            }
            if (this.focused) {
                const stillFocused = this.button.HasKeyboardFocus() || this.button.HasAnyUserFocus();
                if (!stillFocused) {
                    this.handleBlur("focus-check");
                    return;
                }
                if (typeof this.props?.onKeyDown === "function") {
                    this.pollKeyboard();
                }
            }
        }, KEY_POLL_INTERVAL_MS);
    }
    stopPolling() {
        if (this.keyPollHandle !== undefined) {
            clearInterval(this.keyPollHandle);
            this.keyPollHandle = undefined;
        }
    }
    pollKeyboard() {
        const world = UE.UMGManager.GetCurrentWorld();
        if (!world) {
            return;
        }
        const controller = UE.GameplayStatics.GetPlayerController(world, 0);
        if (!controller) {
            return;
        }
        for (const mapping of KEY_MAPPINGS) {
            if (controller.WasInputKeyJustPressed(mapping.key)) {
                this.emitKeyDown(mapping.eventKey);
            }
        }
    }
    setupEventHandlers(button) {
        const handleClick = () => {
            const now = Date.now();
            const isDouble = now - this.lastClickTimestamp <= DOUBLE_CLICK_THRESHOLD_MS;
            this.lastClickTimestamp = now;
            this.emitEvent("onClick", "click");
            this.handleFocus("click");
            if (isDouble && typeof this.props?.onDoubleClick === "function") {
                this.emitEvent("onDoubleClick", "doubleClick");
            }
        };
        const handleMouseEnter = () => {
            this.emitEvent("onMouseEnter", "mouseEnter");
        };
        const handleMouseLeave = () => {
            this.emitEvent("onMouseLeave", "mouseLeave");
            if (!this.button?.HasKeyboardFocus()) {
                this.handleBlur("mouseLeave");
            }
        };
        const clickWrapper = () => handleClick();
        const hoverWrapper = () => handleMouseEnter();
        const unhoverWrapper = () => handleMouseLeave();
        button.OnClicked.Add(clickWrapper);
        button.OnHovered.Add(hoverWrapper);
        button.OnUnhovered.Add(unhoverWrapper);
        this.eventHandlers.onClick = clickWrapper;
        this.eventHandlers.onMouseEnter = hoverWrapper;
        this.eventHandlers.onMouseLeave = unhoverWrapper;
    }
    teardownEventHandlers(button) {
        if (this.eventHandlers.onClick) {
            button.OnClicked.Remove(this.eventHandlers.onClick);
            this.eventHandlers.onClick = undefined;
        }
        if (this.eventHandlers.onMouseEnter) {
            button.OnHovered.Remove(this.eventHandlers.onMouseEnter);
            this.eventHandlers.onMouseEnter = undefined;
        }
        if (this.eventHandlers.onMouseLeave) {
            button.OnUnhovered.Remove(this.eventHandlers.onMouseLeave);
            this.eventHandlers.onMouseLeave = undefined;
        }
    }
    updateInteractivity(props) {
        if (!this.button) {
            return;
        }
        const disabled = !!props?.disabled;
        this.button.SetIsEnabled(!disabled);
        const tabIndex = props?.tabIndex;
        const focusable = !!props?.focusable ||
            typeof tabIndex === "number" && tabIndex >= 0 ||
            typeof props?.onKeyDown === "function" ||
            typeof props?.onFocus === "function";
        this.button.IsFocusable = focusable;
        if (!focusable && this.focused) {
            this.handleBlur("focusable-change");
        }
    }
    createNativeWidget() {
        this.button = new UE.Button(this.outer);
        this.configureButtonBase(this.button);
        this.progressBar = new UE.ProgressBar(this.outer);
        const slot = this.button.AddChild(this.progressBar);
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
        slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        slot.SetPadding(new UE.Margin(0, 0, 0, 0));
        this.applyProgressStyles(this.progressBar);
        this.applyValueState(this.props);
        this.updateInteractivity(this.props);
        this.setupEventHandlers(this.button);
        if (this.props?.autoFocus) {
            setTimeout(() => this.handleFocus("auto"), 0);
        }
        (0, batch_sync_1.queueWidgetSync)(this.progressBar);
        (0, batch_sync_1.queueWidgetSync)(this.button);
        return this.button;
    }
    update(widget, oldProps, changedProps) {
        const button = widget;
        if (!button) {
            return;
        }
        const nextProps = { ...oldProps, ...changedProps };
        this.props = nextProps;
        this.refreshStyles(nextProps);
        this.applyProgressStyles(this.progressBar);
        this.applyValueState(nextProps);
        this.updateInteractivity(nextProps);
        (0, batch_sync_1.queueWidgetSync)(this.progressBar);
        (0, batch_sync_1.queueWidgetSync)(button);
    }
    removeChild(parent, child) {
        super.removeChild(parent, child);
        this.handleBlur("remove");
        if (this.button && this.eventHandlers) {
            this.teardownEventHandlers(this.button);
        }
    }
}
exports.ProgressConverter = ProgressConverter;
//# sourceMappingURL=progress.js.map