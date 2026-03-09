/**
 * ============================================================================
 * ReactorUMG Event System - Public API
 * ============================================================================
 * 
 * Re-exports the complete event system for use by the renderer, converters,
 * and user-facing code.
 * ============================================================================
 */

// Synthetic event classes
export {
    SyntheticEvent,
    SyntheticMouseEvent,
    SyntheticWheelEvent,
    SyntheticKeyboardEvent,
    SyntheticFocusEvent,
    SyntheticDragEvent,
    SyntheticTouchEvent,
    ReactDataTransfer,
    EVENT_PHASE_NONE,
    EVENT_PHASE_CAPTURING,
    EVENT_PHASE_AT_TARGET,
    EVENT_PHASE_BUBBLING,
} from './synthetic_event';
export type { TouchPoint } from './synthetic_event';

// Event dispatcher (singleton)
export {
    EventDispatcher,
    EventNode,
    ALL_EVENT_PROPS,
    MOUSE_EVENT_PROPS,
    KEYBOARD_EVENT_PROPS,
    FOCUS_EVENT_PROPS,
    DRAG_EVENT_PROPS,
    TOUCH_EVENT_PROPS,
    WHEEL_EVENT_PROPS,
    PROP_TO_EVENT_TYPE,
} from './event_dispatcher';

// Event binding utilities
export {
    syncEventHandlers,
    hasEventHandlers,
    createEventNode,
    destroyEventNode,
    reparentEventNode,
    routeKeyboardEvent,
    routeTabNavigation,
    routeTouchEvent,
    routeDragStart,
    routeDragOver,
    routeDragEnter,
    routeDragLeave,
    routeDrop,
    routeDragCancelled,
    focusWidget,
    blurAll,
    disposeEventSystem,
} from './event_binding';
