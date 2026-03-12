"use strict";
/**
 * ============================================================================
 * ReactorUMG Event Dispatcher
 * ============================================================================
 *
 * Central event management system for the React-UMG bridge. Handles:
 *
 * - Widget-to-node registry (maps UE.Widget instances to our event nodes)
 * - Event handler storage per node
 * - DOM-like capturing and bubbling phase propagation
 * - Focus tracking for keyboard event routing
 * - Mouse/keyboard/touch/drag event dispatch
 *
 * This is a singleton: use EventDispatcher.getInstance() to access.
 * ============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventDispatcher = exports.EventNode = exports.ALL_EVENT_PROPS_WITH_CAPTURE = exports.ALL_EVENT_PROPS = exports.PROP_TO_EVENT_TYPE = exports.WHEEL_EVENT_PROPS = exports.TOUCH_EVENT_PROPS = exports.DRAG_EVENT_PROPS = exports.FOCUS_EVENT_PROPS = exports.KEYBOARD_EVENT_PROPS = exports.MOUSE_EVENT_PROPS = void 0;
const UE = require("ue");
const synthetic_event_1 = require("./synthetic_event");
/* ------------------------------------------------------------------ */
/*  Event handler prop name definitions                                */
/* ------------------------------------------------------------------ */
/**
 * All recognized React event handler prop names, organized by category.
 * These match the standard React event naming convention (camelCase).
 */
exports.MOUSE_EVENT_PROPS = [
    'onClick', 'onDoubleClick', 'onContextMenu',
    'onMouseDown', 'onMouseUp', 'onMouseMove',
    'onMouseEnter', 'onMouseLeave',
    'onMouseOver', 'onMouseOut',
];
exports.KEYBOARD_EVENT_PROPS = [
    'onKeyDown', 'onKeyUp', 'onKeyPress',
];
exports.FOCUS_EVENT_PROPS = [
    'onFocus', 'onBlur', 'onFocusIn', 'onFocusOut',
];
exports.DRAG_EVENT_PROPS = [
    'onDragStart', 'onDrag', 'onDragEnd',
    'onDragEnter', 'onDragLeave', 'onDragOver', 'onDrop',
];
exports.TOUCH_EVENT_PROPS = [
    'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel',
];
exports.WHEEL_EVENT_PROPS = [
    'onWheel',
];
/**
 * Maps React event handler prop names to the string event type used
 * inside SyntheticEvent. Example: "onClick" -> "click"
 */
exports.PROP_TO_EVENT_TYPE = {
    onClick: 'click',
    onDoubleClick: 'dblclick',
    onContextMenu: 'contextmenu',
    onMouseDown: 'mousedown',
    onMouseUp: 'mouseup',
    onMouseMove: 'mousemove',
    onMouseEnter: 'mouseenter',
    onMouseLeave: 'mouseleave',
    onMouseOver: 'mouseover',
    onMouseOut: 'mouseout',
    onKeyDown: 'keydown',
    onKeyUp: 'keyup',
    onKeyPress: 'keypress',
    onFocus: 'focus',
    onBlur: 'blur',
    onFocusIn: 'focusin',
    onFocusOut: 'focusout',
    onDragStart: 'dragstart',
    onDrag: 'drag',
    onDragEnd: 'dragend',
    onDragEnter: 'dragenter',
    onDragLeave: 'dragleave',
    onDragOver: 'dragover',
    onDrop: 'drop',
    onTouchStart: 'touchstart',
    onTouchMove: 'touchmove',
    onTouchEnd: 'touchend',
    onTouchCancel: 'touchcancel',
    onWheel: 'wheel',
};
/**
 * Reverse map: event type string -> React prop name.
 * Built lazily from PROP_TO_EVENT_TYPE on first access.
 */
const EVENT_TYPE_TO_PROP = {};
for (const prop of Object.keys(exports.PROP_TO_EVENT_TYPE)) {
    EVENT_TYPE_TO_PROP[exports.PROP_TO_EVENT_TYPE[prop]] = prop;
}
/**
 * Set of all recognized base event prop names for quick lookup.
 */
exports.ALL_EVENT_PROPS = new Set([
    ...exports.MOUSE_EVENT_PROPS,
    ...exports.KEYBOARD_EVENT_PROPS,
    ...exports.FOCUS_EVENT_PROPS,
    ...exports.DRAG_EVENT_PROPS,
    ...exports.TOUCH_EVENT_PROPS,
    ...exports.WHEEL_EVENT_PROPS,
]);
/**
 * Set of all recognized event prop names INCLUDING capture variants.
 * e.g. "onClick" AND "onClickCapture". The propagation engine invokes
 * capture handlers during the capturing phase, so they must be registered.
 */
exports.ALL_EVENT_PROPS_WITH_CAPTURE = (() => {
    const set = new Set();
    for (const prop of exports.ALL_EVENT_PROPS) {
        set.add(prop);
        set.add(prop + 'Capture');
    }
    return set;
})();
/**
 * Events that do NOT bubble in the DOM (mouseenter, mouseleave, focus, blur).
 * These are dispatched only to the target, not through capturing/bubbling.
 */
const NON_BUBBLING_EVENTS = new Set([
    'mouseenter', 'mouseleave', 'focus', 'blur',
]);
/* ------------------------------------------------------------------ */
/*  Event Node: lightweight wrapper tracking handlers + tree position   */
/* ------------------------------------------------------------------ */
/**
 * An EventNode links a UE.Widget to its React event handlers and
 * its position in the widget tree (parent reference for bubbling).
 */
class EventNode {
    /** The underlying UE.Widget instance */
    widget;
    /** The UMGWidget wrapper from the renderer (for target/currentTarget) */
    umgWidget;
    /** Parent EventNode in the tree (null for root) */
    parent;
    /** Child EventNodes */
    children;
    /**
     * Map of React event prop names to handler functions.
     * Example: { "onClick": () => {...}, "onMouseDown": (e) => {...} }
     */
    _handlers;
    /** Whether this node has a Border wrapper for mouse event interception */
    eventBorder;
    constructor(widget, umgWidget) {
        this.widget = widget;
        this.umgWidget = umgWidget;
        this.parent = null;
        this.children = new Set();
        this._handlers = new Map();
        this.eventBorder = null;
    }
    /** Register an event handler for the given prop name */
    setHandler(propName, handler) {
        this._handlers.set(propName, handler);
    }
    /** Remove a specific event handler */
    removeHandler(propName) {
        this._handlers.delete(propName);
    }
    /** Get handler for a given React prop name */
    getHandler(propName) {
        return this._handlers.get(propName);
    }
    /** Check if this node has any handler for the given prop name */
    hasHandler(propName) {
        return this._handlers.has(propName);
    }
    /** Check if this node has ANY event handlers at all */
    hasAnyHandlers() {
        return this._handlers.size > 0;
    }
    /** Check if this node has any mouse event handlers */
    hasMouseHandlers() {
        for (const prop of exports.MOUSE_EVENT_PROPS) {
            if (this._handlers.has(prop))
                return true;
        }
        if (this._handlers.has('onWheel'))
            return true;
        return false;
    }
    /** Check if this node has any keyboard event handlers */
    hasKeyboardHandlers() {
        for (const prop of exports.KEYBOARD_EVENT_PROPS) {
            if (this._handlers.has(prop))
                return true;
        }
        return false;
    }
    /** Returns all registered handler prop names */
    getHandlerNames() {
        return Array.from(this._handlers.keys());
    }
    /** Clear all handlers (used during disposal) */
    clearHandlers() {
        this._handlers.clear();
    }
}
exports.EventNode = EventNode;
/* ================================================================== */
/*  EventDispatcher Singleton                                          */
/* ================================================================== */
/**
 * The central event dispatcher for ReactorUMG. Manages the widget-to-node
 * registry, event propagation (capturing + bubbling), focus tracking,
 * and all UE event binding.
 *
 * Usage:
 *   const dispatcher = EventDispatcher.getInstance();
 *   dispatcher.registerNode(widget, umgWidget, parentNode);
 *   dispatcher.updateHandlers(node, props);
 *   dispatcher.dispatchMouseEvent('click', nativePointerEvent, targetNode);
 */
class EventDispatcher {
    /* ---- Singleton ---- */
    static _instance = null;
    static getInstance() {
        if (!EventDispatcher._instance) {
            EventDispatcher._instance = new EventDispatcher();
        }
        return EventDispatcher._instance;
    }
    /* ---- Instance State ---- */
    /** Map from UE.Widget to its EventNode */
    _widgetToNode;
    /** The currently focused EventNode (receives keyboard events) */
    _focusedNode;
    /** The previously focused EventNode (for relatedTarget in focus events) */
    _previousFocusedNode;
    /** Active drag operation state */
    _activeDrag;
    /** Bound UE event callbacks keyed by widget, for cleanup */
    _boundCallbacks;
    constructor() {
        this._widgetToNode = new Map();
        this._focusedNode = null;
        this._previousFocusedNode = null;
        this._activeDrag = null;
        this._boundCallbacks = new Map();
    }
    /* ------------------------------------------------------------------ */
    /*  Node Registration                                                  */
    /* ------------------------------------------------------------------ */
    /**
     * Creates and registers an EventNode for a UE.Widget. Links it into the
     * tree hierarchy via the parent reference.
     *
     * @param widget      The native UE.Widget
     * @param umgWidget   The UMGWidget wrapper from the React reconciler
     * @param parentNode  The parent EventNode (null for root-level widgets)
     * @returns The newly created EventNode
     */
    registerNode(widget, umgWidget, parentNode) {
        if (!widget)
            return null;
        // If already registered, return existing
        const existing = this._widgetToNode.get(widget);
        if (existing)
            return existing;
        const node = new EventNode(widget, umgWidget);
        node.parent = parentNode;
        this._widgetToNode.set(widget, node);
        // Link into parent's children set
        if (parentNode) {
            parentNode.children.add(node);
        }
        return node;
    }
    /**
     * Unregisters an EventNode and cleans up all its UE event bindings.
     * Also removes it from its parent's children set.
     */
    unregisterNode(widget) {
        const node = this._widgetToNode.get(widget);
        if (!node)
            return;
        // Remove from parent
        if (node.parent) {
            node.parent.children.delete(node);
        }
        // Re-parent children to this node's parent (prevent orphans)
        for (const child of node.children) {
            child.parent = node.parent;
            if (node.parent) {
                node.parent.children.add(child);
            }
        }
        node.children.clear();
        // Clean up UE event bindings
        this._unbindAllWidgetEvents(widget);
        // If this was the focused node, clear focus
        if (this._focusedNode === node) {
            this._focusedNode = null;
        }
        // Clean up drag state if this was the drag source
        if (this._activeDrag?.sourceNode === node) {
            this._activeDrag = null;
        }
        node.clearHandlers();
        this._widgetToNode.delete(widget);
    }
    /**
     * Looks up the EventNode for a given UE.Widget.
     */
    getNode(widget) {
        return this._widgetToNode.get(widget) ?? null;
    }
    /* ------------------------------------------------------------------ */
    /*  Handler Management                                                 */
    /* ------------------------------------------------------------------ */
    /**
     * Scans React props for event handler functions and registers them on the
     * node. Also binds/unbinds UE native events as needed.
     *
     * @param node  The EventNode to update
     * @param props The React props object
     */
    updateHandlers(node, props) {
        if (!node || !props)
            return;
        const hadMouseHandlers = node.hasMouseHandlers();
        // Iterate all known event prop names INCLUDING capture variants.
        // The propagation engine invokes "onClickCapture" during the capturing
        // phase, so we must register those handlers on the node as well.
        for (const propName of exports.ALL_EVENT_PROPS_WITH_CAPTURE) {
            const handler = props[propName];
            if (typeof handler === 'function') {
                node.setHandler(propName, handler);
            }
            else if (handler === null || handler === undefined) {
                // Explicitly cleared handler
                if (node.hasHandler(propName)) {
                    node.removeHandler(propName);
                }
            }
        }
        // If mouse handlers were added/changed, ensure UE events are bound
        const hasMouseHandlers = node.hasMouseHandlers();
        if (hasMouseHandlers) {
            this._ensureMouseEventBinding(node);
        }
        else if (hadMouseHandlers && !hasMouseHandlers) {
            this._unbindMouseEvents(node);
        }
    }
    /* ------------------------------------------------------------------ */
    /*  Event Dispatch (Public API)                                        */
    /* ------------------------------------------------------------------ */
    /**
     * Dispatches a mouse event through the capturing -> target -> bubbling phases.
     *
     * @param eventType        DOM-style event type ("click", "mousedown", etc.)
     * @param nativeEvent      The UE.PointerEvent from Slate
     * @param targetNode       The EventNode that the event targets
     */
    dispatchMouseEvent(eventType, nativeEvent, targetNode) {
        if (!targetNode)
            return;
        // Create the appropriate synthetic event
        let syntheticEvent;
        if (eventType === 'wheel') {
            syntheticEvent = new synthetic_event_1.SyntheticWheelEvent('wheel', nativeEvent);
        }
        else {
            syntheticEvent = new synthetic_event_1.SyntheticMouseEvent(eventType, nativeEvent, !NON_BUBBLING_EVENTS.has(eventType));
        }
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }
    /**
     * Dispatches a keyboard event through the focused node's ancestor chain.
     *
     * @param eventType   "keydown", "keyup", or "keypress"
     * @param nativeEvent The UE.KeyEvent
     * @param repeat      Whether this is a repeated key event
     */
    dispatchKeyboardEvent(eventType, nativeEvent, repeat = false) {
        const targetNode = this._focusedNode;
        if (!targetNode)
            return;
        const syntheticEvent = new synthetic_event_1.SyntheticKeyboardEvent(eventType, nativeEvent, repeat);
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }
    /**
     * Dispatches a focus or blur event.
     *
     * @param eventType    "focus", "blur", "focusin", or "focusout"
     * @param targetNode   The node gaining or losing focus
     * @param nativeEvent  The UE.FocusEvent (may be null for synthetic focus changes)
     * @param relatedNode  The other node involved in the focus change
     */
    dispatchFocusEvent(eventType, targetNode, nativeEvent, relatedNode) {
        if (!targetNode)
            return;
        const syntheticEvent = new synthetic_event_1.SyntheticFocusEvent(eventType, nativeEvent ?? null, relatedNode?.umgWidget ?? null);
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }
    /**
     * Dispatches a drag event through the tree.
     *
     * @param eventType          DOM drag event type
     * @param nativePointerEvent The underlying pointer event
     * @param targetNode         The target EventNode
     * @param operation          The UE.DragDropOperation (if available)
     */
    dispatchDragEvent(eventType, nativePointerEvent, targetNode, operation) {
        if (!targetNode)
            return;
        const syntheticEvent = new synthetic_event_1.SyntheticDragEvent(eventType, nativePointerEvent, operation);
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }
    /**
     * Dispatches a touch event through the tree.
     */
    dispatchTouchEvent(eventType, nativeEvent, targetNode) {
        if (!targetNode)
            return;
        const syntheticEvent = new synthetic_event_1.SyntheticTouchEvent(eventType, nativeEvent, targetNode.umgWidget);
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }
    /* ------------------------------------------------------------------ */
    /*  Focus Management                                                   */
    /* ------------------------------------------------------------------ */
    /**
     * Sets focus to the given EventNode. Fires blur on the old node and
     * focus on the new node, including bubbling focusin/focusout events.
     */
    setFocus(node) {
        const oldNode = this._focusedNode;
        if (oldNode === node)
            return; // No change
        this._previousFocusedNode = oldNode;
        this._focusedNode = node;
        // Fire blur + focusout on the old node
        if (oldNode) {
            this.dispatchFocusEvent('blur', oldNode, null, node);
            this.dispatchFocusEvent('focusout', oldNode, null, node);
        }
        // Fire focus + focusin on the new node
        if (node) {
            this.dispatchFocusEvent('focus', node, null, oldNode);
            this.dispatchFocusEvent('focusin', node, null, oldNode);
            // Actually set UE keyboard focus on the native widget
            try {
                if (node.widget && typeof node.widget.SetKeyboardFocus === 'function') {
                    node.widget.SetKeyboardFocus();
                }
            }
            catch (e) {
                // SetKeyboardFocus may fail if widget is not in viewport yet
            }
        }
    }
    /** Returns the currently focused EventNode */
    getFocusedNode() {
        return this._focusedNode;
    }
    /**
     * Attempts to move focus to the next focusable node in tree order.
     * Implements basic tab navigation.
     *
     * @param reverse If true, moves focus backwards (Shift+Tab)
     */
    moveFocusNext(reverse = false) {
        const allNodes = this._collectFocusableNodes();
        if (allNodes.length === 0)
            return;
        const currentIdx = this._focusedNode ? allNodes.indexOf(this._focusedNode) : -1;
        let nextIdx;
        if (reverse) {
            nextIdx = currentIdx <= 0 ? allNodes.length - 1 : currentIdx - 1;
        }
        else {
            nextIdx = currentIdx >= allNodes.length - 1 ? 0 : currentIdx + 1;
        }
        this.setFocus(allNodes[nextIdx]);
    }
    /* ------------------------------------------------------------------ */
    /*  Drag & Drop State                                                  */
    /* ------------------------------------------------------------------ */
    /** Start a drag operation from the given source node */
    startDrag(sourceNode, operation) {
        this._activeDrag = {
            sourceNode,
            operation,
            dataTransfer: null,
        };
    }
    /** End the current drag operation */
    endDrag() {
        this._activeDrag = null;
    }
    /** Get the current active drag state */
    getActiveDrag() {
        return this._activeDrag;
    }
    /* ------------------------------------------------------------------ */
    /*  Cleanup                                                            */
    /* ------------------------------------------------------------------ */
    /**
     * Clears all registered nodes, handlers, and state. Called when the
     * React tree is unmounted / the widget is destroyed.
     */
    dispose() {
        // Unbind all UE events
        for (const [widget] of this._widgetToNode) {
            this._unbindAllWidgetEvents(widget);
        }
        this._widgetToNode.clear();
        this._boundCallbacks.clear();
        this._focusedNode = null;
        this._previousFocusedNode = null;
        this._activeDrag = null;
    }
    /**
     * Reset the singleton (used in tests or hot-reload scenarios).
     */
    static reset() {
        if (EventDispatcher._instance) {
            EventDispatcher._instance.dispose();
            EventDispatcher._instance = null;
        }
    }
    /* ================================================================== */
    /*  PRIVATE: Propagation Engine                                        */
    /* ================================================================== */
    /**
     * Implements DOM-like event propagation:
     * 1. Capturing phase: root -> ... -> target.parent
     * 2. At target: target
     * 3. Bubbling phase: target.parent -> ... -> root
     *
     * Non-bubbling events (mouseenter, mouseleave, focus, blur) skip
     * the capturing and bubbling phases entirely.
     */
    _propagate(event, targetNode) {
        const eventType = event.type;
        const propName = EVENT_TYPE_TO_PROP[eventType];
        if (!propName)
            return;
        // Non-bubbling events: dispatch only to target
        if (!event.bubbles) {
            event.eventPhase = synthetic_event_1.EVENT_PHASE_AT_TARGET;
            event.currentTarget = targetNode.umgWidget;
            this._invokeHandler(targetNode, propName, event);
            return;
        }
        // Build the path from root to target
        const path = this._buildPath(targetNode);
        // --- Capturing phase (root -> target, exclusive of target) ---
        event.eventPhase = synthetic_event_1.EVENT_PHASE_CAPTURING;
        const capturePropName = propName + 'Capture'; // e.g., "onClickCapture"
        for (let i = 0; i < path.length - 1; i++) {
            if (event.isPropagationStopped())
                break;
            const node = path[i];
            event.currentTarget = node.umgWidget;
            this._invokeHandler(node, capturePropName, event);
        }
        // --- At target ---
        if (!event.isPropagationStopped()) {
            event.eventPhase = synthetic_event_1.EVENT_PHASE_AT_TARGET;
            event.currentTarget = targetNode.umgWidget;
            // Fire both capture and bubble handler at target (DOM behavior)
            this._invokeHandler(targetNode, capturePropName, event);
            if (!event.isImmediatePropagationStopped()) {
                this._invokeHandler(targetNode, propName, event);
            }
        }
        // --- Bubbling phase (target.parent -> root) ---
        event.eventPhase = synthetic_event_1.EVENT_PHASE_BUBBLING;
        for (let i = path.length - 2; i >= 0; i--) {
            if (event.isPropagationStopped())
                break;
            const node = path[i];
            event.currentTarget = node.umgWidget;
            this._invokeHandler(node, propName, event);
        }
    }
    /**
     * Builds an ordered array from root to target by walking parent pointers.
     * Result: [root, ..., parent, target]
     */
    _buildPath(targetNode) {
        const path = [];
        let current = targetNode;
        while (current) {
            path.unshift(current);
            current = current.parent;
        }
        return path;
    }
    /**
     * Invokes a handler on a node if it exists, wrapping in try/catch
     * to prevent one handler's error from breaking propagation.
     */
    _invokeHandler(node, propName, event) {
        const handler = node.getHandler(propName);
        if (!handler)
            return;
        try {
            handler(event);
        }
        catch (err) {
            console.error(`[ReactorUMG] Error in event handler "${propName}":`, err);
        }
    }
    /* ================================================================== */
    /*  PRIVATE: UE Event Binding                                          */
    /* ================================================================== */
    /**
     * Ensures that the given node's UE.Widget has native UE events bound
     * so that mouse interactions flow into our dispatch system.
     *
     * Strategy:
     * - If the widget is a UE.Border, bind its OnMouseButtonDownEvent etc. directly
     * - If the widget is a UE.Button, it already has OnClicked etc. (handled separately)
     * - For other widget types, we need to check if the node's container already
     *   has a Border wrapper (from ContainerConverter) and bind to that
     */
    _ensureMouseEventBinding(node) {
        const widget = node.widget;
        if (!widget)
            return;
        // Skip if already bound by the dispatcher
        if (this._boundCallbacks.has(widget))
            return;
        // --- UE.Button: SKIP dispatcher-level binding ---
        // ButtonConverter (button.ts) already binds OnClicked/OnPressed/OnReleased/
        // OnHovered/OnUnhovered directly in its setButtonEventHandlers() method.
        // Binding again here would cause double-fire. The EventNode is still
        // registered for tree structure so future bubbling can traverse it.
        if (widget instanceof UE.Button) {
            return;
        }
        const callbackMap = new Map();
        this._boundCallbacks.set(widget, callbackMap);
        // --- UE.Border: has single-bind delegates for mouse events ---
        if (widget instanceof UE.Border) {
            this._bindBorderMouseEvents(node, widget, callbackMap);
            return;
        }
        // --- UE.Image: ImageConverter (img.ts) already binds OnMouseButtonDownEvent
        // for onClick, so we skip raw Image widgets to avoid double-fire. ---
        if (widget instanceof UE.Image) {
            return;
        }
        // --- For other widget types: try to find an existing parent Border ---
        // Most practical widgets are wrapped in a Border by ContainerConverter's
        // setupBackground(). If a parent Border exists, bind mouse events to it.
        const parentWidget = widget.GetParent?.();
        if (parentWidget instanceof UE.Border) {
            this._bindBorderMouseEvents(node, parentWidget, callbackMap);
            node.eventBorder = parentWidget;
            return;
        }
        // Last resort: we can't easily inject a Border wrapper without disrupting
        // the widget hierarchy. For these cases, mouse events won't fire. This is
        // a known limitation - users should use <div> wrappers for event handling
        // on raw UMG widgets.
    }
    /**
     * Binds UE.Border mouse event delegates to route through our dispatcher.
     */
    _bindBorderMouseEvents(node, border, callbackMap) {
        // IMPORTANT: We return WidgetBlueprintLibrary.Handled() from all callbacks.
        // This tells UMG to stop propagating the event to parent widgets' delegates.
        // Bubbling to React parent components is handled by our own propagation
        // engine, so allowing UMG to also propagate would cause double-fire on
        // nested Borders (e.g., <div onClick={outer}><div onClick={inner}>).
        // MouseButtonDown -> dispatches "mousedown" and potentially "contextmenu"
        const onDown = (geometry, pointerEvent) => {
            this.dispatchMouseEvent('mousedown', pointerEvent, node);
            // Right-click -> contextmenu
            try {
                const btn = UE.WidgetBlueprintLibrary.PointerEvent_GetEffectingButton(pointerEvent);
                if (btn?.KeyName === 'RightMouseButton') {
                    this.dispatchMouseEvent('contextmenu', pointerEvent, node);
                }
            }
            catch { /* ignore */ }
            return UE.WidgetBlueprintLibrary.Handled();
        };
        border.OnMouseButtonDownEvent.Bind(onDown);
        callbackMap.set('OnMouseButtonDownEvent', onDown);
        // MouseButtonUp -> dispatches "mouseup" and "click"
        const onUp = (geometry, pointerEvent) => {
            this.dispatchMouseEvent('mouseup', pointerEvent, node);
            // Fire "click" on mouseup (matching DOM behavior for left-click)
            try {
                const btn = UE.WidgetBlueprintLibrary.PointerEvent_GetEffectingButton(pointerEvent);
                if (!btn || btn.KeyName === 'LeftMouseButton') {
                    this.dispatchMouseEvent('click', pointerEvent, node);
                }
            }
            catch {
                this.dispatchMouseEvent('click', pointerEvent, node);
            }
            return UE.WidgetBlueprintLibrary.Handled();
        };
        border.OnMouseButtonUpEvent.Bind(onUp);
        callbackMap.set('OnMouseButtonUpEvent', onUp);
        // MouseMove -> dispatches "mousemove"
        const onMove = (geometry, pointerEvent) => {
            this.dispatchMouseEvent('mousemove', pointerEvent, node);
            return UE.WidgetBlueprintLibrary.Handled();
        };
        border.OnMouseMoveEvent.Bind(onMove);
        callbackMap.set('OnMouseMoveEvent', onMove);
        // DoubleClick -> dispatches "dblclick"
        const onDblClick = (geometry, pointerEvent) => {
            this.dispatchMouseEvent('dblclick', pointerEvent, node);
            return UE.WidgetBlueprintLibrary.Handled();
        };
        border.OnMouseDoubleClickEvent.Bind(onDblClick);
        callbackMap.set('OnMouseDoubleClickEvent', onDblClick);
    }
    /**
     * Unbinds mouse-specific UE events from a node.
     */
    _unbindMouseEvents(node) {
        this._unbindAllWidgetEvents(node.widget);
        if (node.eventBorder) {
            this._unbindAllWidgetEvents(node.eventBorder);
            node.eventBorder = null;
        }
    }
    /**
     * Unbinds ALL UE event callbacks we've registered on a widget.
     */
    _unbindAllWidgetEvents(widget) {
        const callbackMap = this._boundCallbacks.get(widget);
        if (!callbackMap)
            return;
        // For Border delegates, use Unbind()
        if (widget instanceof UE.Border) {
            const border = widget;
            try {
                if (callbackMap.has('OnMouseButtonDownEvent'))
                    border.OnMouseButtonDownEvent.Unbind();
                if (callbackMap.has('OnMouseButtonUpEvent'))
                    border.OnMouseButtonUpEvent.Unbind();
                if (callbackMap.has('OnMouseMoveEvent'))
                    border.OnMouseMoveEvent.Unbind();
                if (callbackMap.has('OnMouseDoubleClickEvent'))
                    border.OnMouseDoubleClickEvent.Unbind();
            }
            catch { /* widget may already be destroyed */ }
        }
        // NOTE: Button and Image event binding is handled by their respective
        // converters (button.ts, img.ts). The dispatcher does not bind to
        // those widget types, so no cleanup is needed here for them.
        callbackMap.clear();
        this._boundCallbacks.delete(widget);
    }
    /* ================================================================== */
    /*  PRIVATE: Focus Helpers                                             */
    /* ================================================================== */
    /**
     * Collects all nodes that are considered "focusable" for tab navigation.
     * A node is focusable if it has keyboard or focus event handlers, or if
     * its native widget has bIsFocusable set.
     */
    _collectFocusableNodes() {
        const result = [];
        // DFS through all nodes to collect focusable ones in tree order
        const visited = new Set();
        const roots = [];
        // Find root nodes (nodes with no parent)
        for (const [, node] of this._widgetToNode) {
            if (!node.parent) {
                roots.push(node);
            }
        }
        const dfs = (node) => {
            if (visited.has(node))
                return;
            visited.add(node);
            if (this._isNodeFocusable(node)) {
                result.push(node);
            }
            for (const child of node.children) {
                dfs(child);
            }
        };
        for (const root of roots) {
            dfs(root);
        }
        return result;
    }
    /**
     * Determines if an EventNode is focusable.
     */
    _isNodeFocusable(node) {
        // Has keyboard or focus handlers -> focusable
        if (node.hasKeyboardHandlers())
            return true;
        for (const prop of exports.FOCUS_EVENT_PROPS) {
            if (node.hasHandler(prop))
                return true;
        }
        // Native widget has bIsFocusable
        const widget = node.widget;
        if (!widget)
            return false;
        try {
            if (widget.bIsFocusable === true)
                return true;
            if (widget.IsFocusable === true)
                return true;
        }
        catch { /* */ }
        // Buttons and inputs are focusable by default
        if (widget instanceof UE.Button)
            return true;
        return false;
    }
}
exports.EventDispatcher = EventDispatcher;
//# sourceMappingURL=event_dispatcher.js.map