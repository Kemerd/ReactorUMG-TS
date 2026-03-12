"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeWidgetConverter = void 0;
const umg_converter_1 = require("./umg_converter");
const UE = require("ue");
const puerts = require("puerts");
const events_1 = require("../events");
const batch_sync_1 = require("../perf/batch_sync");
class NativeWidgetConverter extends umg_converter_1.UMGConverter {
    callbackRecords;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.callbackRecords = {};
    }
    getNativeWidget() {
        const classPath = exports.lazyloadComponents[this.typeName];
        let widget;
        if (classPath) {
            widget = UE.NewObject(UE.Class.Load(classPath), this.outer);
        }
        else {
            widget = new UE[this.typeName](this.outer);
        }
        return widget;
    }
    bindEvents(widget, eventName, callback) {
        let widgetEvent = widget[eventName];
        if (typeof widgetEvent.Add === 'function') {
            widgetEvent.Add(callback);
            this.callbackRecords[eventName] = () => {
                widgetEvent.Remove(callback);
            };
        }
        else if (typeof widgetEvent.Bind === 'function') {
            widgetEvent.Bind(callback);
            this.callbackRecords[eventName] = () => {
                widgetEvent.Unbind();
            };
        }
        else {
            console.error(`Failed to bind event, ${eventName} not supported`);
        }
    }
    unbindEvents(eventName) {
        let remover = this.callbackRecords[eventName];
        this.callbackRecords[eventName] = undefined;
        if (remover) {
            remover();
        }
    }
    createNativeWidget() {
        const widget = this.getNativeWidget();
        if (!widget) {
            return null;
        }
        let mergeProps = {};
        for (const key in this.props) {
            // Skip React event handler props (onClick, onKeyDownCapture, etc.)
            // These are handled by the ReactorUMG event dispatcher, not UE delegates.
            if (events_1.ALL_EVENT_PROPS_WITH_CAPTURE.has(key))
                continue;
            let val = this.props[key];
            if (typeof val === 'function') {
                this.bindEvents(widget, key, val);
            }
            else if (key !== 'children') {
                mergeProps[key] = val;
            }
        }
        puerts.merge(widget, mergeProps);
        return widget;
    }
    update(widget, oldProps, changedProps) {
        let propsChanged = {};
        for (const key in changedProps) {
            // Skip React event handler props - managed by event dispatcher
            if (events_1.ALL_EVENT_PROPS_WITH_CAPTURE.has(key))
                continue;
            let val = changedProps[key];
            if (key !== 'children') {
                if (typeof val === 'function') {
                    this.unbindEvents(key);
                    this.bindEvents(widget, key, val);
                }
                else {
                    propsChanged[key] = val;
                }
            }
        }
        if (propsChanged) {
            puerts.merge(widget, propsChanged);
            (0, batch_sync_1.queueWidgetSync)(widget);
        }
    }
    appendChild(parent, child, childTypeName, childProps) {
        if (parent instanceof UE.PanelWidget) {
            parent.AddChild(child);
        }
    }
    removeChild(parent, child) {
        if (parent instanceof UE.PanelWidget) {
            parent.RemoveChild(child);
        }
    }
}
exports.NativeWidgetConverter = NativeWidgetConverter;
//# sourceMappingURL=native_widget_converter.js.map