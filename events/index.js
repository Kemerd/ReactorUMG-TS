"use strict";
/**
 * ============================================================================
 * ReactorUMG Event System - Public API
 * ============================================================================
 *
 * Re-exports the complete event system for use by the renderer, converters,
 * and user-facing code.
 * ============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.disposeEventSystem = exports.blurAll = exports.focusWidget = exports.routeDragCancelled = exports.routeDrop = exports.routeDragLeave = exports.routeDragEnter = exports.routeDragOver = exports.routeDragStart = exports.routeTouchEvent = exports.routeTabNavigation = exports.routeKeyboardEvent = exports.reparentEventNode = exports.destroyEventNode = exports.createEventNode = exports.hasEventHandlers = exports.syncEventHandlers = exports.PROP_TO_EVENT_TYPE = exports.WHEEL_EVENT_PROPS = exports.TOUCH_EVENT_PROPS = exports.DRAG_EVENT_PROPS = exports.FOCUS_EVENT_PROPS = exports.KEYBOARD_EVENT_PROPS = exports.MOUSE_EVENT_PROPS = exports.ALL_EVENT_PROPS_WITH_CAPTURE = exports.ALL_EVENT_PROPS = exports.EventNode = exports.EventDispatcher = exports.EVENT_PHASE_BUBBLING = exports.EVENT_PHASE_AT_TARGET = exports.EVENT_PHASE_CAPTURING = exports.EVENT_PHASE_NONE = exports.ReactDataTransfer = exports.SyntheticTouchEvent = exports.SyntheticDragEvent = exports.SyntheticFocusEvent = exports.SyntheticKeyboardEvent = exports.SyntheticWheelEvent = exports.SyntheticMouseEvent = exports.SyntheticEvent = void 0;
// Synthetic event classes
var synthetic_event_1 = require("./synthetic_event");
Object.defineProperty(exports, "SyntheticEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticEvent; } });
Object.defineProperty(exports, "SyntheticMouseEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticMouseEvent; } });
Object.defineProperty(exports, "SyntheticWheelEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticWheelEvent; } });
Object.defineProperty(exports, "SyntheticKeyboardEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticKeyboardEvent; } });
Object.defineProperty(exports, "SyntheticFocusEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticFocusEvent; } });
Object.defineProperty(exports, "SyntheticDragEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticDragEvent; } });
Object.defineProperty(exports, "SyntheticTouchEvent", { enumerable: true, get: function () { return synthetic_event_1.SyntheticTouchEvent; } });
Object.defineProperty(exports, "ReactDataTransfer", { enumerable: true, get: function () { return synthetic_event_1.ReactDataTransfer; } });
Object.defineProperty(exports, "EVENT_PHASE_NONE", { enumerable: true, get: function () { return synthetic_event_1.EVENT_PHASE_NONE; } });
Object.defineProperty(exports, "EVENT_PHASE_CAPTURING", { enumerable: true, get: function () { return synthetic_event_1.EVENT_PHASE_CAPTURING; } });
Object.defineProperty(exports, "EVENT_PHASE_AT_TARGET", { enumerable: true, get: function () { return synthetic_event_1.EVENT_PHASE_AT_TARGET; } });
Object.defineProperty(exports, "EVENT_PHASE_BUBBLING", { enumerable: true, get: function () { return synthetic_event_1.EVENT_PHASE_BUBBLING; } });
// Event dispatcher (singleton)
var event_dispatcher_1 = require("./event_dispatcher");
Object.defineProperty(exports, "EventDispatcher", { enumerable: true, get: function () { return event_dispatcher_1.EventDispatcher; } });
Object.defineProperty(exports, "EventNode", { enumerable: true, get: function () { return event_dispatcher_1.EventNode; } });
Object.defineProperty(exports, "ALL_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.ALL_EVENT_PROPS; } });
Object.defineProperty(exports, "ALL_EVENT_PROPS_WITH_CAPTURE", { enumerable: true, get: function () { return event_dispatcher_1.ALL_EVENT_PROPS_WITH_CAPTURE; } });
Object.defineProperty(exports, "MOUSE_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.MOUSE_EVENT_PROPS; } });
Object.defineProperty(exports, "KEYBOARD_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.KEYBOARD_EVENT_PROPS; } });
Object.defineProperty(exports, "FOCUS_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.FOCUS_EVENT_PROPS; } });
Object.defineProperty(exports, "DRAG_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.DRAG_EVENT_PROPS; } });
Object.defineProperty(exports, "TOUCH_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.TOUCH_EVENT_PROPS; } });
Object.defineProperty(exports, "WHEEL_EVENT_PROPS", { enumerable: true, get: function () { return event_dispatcher_1.WHEEL_EVENT_PROPS; } });
Object.defineProperty(exports, "PROP_TO_EVENT_TYPE", { enumerable: true, get: function () { return event_dispatcher_1.PROP_TO_EVENT_TYPE; } });
// Event binding utilities
var event_binding_1 = require("./event_binding");
Object.defineProperty(exports, "syncEventHandlers", { enumerable: true, get: function () { return event_binding_1.syncEventHandlers; } });
Object.defineProperty(exports, "hasEventHandlers", { enumerable: true, get: function () { return event_binding_1.hasEventHandlers; } });
Object.defineProperty(exports, "createEventNode", { enumerable: true, get: function () { return event_binding_1.createEventNode; } });
Object.defineProperty(exports, "destroyEventNode", { enumerable: true, get: function () { return event_binding_1.destroyEventNode; } });
Object.defineProperty(exports, "reparentEventNode", { enumerable: true, get: function () { return event_binding_1.reparentEventNode; } });
Object.defineProperty(exports, "routeKeyboardEvent", { enumerable: true, get: function () { return event_binding_1.routeKeyboardEvent; } });
Object.defineProperty(exports, "routeTabNavigation", { enumerable: true, get: function () { return event_binding_1.routeTabNavigation; } });
Object.defineProperty(exports, "routeTouchEvent", { enumerable: true, get: function () { return event_binding_1.routeTouchEvent; } });
Object.defineProperty(exports, "routeDragStart", { enumerable: true, get: function () { return event_binding_1.routeDragStart; } });
Object.defineProperty(exports, "routeDragOver", { enumerable: true, get: function () { return event_binding_1.routeDragOver; } });
Object.defineProperty(exports, "routeDragEnter", { enumerable: true, get: function () { return event_binding_1.routeDragEnter; } });
Object.defineProperty(exports, "routeDragLeave", { enumerable: true, get: function () { return event_binding_1.routeDragLeave; } });
Object.defineProperty(exports, "routeDrop", { enumerable: true, get: function () { return event_binding_1.routeDrop; } });
Object.defineProperty(exports, "routeDragCancelled", { enumerable: true, get: function () { return event_binding_1.routeDragCancelled; } });
Object.defineProperty(exports, "focusWidget", { enumerable: true, get: function () { return event_binding_1.focusWidget; } });
Object.defineProperty(exports, "blurAll", { enumerable: true, get: function () { return event_binding_1.blurAll; } });
Object.defineProperty(exports, "disposeEventSystem", { enumerable: true, get: function () { return event_binding_1.disposeEventSystem; } });
//# sourceMappingURL=index.js.map