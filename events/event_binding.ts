/**
 * ============================================================================
 * ReactorUMG Event Binding Helpers
 * ============================================================================
 * 
 * Utility functions for binding UE widget events to the ReactorUMG event
 * dispatcher. These are called from the renderer when widgets are created
 * or updated, connecting UE's native event system to our DOM-like
 * bubbling/capturing model.
 * 
 * Also handles keyboard/touch/drag event routing from the top-level
 * ReactorUIWidget down to individual React component nodes.
 * ============================================================================
 */

import * as UE from 'ue';
import { EventDispatcher, EventNode, ALL_EVENT_PROPS, ALL_EVENT_PROPS_WITH_CAPTURE } from './event_dispatcher';

/* ------------------------------------------------------------------ */
/*  Public API: called from renderer.ts and converter.ts               */
/* ------------------------------------------------------------------ */

/**
 * Extracts event handler functions from React props and registers them
 * with the EventDispatcher on the given node. Call this whenever a
 * widget is created or its props are updated.
 * 
 * @param node  The EventNode associated with the widget
 * @param props The React props (may contain onClick, onKeyDown, etc.)
 */
export function syncEventHandlers(node: EventNode, props: any): void {
    if (!node || !props) return;
    const dispatcher = EventDispatcher.getInstance();
    dispatcher.updateHandlers(node, props);
}

/**
 * Checks whether the given React props contain any event handler functions.
 * Used to determine if a widget needs event infrastructure.
 * 
 * @param props The React props to check
 * @returns True if any event handler prop is present
 */
export function hasEventHandlers(props: any): boolean {
    if (!props) return false;
    // Check both base and capture variants in a single pass
    for (const propName of ALL_EVENT_PROPS_WITH_CAPTURE) {
        if (typeof props[propName] === 'function') return true;
    }
    return false;
}

/**
 * Creates an EventNode for a widget and registers it with the dispatcher.
 * Automatically links the node to its parent in the event tree.
 * 
 * @param widget       The native UE.Widget
 * @param umgWidget    The UMGWidget wrapper from the reconciler
 * @param parentWidget The parent UE.Widget (used to find parent EventNode)
 * @param props        The React props with event handlers
 * @returns The created EventNode, or null if widget is null
 */
export function createEventNode(
    widget: UE.Widget,
    umgWidget: any,
    parentWidget: UE.Widget | null,
    props: any
): EventNode | null {
    if (!widget) return null;

    const dispatcher = EventDispatcher.getInstance();

    // Find parent EventNode from the parent widget
    let parentNode: EventNode | null = null;
    if (parentWidget) {
        parentNode = dispatcher.getNode(parentWidget);
    }

    // Register and link the node
    const node = dispatcher.registerNode(widget, umgWidget, parentNode);
    if (!node) return null;

    // Sync event handlers from props
    if (props) {
        syncEventHandlers(node, props);
    }

    return node;
}

/**
 * Removes a widget's EventNode from the dispatcher. Call this when a
 * widget is being destroyed or removed from the tree.
 * 
 * @param widget The native UE.Widget being removed
 */
export function destroyEventNode(widget: UE.Widget): void {
    if (!widget) return;
    const dispatcher = EventDispatcher.getInstance();
    dispatcher.unregisterNode(widget);
}

/**
 * Updates the parent link of an EventNode when a widget is moved in the tree.
 * 
 * @param widget          The widget being moved
 * @param newParentWidget The new parent widget
 */
export function reparentEventNode(widget: UE.Widget, newParentWidget: UE.Widget | null): void {
    if (!widget) return;
    const dispatcher = EventDispatcher.getInstance();
    const node = dispatcher.getNode(widget);
    if (!node) return;

    // Unlink from old parent
    if (node.parent) {
        node.parent.children.delete(node);
    }

    // Link to new parent
    if (newParentWidget) {
        const newParent = dispatcher.getNode(newParentWidget);
        node.parent = newParent;
        if (newParent) {
            newParent.children.add(node);
        }
    } else {
        node.parent = null;
    }
}

/* ------------------------------------------------------------------ */
/*  Keyboard Event Routing                                             */
/* ------------------------------------------------------------------ */

/**
 * Routes a keyboard event from the top-level ReactorUIWidget into the
 * event dispatcher. This should be called from the C++ side when
 * OnKeyDown/OnKeyUp is fired on the UserWidget.
 * 
 * In PuerTS, the ReactorUIWidget can override these virtual methods
 * and call into TypeScript. This function handles the TS side.
 * 
 * @param eventType "keydown" or "keyup"
 * @param keyEvent  The native UE.KeyEvent
 * @param repeat    Whether this is a repeat event
 */
export function routeKeyboardEvent(eventType: string, keyEvent: UE.KeyEvent, repeat: boolean = false): void {
    const dispatcher = EventDispatcher.getInstance();
    dispatcher.dispatchKeyboardEvent(eventType, keyEvent, repeat);
}

/**
 * Routes a tab key press for focus navigation.
 * Returns true if the tab was handled (focus moved), false otherwise.
 * 
 * @param shiftHeld Whether Shift is held (reverse tab)
 */
export function routeTabNavigation(shiftHeld: boolean): boolean {
    const dispatcher = EventDispatcher.getInstance();
    const focusedNode = dispatcher.getFocusedNode();

    // Only handle tab if there's an active focus context
    dispatcher.moveFocusNext(shiftHeld);
    return dispatcher.getFocusedNode() !== focusedNode;
}

/* ------------------------------------------------------------------ */
/*  Touch Event Routing                                                */
/* ------------------------------------------------------------------ */

/**
 * Routes a touch event from UE into the event dispatcher.
 * Called from the UserWidget's OnTouchStarted/OnTouchMoved/OnTouchEnded.
 * 
 * @param eventType     "touchstart", "touchmove", "touchend", or "touchcancel"
 * @param pointerEvent  The native UE.PointerEvent
 * @param targetWidget  The widget that the touch event targets
 */
export function routeTouchEvent(
    eventType: string,
    pointerEvent: UE.PointerEvent,
    targetWidget: UE.Widget
): void {
    const dispatcher = EventDispatcher.getInstance();
    const targetNode = dispatcher.getNode(targetWidget);
    if (targetNode) {
        dispatcher.dispatchTouchEvent(eventType, pointerEvent, targetNode);
    }
}

/* ------------------------------------------------------------------ */
/*  Drag & Drop Routing                                                */
/* ------------------------------------------------------------------ */

/**
 * Routes a UE drag-detected event into the event dispatcher.
 * Called when OnDragDetected fires on a widget.
 * 
 * @param sourceWidget   The widget where the drag started
 * @param pointerEvent   The pointer event that triggered the drag
 * @param operation      The UE.DragDropOperation to use
 */
export function routeDragStart(
    sourceWidget: UE.Widget,
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const sourceNode = dispatcher.getNode(sourceWidget);
    if (!sourceNode) return;

    dispatcher.startDrag(sourceNode, operation);
    dispatcher.dispatchDragEvent('dragstart', pointerEvent, sourceNode, operation);
}

/**
 * Routes a drag-over event when the drag is hovering over a widget.
 */
export function routeDragOver(
    targetWidget: UE.Widget,
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const targetNode = dispatcher.getNode(targetWidget);
    if (targetNode) {
        dispatcher.dispatchDragEvent('dragover', pointerEvent, targetNode, operation);
    }
}

/**
 * Routes a drag-enter event when the drag enters a widget's bounds.
 */
export function routeDragEnter(
    targetWidget: UE.Widget,
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const targetNode = dispatcher.getNode(targetWidget);
    if (targetNode) {
        dispatcher.dispatchDragEvent('dragenter', pointerEvent, targetNode, operation);
    }
}

/**
 * Routes a drag-leave event when the drag leaves a widget's bounds.
 */
export function routeDragLeave(
    targetWidget: UE.Widget,
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const targetNode = dispatcher.getNode(targetWidget);
    if (targetNode) {
        dispatcher.dispatchDragEvent('dragleave', pointerEvent, targetNode, operation);
    }
}

/**
 * Routes a drop event when something is dropped on a widget.
 */
export function routeDrop(
    targetWidget: UE.Widget,
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const targetNode = dispatcher.getNode(targetWidget);
    if (targetNode) {
        dispatcher.dispatchDragEvent('drop', pointerEvent, targetNode, operation);
    }

    // End the drag operation
    const dragState = dispatcher.getActiveDrag();
    if (dragState) {
        dispatcher.dispatchDragEvent('dragend', pointerEvent, dragState.sourceNode, operation);
        dispatcher.endDrag();
    }
}

/**
 * Routes a drag-cancelled event.
 */
export function routeDragCancelled(
    pointerEvent: UE.PointerEvent,
    operation: UE.DragDropOperation | null
): void {
    const dispatcher = EventDispatcher.getInstance();
    const dragState = dispatcher.getActiveDrag();
    if (dragState) {
        dispatcher.dispatchDragEvent('dragend', pointerEvent, dragState.sourceNode, operation);
        dispatcher.endDrag();
    }
}

/* ------------------------------------------------------------------ */
/*  Focus Helpers (called from renderer or user code)                  */
/* ------------------------------------------------------------------ */

/**
 * Programmatically sets focus to a specific widget's EventNode.
 * 
 * @param widget The UE.Widget to focus
 */
export function focusWidget(widget: UE.Widget): void {
    const dispatcher = EventDispatcher.getInstance();
    const node = dispatcher.getNode(widget);
    dispatcher.setFocus(node);
}

/**
 * Clears focus from all widgets.
 */
export function blurAll(): void {
    const dispatcher = EventDispatcher.getInstance();
    dispatcher.setFocus(null);
}

/**
 * Disposes the entire event system. Call on widget destruction.
 */
export function disposeEventSystem(): void {
    EventDispatcher.reset();
}
