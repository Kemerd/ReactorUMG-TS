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

import * as UE from 'ue';
import {
    SyntheticEvent,
    SyntheticMouseEvent,
    SyntheticWheelEvent,
    SyntheticKeyboardEvent,
    SyntheticFocusEvent,
    SyntheticDragEvent,
    SyntheticTouchEvent,
    EVENT_PHASE_CAPTURING,
    EVENT_PHASE_AT_TARGET,
    EVENT_PHASE_BUBBLING,
} from './synthetic_event';

/* ------------------------------------------------------------------ */
/*  Event handler prop name definitions                                */
/* ------------------------------------------------------------------ */

/**
 * All recognized React event handler prop names, organized by category.
 * These match the standard React event naming convention (camelCase).
 */
export const MOUSE_EVENT_PROPS = [
    'onClick', 'onDoubleClick', 'onContextMenu',
    'onMouseDown', 'onMouseUp', 'onMouseMove',
    'onMouseEnter', 'onMouseLeave',
    'onMouseOver', 'onMouseOut',
] as const;

export const KEYBOARD_EVENT_PROPS = [
    'onKeyDown', 'onKeyUp', 'onKeyPress',
] as const;

export const FOCUS_EVENT_PROPS = [
    'onFocus', 'onBlur', 'onFocusIn', 'onFocusOut',
] as const;

export const DRAG_EVENT_PROPS = [
    'onDragStart', 'onDrag', 'onDragEnd',
    'onDragEnter', 'onDragLeave', 'onDragOver', 'onDrop',
] as const;

export const TOUCH_EVENT_PROPS = [
    'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel',
] as const;

export const WHEEL_EVENT_PROPS = [
    'onWheel',
] as const;

/**
 * Maps React event handler prop names to the string event type used
 * inside SyntheticEvent. Example: "onClick" -> "click"
 */
export const PROP_TO_EVENT_TYPE: Record<string, string> = {
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
const EVENT_TYPE_TO_PROP: Record<string, string> = {};
for (const prop of Object.keys(PROP_TO_EVENT_TYPE)) {
    EVENT_TYPE_TO_PROP[PROP_TO_EVENT_TYPE[prop]] = prop;
}

/**
 * Set of all recognized base event prop names for quick lookup.
 */
export const ALL_EVENT_PROPS: ReadonlySet<string> = new Set([
    ...MOUSE_EVENT_PROPS,
    ...KEYBOARD_EVENT_PROPS,
    ...FOCUS_EVENT_PROPS,
    ...DRAG_EVENT_PROPS,
    ...TOUCH_EVENT_PROPS,
    ...WHEEL_EVENT_PROPS,
]);

/**
 * Set of all recognized event prop names INCLUDING capture variants.
 * e.g. "onClick" AND "onClickCapture". The propagation engine invokes
 * capture handlers during the capturing phase, so they must be registered.
 */
export const ALL_EVENT_PROPS_WITH_CAPTURE: ReadonlySet<string> = (() => {
    const set = new Set<string>();
    for (const prop of ALL_EVENT_PROPS) {
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
export class EventNode {
    /** The underlying UE.Widget instance */
    public readonly widget: UE.Widget;

    /** The UMGWidget wrapper from the renderer (for target/currentTarget) */
    public readonly umgWidget: any;

    /** Parent EventNode in the tree (null for root) */
    public parent: EventNode | null;

    /** Child EventNodes */
    public readonly children: Set<EventNode>;

    /**
     * Map of React event prop names to handler functions.
     * Example: { "onClick": () => {...}, "onMouseDown": (e) => {...} }
     */
    private _handlers: Map<string, Function>;

    /** Whether this node has a Border wrapper for mouse event interception */
    public eventBorder: UE.Border | null;

    constructor(widget: UE.Widget, umgWidget: any) {
        this.widget = widget;
        this.umgWidget = umgWidget;
        this.parent = null;
        this.children = new Set();
        this._handlers = new Map();
        this.eventBorder = null;
    }

    /** Register an event handler for the given prop name */
    setHandler(propName: string, handler: Function): void {
        this._handlers.set(propName, handler);
    }

    /** Remove a specific event handler */
    removeHandler(propName: string): void {
        this._handlers.delete(propName);
    }

    /** Get handler for a given React prop name */
    getHandler(propName: string): Function | undefined {
        return this._handlers.get(propName);
    }

    /** Check if this node has any handler for the given prop name */
    hasHandler(propName: string): boolean {
        return this._handlers.has(propName);
    }

    /** Check if this node has ANY event handlers at all */
    hasAnyHandlers(): boolean {
        return this._handlers.size > 0;
    }

    /** Check if this node has any mouse event handlers */
    hasMouseHandlers(): boolean {
        for (const prop of MOUSE_EVENT_PROPS) {
            if (this._handlers.has(prop)) return true;
        }
        if (this._handlers.has('onWheel')) return true;
        return false;
    }

    /** Check if this node has any keyboard event handlers */
    hasKeyboardHandlers(): boolean {
        for (const prop of KEYBOARD_EVENT_PROPS) {
            if (this._handlers.has(prop)) return true;
        }
        return false;
    }

    /** Returns all registered handler prop names */
    getHandlerNames(): string[] {
        return Array.from(this._handlers.keys());
    }

    /** Clear all handlers (used during disposal) */
    clearHandlers(): void {
        this._handlers.clear();
    }
}

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
export class EventDispatcher {
    /* ---- Singleton ---- */
    private static _instance: EventDispatcher | null = null;

    static getInstance(): EventDispatcher {
        if (!EventDispatcher._instance) {
            EventDispatcher._instance = new EventDispatcher();
        }
        return EventDispatcher._instance;
    }

    /* ---- Instance State ---- */

    /** Map from UE.Widget to its EventNode */
    private _widgetToNode: Map<UE.Widget, EventNode>;

    /** The currently focused EventNode (receives keyboard events) */
    private _focusedNode: EventNode | null;

    /** The previously focused EventNode (for relatedTarget in focus events) */
    private _previousFocusedNode: EventNode | null;

    /** Active drag operation state */
    private _activeDrag: {
        sourceNode: EventNode;
        operation: UE.DragDropOperation | null;
        dataTransfer: any;
    } | null;

    /** Bound UE event callbacks keyed by widget, for cleanup */
    private _boundCallbacks: Map<UE.Widget, Map<string, Function>>;

    private constructor() {
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
    registerNode(widget: UE.Widget, umgWidget: any, parentNode: EventNode | null): EventNode | null {
        if (!widget) return null;

        // If already registered, return existing
        const existing = this._widgetToNode.get(widget);
        if (existing) return existing;

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
    unregisterNode(widget: UE.Widget): void {
        const node = this._widgetToNode.get(widget);
        if (!node) return;

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
    getNode(widget: UE.Widget): EventNode | null {
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
    updateHandlers(node: EventNode, props: any): void {
        if (!node || !props) return;

        const hadMouseHandlers = node.hasMouseHandlers();

        // Iterate all known event prop names INCLUDING capture variants.
        // The propagation engine invokes "onClickCapture" during the capturing
        // phase, so we must register those handlers on the node as well.
        for (const propName of ALL_EVENT_PROPS_WITH_CAPTURE) {
            const handler = props[propName];
            if (typeof handler === 'function') {
                node.setHandler(propName, handler);
            } else if (handler === null || handler === undefined) {
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
        } else if (hadMouseHandlers && !hasMouseHandlers) {
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
    dispatchMouseEvent(eventType: string, nativeEvent: UE.PointerEvent, targetNode: EventNode): void {
        if (!targetNode) return;

        // Create the appropriate synthetic event
        let syntheticEvent: SyntheticMouseEvent;
        if (eventType === 'wheel') {
            syntheticEvent = new SyntheticWheelEvent('wheel', nativeEvent);
        } else {
            syntheticEvent = new SyntheticMouseEvent(eventType, nativeEvent, !NON_BUBBLING_EVENTS.has(eventType));
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
    dispatchKeyboardEvent(eventType: string, nativeEvent: UE.KeyEvent, repeat: boolean = false): void {
        const targetNode = this._focusedNode;
        if (!targetNode) return;

        const syntheticEvent = new SyntheticKeyboardEvent(eventType, nativeEvent, repeat);
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
    dispatchFocusEvent(
        eventType: string,
        targetNode: EventNode,
        nativeEvent?: UE.FocusEvent,
        relatedNode?: EventNode
    ): void {
        if (!targetNode) return;

        const syntheticEvent = new SyntheticFocusEvent(
            eventType,
            nativeEvent ?? null,
            relatedNode?.umgWidget ?? null
        );
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
    dispatchDragEvent(
        eventType: string,
        nativePointerEvent: UE.PointerEvent,
        targetNode: EventNode,
        operation?: UE.DragDropOperation
    ): void {
        if (!targetNode) return;

        const syntheticEvent = new SyntheticDragEvent(eventType, nativePointerEvent, operation);
        syntheticEvent.target = targetNode.umgWidget;
        this._propagate(syntheticEvent, targetNode);
    }

    /**
     * Dispatches a touch event through the tree.
     */
    dispatchTouchEvent(
        eventType: string,
        nativeEvent: UE.PointerEvent,
        targetNode: EventNode
    ): void {
        if (!targetNode) return;

        const syntheticEvent = new SyntheticTouchEvent(eventType, nativeEvent, targetNode.umgWidget);
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
    setFocus(node: EventNode | null): void {
        const oldNode = this._focusedNode;
        if (oldNode === node) return; // No change

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
            } catch (e) {
                // SetKeyboardFocus may fail if widget is not in viewport yet
            }
        }
    }

    /** Returns the currently focused EventNode */
    getFocusedNode(): EventNode | null {
        return this._focusedNode;
    }

    /**
     * Attempts to move focus to the next focusable node in tree order.
     * Implements basic tab navigation.
     * 
     * @param reverse If true, moves focus backwards (Shift+Tab)
     */
    moveFocusNext(reverse: boolean = false): void {
        const allNodes = this._collectFocusableNodes();
        if (allNodes.length === 0) return;

        const currentIdx = this._focusedNode ? allNodes.indexOf(this._focusedNode) : -1;
        let nextIdx: number;

        if (reverse) {
            nextIdx = currentIdx <= 0 ? allNodes.length - 1 : currentIdx - 1;
        } else {
            nextIdx = currentIdx >= allNodes.length - 1 ? 0 : currentIdx + 1;
        }

        this.setFocus(allNodes[nextIdx]);
    }

    /* ------------------------------------------------------------------ */
    /*  Drag & Drop State                                                  */
    /* ------------------------------------------------------------------ */

    /** Start a drag operation from the given source node */
    startDrag(sourceNode: EventNode, operation: UE.DragDropOperation | null): void {
        this._activeDrag = {
            sourceNode,
            operation,
            dataTransfer: null,
        };
    }

    /** End the current drag operation */
    endDrag(): void {
        this._activeDrag = null;
    }

    /** Get the current active drag state */
    getActiveDrag(): { sourceNode: EventNode; operation: UE.DragDropOperation | null; dataTransfer: any } | null {
        return this._activeDrag;
    }

    /* ------------------------------------------------------------------ */
    /*  Cleanup                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Clears all registered nodes, handlers, and state. Called when the
     * React tree is unmounted / the widget is destroyed.
     */
    dispose(): void {
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
    static reset(): void {
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
    private _propagate(event: SyntheticEvent, targetNode: EventNode): void {
        const eventType = event.type;
        const propName = EVENT_TYPE_TO_PROP[eventType];
        if (!propName) return;

        // Non-bubbling events: dispatch only to target
        if (!event.bubbles) {
            event.eventPhase = EVENT_PHASE_AT_TARGET;
            event.currentTarget = targetNode.umgWidget;
            this._invokeHandler(targetNode, propName, event);
            return;
        }

        // Build the path from root to target
        const path = this._buildPath(targetNode);

        // --- Capturing phase (root -> target, exclusive of target) ---
        event.eventPhase = EVENT_PHASE_CAPTURING;
        const capturePropName = propName + 'Capture'; // e.g., "onClickCapture"
        for (let i = 0; i < path.length - 1; i++) {
            if (event.isPropagationStopped()) break;
            const node = path[i];
            event.currentTarget = node.umgWidget;
            this._invokeHandler(node, capturePropName, event);
        }

        // --- At target ---
        if (!event.isPropagationStopped()) {
            event.eventPhase = EVENT_PHASE_AT_TARGET;
            event.currentTarget = targetNode.umgWidget;
            // Fire both capture and bubble handler at target (DOM behavior)
            this._invokeHandler(targetNode, capturePropName, event);
            if (!event.isImmediatePropagationStopped()) {
                this._invokeHandler(targetNode, propName, event);
            }
        }

        // --- Bubbling phase (target.parent -> root) ---
        event.eventPhase = EVENT_PHASE_BUBBLING;
        for (let i = path.length - 2; i >= 0; i--) {
            if (event.isPropagationStopped()) break;
            const node = path[i];
            event.currentTarget = node.umgWidget;
            this._invokeHandler(node, propName, event);
        }
    }

    /**
     * Builds an ordered array from root to target by walking parent pointers.
     * Result: [root, ..., parent, target]
     */
    private _buildPath(targetNode: EventNode): EventNode[] {
        const path: EventNode[] = [];
        let current: EventNode | null = targetNode;
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
    private _invokeHandler(node: EventNode, propName: string, event: SyntheticEvent): void {
        const handler = node.getHandler(propName);
        if (!handler) return;

        try {
            handler(event);
        } catch (err) {
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
    private _ensureMouseEventBinding(node: EventNode): void {
        const widget = node.widget;
        if (!widget) return;

        // Skip if already bound
        if (this._boundCallbacks.has(widget)) return;

        const callbackMap = new Map<string, Function>();
        this._boundCallbacks.set(widget, callbackMap);

        // --- UE.Border: has single-bind delegates for mouse events ---
        if (widget instanceof UE.Border) {
            this._bindBorderMouseEvents(node, widget, callbackMap);
            return;
        }

        // --- UE.Button: already has multicast delegates, wire clicks through dispatcher ---
        if (widget instanceof UE.Button) {
            this._bindButtonEvents(node, widget, callbackMap);
            return;
        }

        // --- For all other widgets: create a transparent Border wrapper ---
        // This is the general-purpose approach for making arbitrary widgets
        // receive mouse events. We wrap the widget's content in a Border.
        // NOTE: This wrapping is done at the EventNode level and doesn't
        // affect the React tree structure.
        //
        // However, for most practical cases the widget IS already wrapped
        // in a Border (from ContainerConverter.setupBackground). If so,
        // we bind to that existing Border instead.
        const parentWidget = widget.GetParent?.();
        if (parentWidget instanceof UE.Border) {
            this._bindBorderMouseEvents(node, parentWidget as UE.Border, callbackMap);
            node.eventBorder = parentWidget as UE.Border;
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
    private _bindBorderMouseEvents(node: EventNode, border: UE.Border, callbackMap: Map<string, Function>): void {
        // MouseButtonDown -> dispatches "mousedown" and potentially "click"
        const onDown = (geometry: UE.Geometry, pointerEvent: UE.PointerEvent): UE.EventReply => {
            this.dispatchMouseEvent('mousedown', pointerEvent, node);

            // Right-click -> contextmenu
            try {
                const button = UE.WidgetBlueprintLibrary.PointerEvent_GetEffectingButton(pointerEvent);
                if (button?.KeyName === 'RightMouseButton') {
                    this.dispatchMouseEvent('contextmenu', pointerEvent, node);
                }
            } catch { /* ignore */ }

            return new UE.EventReply();
        };
        border.OnMouseButtonDownEvent.Bind(onDown);
        callbackMap.set('OnMouseButtonDownEvent', onDown);

        // MouseButtonUp -> dispatches "mouseup" and "click"
        const onUp = (geometry: UE.Geometry, pointerEvent: UE.PointerEvent): UE.EventReply => {
            this.dispatchMouseEvent('mouseup', pointerEvent, node);

            // Fire "click" on mouseup (matching DOM behavior for left-click)
            try {
                const button = UE.WidgetBlueprintLibrary.PointerEvent_GetEffectingButton(pointerEvent);
                if (!button || button.KeyName === 'LeftMouseButton') {
                    this.dispatchMouseEvent('click', pointerEvent, node);
                }
            } catch {
                // Fallback: always fire click on mouseup
                this.dispatchMouseEvent('click', pointerEvent, node);
            }

            return new UE.EventReply();
        };
        border.OnMouseButtonUpEvent.Bind(onUp);
        callbackMap.set('OnMouseButtonUpEvent', onUp);

        // MouseMove -> dispatches "mousemove"
        const onMove = (geometry: UE.Geometry, pointerEvent: UE.PointerEvent): UE.EventReply => {
            this.dispatchMouseEvent('mousemove', pointerEvent, node);
            return new UE.EventReply();
        };
        border.OnMouseMoveEvent.Bind(onMove);
        callbackMap.set('OnMouseMoveEvent', onMove);

        // DoubleClick -> dispatches "dblclick"
        const onDblClick = (geometry: UE.Geometry, pointerEvent: UE.PointerEvent): UE.EventReply => {
            this.dispatchMouseEvent('dblclick', pointerEvent, node);
            return new UE.EventReply();
        };
        border.OnMouseDoubleClickEvent.Bind(onDblClick);
        callbackMap.set('OnMouseDoubleClickEvent', onDblClick);
    }

    /**
     * Binds UE.Button multicast delegates to route through our dispatcher.
     * Buttons have their own event model (OnClicked, OnHovered, etc.) that
     * we translate into standard DOM-like events.
     */
    private _bindButtonEvents(node: EventNode, button: UE.Button, callbackMap: Map<string, Function>): void {
        // OnClicked -> "click"
        if (node.hasHandler('onClick')) {
            const onClick = () => {
                // Create a minimal synthetic mouse event (no native pointer event available)
                const synth = new SyntheticMouseEvent('click', null);
                synth.target = node.umgWidget;
                this._propagate(synth, node);
            };
            button.OnClicked.Add(onClick);
            callbackMap.set('OnClicked', onClick);
        }

        // OnPressed -> "mousedown"
        if (node.hasHandler('onMouseDown')) {
            const onDown = () => {
                const synth = new SyntheticMouseEvent('mousedown', null);
                synth.target = node.umgWidget;
                this._propagate(synth, node);
            };
            button.OnPressed.Add(onDown);
            callbackMap.set('OnPressed', onDown);
        }

        // OnReleased -> "mouseup"
        if (node.hasHandler('onMouseUp')) {
            const onUp = () => {
                const synth = new SyntheticMouseEvent('mouseup', null);
                synth.target = node.umgWidget;
                this._propagate(synth, node);
            };
            button.OnReleased.Add(onUp);
            callbackMap.set('OnReleased', onUp);
        }

        // OnHovered -> "mouseenter"
        if (node.hasHandler('onMouseEnter') || node.hasHandler('onMouseOver')) {
            const onHover = () => {
                const synth = new SyntheticMouseEvent('mouseenter', null, false);
                synth.target = node.umgWidget;
                this._propagate(synth, node);

                // Also fire mouseover (which DOES bubble)
                const synthOver = new SyntheticMouseEvent('mouseover', null, true);
                synthOver.target = node.umgWidget;
                this._propagate(synthOver, node);
            };
            button.OnHovered.Add(onHover);
            callbackMap.set('OnHovered', onHover);
        }

        // OnUnhovered -> "mouseleave"
        if (node.hasHandler('onMouseLeave') || node.hasHandler('onMouseOut')) {
            const onUnhover = () => {
                const synth = new SyntheticMouseEvent('mouseleave', null, false);
                synth.target = node.umgWidget;
                this._propagate(synth, node);

                // Also fire mouseout (which DOES bubble)
                const synthOut = new SyntheticMouseEvent('mouseout', null, true);
                synthOut.target = node.umgWidget;
                this._propagate(synthOut, node);
            };
            button.OnUnhovered.Add(onUnhover);
            callbackMap.set('OnUnhovered', onUnhover);
        }
    }

    /**
     * Unbinds mouse-specific UE events from a node.
     */
    private _unbindMouseEvents(node: EventNode): void {
        this._unbindAllWidgetEvents(node.widget);
        if (node.eventBorder) {
            this._unbindAllWidgetEvents(node.eventBorder);
            node.eventBorder = null;
        }
    }

    /**
     * Unbinds ALL UE event callbacks we've registered on a widget.
     */
    private _unbindAllWidgetEvents(widget: UE.Widget): void {
        const callbackMap = this._boundCallbacks.get(widget);
        if (!callbackMap) return;

        // For Border delegates, use Unbind()
        if (widget instanceof UE.Border) {
            const border = widget as UE.Border;
            try {
                if (callbackMap.has('OnMouseButtonDownEvent'))  border.OnMouseButtonDownEvent.Unbind();
                if (callbackMap.has('OnMouseButtonUpEvent'))    border.OnMouseButtonUpEvent.Unbind();
                if (callbackMap.has('OnMouseMoveEvent'))        border.OnMouseMoveEvent.Unbind();
                if (callbackMap.has('OnMouseDoubleClickEvent')) border.OnMouseDoubleClickEvent.Unbind();
            } catch { /* widget may already be destroyed */ }
        }

        // For Button multicast delegates, use Remove()
        if (widget instanceof UE.Button) {
            const button = widget as UE.Button;
            try {
                const clicked = callbackMap.get('OnClicked');
                if (clicked) button.OnClicked.Remove(clicked);

                const pressed = callbackMap.get('OnPressed');
                if (pressed) button.OnPressed.Remove(pressed);

                const released = callbackMap.get('OnReleased');
                if (released) button.OnReleased.Remove(released);

                const hovered = callbackMap.get('OnHovered');
                if (hovered) button.OnHovered.Remove(hovered);

                const unhovered = callbackMap.get('OnUnhovered');
                if (unhovered) button.OnUnhovered.Remove(unhovered);
            } catch { /* widget may already be destroyed */ }
        }

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
    private _collectFocusableNodes(): EventNode[] {
        const result: EventNode[] = [];

        // DFS through all nodes to collect focusable ones in tree order
        const visited = new Set<EventNode>();
        const roots: EventNode[] = [];

        // Find root nodes (nodes with no parent)
        for (const [, node] of this._widgetToNode) {
            if (!node.parent) {
                roots.push(node);
            }
        }

        const dfs = (node: EventNode) => {
            if (visited.has(node)) return;
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
    private _isNodeFocusable(node: EventNode): boolean {
        // Has keyboard or focus handlers -> focusable
        if (node.hasKeyboardHandlers()) return true;
        for (const prop of FOCUS_EVENT_PROPS) {
            if (node.hasHandler(prop)) return true;
        }

        // Native widget has bIsFocusable
        const widget = node.widget;
        if (!widget) return false;
        try {
            if ((widget as any).bIsFocusable === true) return true;
            if ((widget as any).IsFocusable === true) return true;
        } catch { /* */ }

        // Buttons and inputs are focusable by default
        if (widget instanceof UE.Button) return true;

        return false;
    }
}
