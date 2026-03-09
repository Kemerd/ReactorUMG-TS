import * as UE from 'ue';

// ============================================================================
// EventNode: Each UMGWidget with a native widget gets an EventNode that
// forms a tree mirroring the widget hierarchy. Events bubble up this tree
// following the W3C DOM event model (capture -> target -> bubble).
// ============================================================================

export interface EventNode {
    /** The native UE widget this node corresponds to */
    widget: UE.Widget;

    /** Back-reference to the UMGWidget wrapper (for accessing React props) */
    umgWidget: any;

    /** Parent in the event tree (null for root nodes) */
    parent: EventNode | null;

    /** Child event nodes */
    children: Set<EventNode>;

    /** Currently registered event handlers keyed by internal event name */
    handlers: Map<string, Function>;

    /** Whether this node can receive focus via tab navigation */
    focusable: boolean;

    /** Tab index for ordering (-1 = not tab-focusable, 0+ = explicit order) */
    tabIndex: number;
}

// ============================================================================
// React event prop -> internal event name mapping
// ============================================================================

const REACT_EVENT_PROPS: Record<string, string> = {
    onClick:        'click',
    onDoubleClick:  'dblclick',
    onMouseDown:    'mousedown',
    onMouseUp:      'mouseup',
    onMouseEnter:   'mouseenter',
    onMouseLeave:   'mouseleave',
    onMouseMove:    'mousemove',
    onKeyDown:      'keydown',
    onKeyUp:        'keyup',
    onKeyPress:     'keypress',
    onFocus:        'focus',
    onBlur:         'blur',
    onChange:        'change',
    onInput:        'input',
    onSubmit:       'submit',
    onScroll:       'scroll',
    onWheel:        'wheel',
    onDragStart:    'dragstart',
    onDrag:         'drag',
    onDragEnd:      'dragend',
    onDragEnter:    'dragenter',
    onDragLeave:    'dragleave',
    onDragOver:     'dragover',
    onDrop:         'drop',
    onPointerDown:  'pointerdown',
    onPointerUp:    'pointerup',
    onPointerMove:  'pointermove',
    onPointerEnter: 'pointerenter',
    onPointerLeave: 'pointerleave',
    onContextMenu:  'contextmenu',
    onTouchStart:   'touchstart',
    onTouchEnd:     'touchend',
    onTouchMove:    'touchmove',
};

// Build capture-phase prop variants (e.g. onClickCapture -> click)
const captureProps: Record<string, string> = {};
for (const [prop, eventName] of Object.entries(REACT_EVENT_PROPS)) {
    captureProps[prop + 'Capture'] = eventName;
}
Object.assign(REACT_EVENT_PROPS, captureProps);

// Events that do NOT bubble per W3C spec
const NON_BUBBLING_EVENTS = new Set([
    'focus', 'blur', 'mouseenter', 'mouseleave',
    'pointerenter', 'pointerleave', 'scroll',
]);

// ============================================================================
// Synthetic event object passed to React-style handlers
// ============================================================================

interface SyntheticEvent {
    type: string;
    target: any;
    currentTarget: any;
    nativeEvent: any;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    _propagationStopped: boolean;
    _immediatePropagationStopped: boolean;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
    preventDefault(): void;
}

function createSyntheticEvent(eventName: string, targetUmg: any, nativePayload: any): SyntheticEvent {
    return {
        type: eventName,
        target: targetUmg,
        currentTarget: null,
        nativeEvent: nativePayload,
        bubbles: !NON_BUBBLING_EVENTS.has(eventName),
        cancelable: true,
        defaultPrevented: false,
        _propagationStopped: false,
        _immediatePropagationStopped: false,
        stopPropagation() { this._propagationStopped = true; },
        stopImmediatePropagation() {
            this._immediatePropagationStopped = true;
            this._propagationStopped = true;
        },
        preventDefault() { this.defaultPrevented = true; },
    };
}

// ============================================================================
// EventDispatcher: Singleton that owns the event node tree and dispatch logic
// ============================================================================

export class EventDispatcher {
    private static instance: EventDispatcher | null = null;

    /** O(1) lookup from native widget -> EventNode */
    private nodes: Map<UE.Widget, EventNode> = new Map();

    /** Currently focused node for keyboard event routing */
    private focusedNode: EventNode | null = null;

    /** Focusable nodes maintained in insertion order for tab navigation */
    private focusableList: EventNode[] = [];

    static getInstance(): EventDispatcher {
        if (!EventDispatcher.instance) {
            EventDispatcher.instance = new EventDispatcher();
        }
        return EventDispatcher.instance;
    }

    static dispose(): void {
        if (EventDispatcher.instance) {
            EventDispatcher.instance.nodes.clear();
            EventDispatcher.instance.focusedNode = null;
            EventDispatcher.instance.focusableList.length = 0;
            EventDispatcher.instance = null;
        }
    }

    // -- Node management --

    getNode(widget: UE.Widget): EventNode | null {
        return this.nodes.get(widget) ?? null;
    }

    registerNode(node: EventNode): void {
        this.nodes.set(node.widget, node);
        if (node.focusable) {
            this.focusableList.push(node);
        }
    }

    unregisterNode(widget: UE.Widget): void {
        const node = this.nodes.get(widget);
        if (!node) return;

        // Unlink from parent
        if (node.parent) {
            node.parent.children.delete(node);
        }

        // Orphan children so they can be re-linked later if needed
        for (const child of node.children) {
            child.parent = null;
        }
        node.children.clear();

        // Remove from focusable list
        const idx = this.focusableList.indexOf(node);
        if (idx !== -1) {
            this.focusableList.splice(idx, 1);
        }

        // Clear focus if this node held it
        if (this.focusedNode === node) {
            this.focusedNode = null;
        }

        this.nodes.delete(widget);
    }

    // -- Event dispatch (capture -> target -> bubble) --

    dispatch(targetWidget: UE.Widget, eventName: string, nativePayload: any): void {
        const targetNode = this.nodes.get(targetWidget);
        if (!targetNode) return;

        // Build path from root to target
        const path: EventNode[] = [];
        let cur: EventNode | null = targetNode;
        while (cur) {
            path.unshift(cur);
            cur = cur.parent;
        }

        const event = createSyntheticEvent(eventName, targetNode.umgWidget, nativePayload);

        // Capture phase: root -> target (exclusive of target)
        for (let i = 0; i < path.length - 1; i++) {
            if (event._propagationStopped) break;
            const captureKey = eventName + '_capture';
            const handler = path[i].handlers.get(captureKey);
            if (handler) {
                event.currentTarget = path[i].umgWidget;
                try { handler(event); } catch (e) { console.error('[ReactorUMG] Capture handler error:', e); }
            }
        }

        // Target phase
        if (!event._propagationStopped) {
            const handler = targetNode.handlers.get(eventName);
            if (handler) {
                event.currentTarget = targetNode.umgWidget;
                try { handler(event); } catch (e) { console.error('[ReactorUMG] Target handler error:', e); }
            }
        }

        // Bubble phase: target parent -> root
        if (event.bubbles) {
            for (let i = path.length - 2; i >= 0; i--) {
                if (event._propagationStopped) break;
                const handler = path[i].handlers.get(eventName);
                if (handler) {
                    event.currentTarget = path[i].umgWidget;
                    try { handler(event); } catch (e) { console.error('[ReactorUMG] Bubble handler error:', e); }
                }
            }
        }
    }

    // -- Focus management --

    setFocus(node: EventNode | null): void {
        if (this.focusedNode === node) return;

        const prev = this.focusedNode;
        this.focusedNode = node;

        // Fire blur on old target, focus on new target
        if (prev) this.dispatch(prev.widget, 'blur', {});
        if (node) this.dispatch(node.widget, 'focus', {});
    }

    getFocusedNode(): EventNode | null {
        return this.focusedNode;
    }

    /**
     * Moves focus forward or backward through the focusable list.
     * Returns true if focus was moved so the caller can consume the event.
     */
    moveFocus(forward: boolean): boolean {
        if (this.focusableList.length === 0) return false;

        if (!this.focusedNode) {
            this.setFocus(forward
                ? this.focusableList[0]
                : this.focusableList[this.focusableList.length - 1]);
            return true;
        }

        const curIdx = this.focusableList.indexOf(this.focusedNode);
        if (curIdx === -1) {
            this.setFocus(this.focusableList[0]);
            return true;
        }

        // Wrap-around navigation
        const nextIdx = forward
            ? (curIdx + 1) % this.focusableList.length
            : (curIdx - 1 + this.focusableList.length) % this.focusableList.length;

        this.setFocus(this.focusableList[nextIdx]);
        return true;
    }
}

// ============================================================================
// Public API consumed by renderer.ts
// ============================================================================

/**
 * Returns true if the props object contains any React event handler props.
 */
export function hasEventHandlers(props: any): boolean {
    if (!props) return false;
    for (const key of Object.keys(props)) {
        if (key in REACT_EVENT_PROPS) return true;
    }
    return false;
}

/**
 * Creates an EventNode for a native widget and registers it with the
 * singleton dispatcher. Called from UMGWidget.init() once the native
 * widget has been created.
 */
export function createEventNode(
    widget: UE.Widget,
    umgWidget: any,
    parentNativeWidget: UE.Widget | null,
    props: any,
): EventNode {
    const dispatcher = EventDispatcher.getInstance();

    // Determine focusability from props
    const tabIndex = props?.tabIndex ?? -1;
    const focusable = tabIndex >= 0 || props?.autoFocus === true;

    // Resolve parent event node (may be null for the first render pass;
    // the parent link is fixed up in UMGWidget.appendChild)
    let parentNode: EventNode | null = null;
    if (parentNativeWidget) {
        parentNode = dispatcher.getNode(parentNativeWidget);
    }

    const node: EventNode = {
        widget,
        umgWidget,
        parent: parentNode,
        children: new Set(),
        handlers: new Map(),
        focusable,
        tabIndex,
    };

    // Link into the parent's children set
    if (parentNode) {
        parentNode.children.add(node);
    }

    // Extract event handlers from props
    syncEventHandlers(node, props);

    dispatcher.registerNode(node);

    // Honour autoFocus on mount
    if (props?.autoFocus) {
        dispatcher.setFocus(node);
    }

    return node;
}

/**
 * Removes an EventNode from the dispatcher.
 * Called from UMGWidget.dispose() before the native reference is released.
 */
export function destroyEventNode(widget: UE.Widget): void {
    EventDispatcher.getInstance().unregisterNode(widget);
}

/**
 * Re-syncs event handlers from the latest React props into an existing
 * EventNode. Called on every commitUpdate so handlers stay current without
 * tearing down and recreating the node.
 */
export function syncEventHandlers(node: EventNode, props: any): void {
    if (!node || !props) return;

    // Full re-extract is cheap (small constant set of keys) and avoids
    // diffing complexity for handler identity changes.
    node.handlers.clear();

    for (const [propName, eventName] of Object.entries(REACT_EVENT_PROPS)) {
        if (typeof props[propName] === 'function') {
            // Capture variants stored with a '_capture' suffix
            const key = propName.endsWith('Capture')
                ? eventName + '_capture'
                : eventName;
            node.handlers.set(key, props[propName]);
        }
    }

    // Keep focusability in sync
    const tabIndex = props?.tabIndex ?? -1;
    node.focusable = tabIndex >= 0 || props?.autoFocus === true;
    node.tabIndex = tabIndex;
}

/**
 * Tears down the entire event system. Called when the React tree is
 * unmounted via ReactorUMG.release().
 */
export function disposeEventSystem(): void {
    EventDispatcher.dispose();
}

/**
 * Routes a keyboard event from the C++/PuerTS bridge into the React
 * event system. The event is dispatched to the currently focused node.
 *
 * @param eventType "keydown" or "keyup"
 * @param keyEvent  The native UE KeyEvent (or any payload)
 * @param repeat    Whether this is an auto-repeat press
 */
export function routeKeyboardEvent(eventType: string, keyEvent: any, repeat: boolean = false): void {
    const dispatcher = EventDispatcher.getInstance();
    const focused = dispatcher.getFocusedNode();
    if (!focused) return;

    dispatcher.dispatch(focused.widget, eventType, {
        nativeKeyEvent: keyEvent,
        key: keyEvent?.GetKey?.()?.KeyName ?? '',
        repeat,
    });
}

/**
 * Routes a Tab key press for focus navigation.
 * Returns true if focus was moved (the caller should consume the event).
 *
 * @param shiftHeld True for Shift+Tab (reverse navigation)
 */
export function routeTabNavigation(shiftHeld: boolean): boolean {
    return EventDispatcher.getInstance().moveFocus(!shiftHeld);
}
