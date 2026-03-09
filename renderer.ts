import * as Reconciler from 'react-reconciler';
import * as puerts from 'puerts';
import * as UE from 'ue';
import { createElementConverter, ElementConverter } from './converter';
import {
    createEventNode,
    destroyEventNode,
    syncEventHandlers,
    hasEventHandlers,
    disposeEventSystem,
    routeKeyboardEvent,
    routeTabNavigation,
    EventDispatcher,
} from './events';
import { flushSyncQueue, clearSyncQueue } from './perf/batch_sync';
import { getWidgetPool, destroyWidgetPool, isPoolableType } from './perf/widget_pool';

const REACT_ELEMENT_TYPE = typeof Symbol === 'function' ? Symbol.for('react.element') : 0;

function isReactElement(value: any) {
    return value && typeof value === 'object' && value.$$typeof === REACT_ELEMENT_TYPE;
}

function isPlainObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeComparableChildren(value: any): any[] {
    if (value === undefined || value === null) {
        return [];
    }
    const arrayified = Array.isArray(value) ? value : [value];
    return arrayified.filter((item) => !isReactElement(item));
}

/**
 * Compares two values for deep equality.
 *
 * Mirrors the semantics used by findChangedProps so React props trigger updates
 * only when a meaningful difference is detected.
 */
function deepEquals(x: any, y: any) {
    const seen = new WeakMap<object, WeakSet<object>>();
    const hasOwn = Object.prototype.hasOwnProperty;

    const equals = (left: any, right: any): boolean => {
        if (left === right) {
            return true;
        }

        // functions always considered different to force updates
        if (typeof left === 'function' || typeof right === 'function') {
            return false;
        }

        if (left === null || right === null || left === undefined || right === undefined) {
            return left === right;
        }

        if (Array.isArray(left) && Array.isArray(right)) {
            if (left.length !== right.length) {
                return false;
            }
            for (let i = 0; i < left.length; i++) {
                if (!equals(left[i], right[i])) {
                    return false;
                }
            }
            return true;
        }

        if (isPlainObject(left) && isPlainObject(right)) {
            let set = seen.get(left);
            if (!set) {
                set = new WeakSet<object>();
                seen.set(left, set);
            }
            if (set.has(right)) {
                return true; // already compared this pair
            }
            set.add(right);

            const leftKeys = Object.keys(left);
            const rightKeys = Object.keys(right);
            let normalizedLeftChildren: any[] | undefined;
            let normalizedRightChildren: any[] | undefined;

            for (const key of leftKeys) {
                if (key.startsWith('_') || key.startsWith('$$')) {
                    continue;
                }
                if (key === 'children') {
                    normalizedLeftChildren ??= normalizeComparableChildren(left[key]);
                    normalizedRightChildren ??= normalizeComparableChildren(right[key]);
                    if (normalizedLeftChildren.length !== normalizedRightChildren.length) {
                        return false;
                    }
                    for (let i = 0; i < normalizedLeftChildren.length; i++) {
                        if (!equals(normalizedLeftChildren[i], normalizedRightChildren[i])) {
                            return false;
                        }
                    }
                    continue;
                }

                if (!hasOwn.call(right, key)) {
                    return false;
                }

                if (!equals(left[key], right[key])) {
                    return false;
                }
            }

            for (const key of rightKeys) {
                if (key.startsWith('_') || key.startsWith('$$')) {
                    continue;
                }
                if (!hasOwn.call(left, key)) {
                    if (key === 'children') {
                        normalizedRightChildren ??= normalizeComparableChildren(right[key]);
                        return normalizedRightChildren.length === 0;
                    }
                    return false;
                }

                if (key === 'children' && normalizedLeftChildren === undefined) {
                    normalizedLeftChildren = normalizeComparableChildren(left[key]);
                    normalizedRightChildren = normalizeComparableChildren(right[key]);
                    if (normalizedLeftChildren.length !== normalizedRightChildren.length) {
                        return false;
                    }
                    for (let i = 0; i < normalizedLeftChildren.length; i++) {
                        if (!equals(normalizedLeftChildren[i], normalizedRightChildren[i])) {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        return false;
    };

    return equals(x, y);
}

class UMGWidget {
    native: UE.Widget;
    typeName: string;
    props: any;
    rootContainer: RootContainer;
    converter: ElementConverter;
    parentFiber: any;
    parentProps: any;

    /** Reference to the parent UMGWidget for event tree traversal */
    parentUMGWidget: UMGWidget | null;

    /**
     * Ordered list of child UMGWidgets managed by this node.
     * Kept in sync with the native UMG widget tree so that insertBefore
     * can reconstruct child order without a native "insert at index" API.
     */
    children: UMGWidget[] = [];

    /** Event node reference for cleanup (managed by event dispatcher) */
    private _eventNode: any;

    constructor(typeName: string, props: any, rootContainer: RootContainer, parentFiber?: any) {
        this.typeName = typeName;
        this.rootContainer = rootContainer;
        this.parentFiber = parentFiber;
        this.parentProps = this.getParentProps();
        this.parentUMGWidget = null;
        this._eventNode = null;
        this.props = { ...props, __parentProps: this.parentProps };
        this.init();
    }

    init() {
        try {
            const WidgetTreeOuter = this.rootContainer.widgetTree;
            this.converter = createElementConverter(this.typeName, this.props, WidgetTreeOuter);

            // Attempt to acquire a recycled widget from the pool before
            // constructing a fresh one. Pool hits avoid UObject allocation
            // and reduce GC pressure during rapid mount/unmount cycles.
            const pool = getWidgetPool();
            const recycled = pool.acquire(this.typeName);
            if (recycled) {
                this.native = recycled;
                // Re-apply all props to the recycled widget so it reflects
                // the current element's desired state
                this.converter.updateWidget(this.native, {}, this.props);
            } else {
                this.native = this.converter.createWidget();
            }

            const shouldIgnore = (this.converter as any)?.ignore === true;
            if (this.native === null && !shouldIgnore) {
                console.warn("Not supported widget: " + this.typeName);
            }

            // Register with the event system if we have a native widget
            if (this.native) {
                this._registerEventNode();
            }
        } catch(e) {
            console.error("Failed to create widget: " + this.typeName + ", error: " + e);
            console.error(e.stack);
        }
    }

    /**
     * Registers this widget with the event dispatcher, creating an EventNode
     * and syncing any event handlers found in the props.
     */
    private _registerEventNode() {
        // Find the parent native widget for event tree linking
        const parentNative = this.parentUMGWidget?.native ?? null;
        this._eventNode = createEventNode(this.native, this, parentNative, this.props);
    }

    update(oldProps: any, newProps: any) {
        // Allow converters that produce no native widget (e.g. <style>) to still
        // receive prop updates by checking canUpdateWithoutNative().
        if (this.native !== null || this.converter.canUpdateWithoutNative()) {
            // Snapshot visibility before the update so we can detect
            // Collapsed -> visible transitions for lazy slot completion
            const wasCollapsed = this.native
                ? this.native.Visibility === UE.ESlateVisibility.Collapsed
                : false;

            this.props = { ...newProps, __parentProps: this.parentProps };
            this.converter.updateWidget(this.native, oldProps, newProps);

            // Sync event handlers whenever props change
            if (this._eventNode) {
                syncEventHandlers(this._eventNode, newProps);
            }

            // When a widget transitions from Collapsed to any visible state,
            // the parent converter may have deferred its slot configuration
            // at mount time.  Trigger the deferred setup now so alignment,
            // padding, sizing, and gap are applied correctly.
            if (wasCollapsed && this.native
                && this.native.Visibility !== UE.ESlateVisibility.Collapsed) {
                this._completeDeferredParentSlot();
            }
        }
    }

    /**
     * Asks the parent container converter to complete any deferred slot
     * configuration for this widget.  Called when visibility transitions
     * from Collapsed to a visible state.
     */
    private _completeDeferredParentSlot(): void {
        if (!this.parentUMGWidget?.converter || !this.native) return;

        const parentConverter = this.parentUMGWidget.converter;
        if (typeof (parentConverter as any).completeDeferredSlotSetup === 'function') {
            (parentConverter as any).completeDeferredSlotSetup(
                this.parentUMGWidget.native, this.native
            );
        }
    }

    /**
     * Determines whether a child should be appended to the native widget tree.
     * Some converters (e.g. <option>) set forceAppend to indicate they should
     * participate in appendChild even when they have no native widget.
     */
    private shouldAppendNative(child: UMGWidget): boolean {
        const shouldForceAppend = (child.converter as any)?.forceAppend === true;
        return (shouldForceAppend && this.native && !!child)
            || (this.native && !!child && !!child.native);
    }

    appendChild(child: UMGWidget) {
        // Track the child in our ordered list
        this.children.push(child);

        // Set parent reference for event tree traversal
        child.parentUMGWidget = this;

        // If the child's event node was created before it had a parent,
        // re-link it now that the parent relationship is established
        if (child._eventNode && this._eventNode) {
            const dispatcher = EventDispatcher.getInstance();
            const childNode = dispatcher.getNode(child.native);
            if (childNode && !childNode.parent) {
                const parentNode = dispatcher.getNode(this.native);
                if (parentNode) {
                    childNode.parent = parentNode;
                    parentNode.children.add(childNode);
                }
            }
        }

        if (this.shouldAppendNative(child)) {
            this.converter.appendChild(this.native, child.native, child.typeName, child.props);
        }
    }

    removeChild(child: UMGWidget) {
        // Remove from our ordered tracking
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
        }

        // Clear parent reference
        child.parentUMGWidget = null;

        if (this.shouldAppendNative(child)) {
            this.converter.removeChild(this.native, child.native);
        }
    }

    /**
     * Inserts `child` immediately before `beforeChild` in this widget's child list.
     *
     * UMG panels do not expose an "insert at index" API, so we remove all
     * children from the insertion point onward, append the new child, then
     * re-append the displaced siblings. The converter's appendChild recreates
     * each slot with the correct alignment/padding/sizing from the child's
     * stored props, keeping the rebuild transparent.
     */
    insertBefore(child: UMGWidget, beforeChild: UMGWidget) {
        if (!this.native) return;

        const beforeIdx = this.children.indexOf(beforeChild);
        if (beforeIdx === -1) {
            // beforeChild not found -- fall back to a plain append
            this.appendChild(child);
            return;
        }

        // Set parent reference for event tree traversal
        child.parentUMGWidget = this;

        // If the child is already one of our children (move case), untrack it first
        const existingIdx = this.children.indexOf(child);
        if (existingIdx !== -1) {
            this.children.splice(existingIdx, 1);
            // Also detach from native parent so we can re-add in the right spot
            if (child.native) {
                child.native.RemoveFromParent();
            }
        }

        // Recalculate insertion index after potential removal shifted indices
        const insertIdx = this.children.indexOf(beforeChild);
        this.children.splice(insertIdx, 0, child);

        // Collect the children that come AFTER the newly inserted child
        // (i.e. the original beforeChild and everything after it)
        const displacedStart = insertIdx + 1;
        const displaced = this.children.slice(displacedStart);

        // Detach displaced siblings from the native tree
        for (let i = displaced.length - 1; i >= 0; i--) {
            if (displaced[i].native) {
                displaced[i].native.RemoveFromParent();
            }
        }

        // Append the new child at what is now the tail of the native panel
        if (this.shouldAppendNative(child)) {
            this.converter.appendChild(this.native, child.native, child.typeName, child.props);
        }

        // Re-append every displaced sibling so slot config is recreated from props
        for (const c of displaced) {
            if (this.shouldAppendNative(c)) {
                this.converter.appendChild(this.native, c.native, c.typeName, c.props);
            }
        }
    }

    /**
     * Recursively disposes this widget and all tracked children.
     * Called by the reconciler's detachDeletedInstance after the widget has
     * already been removed from the native tree.  Releases references so the
     * GC can reclaim UObject pointers promptly.
     */
    dispose() {
        // Unregister from the event system before destroying the widget
        if (this.native) {
            destroyEventNode(this.native);
        }
        this._eventNode = null;

        // Let the converter clean up any non-widget resources (e.g. inline style registrations)
        if (this.converter) {
            this.converter.dispose();
            this.converter = null;
        }

        // Recursively dispose every child subtree we still track
        for (const child of this.children) {
            child.dispose();
        }
        this.children.length = 0;

        // Clear parent reference
        this.parentUMGWidget = null;

        // Attempt to return the native widget to the pool for future reuse
        // instead of letting it be garbage collected. Only structurally simple
        // widget types are eligible for pooling.
        if (this.native && isPoolableType(this.typeName)) {
            const pooled = getWidgetPool().release(this.typeName, this.native);
            if (pooled) {
                // Widget is now in the pool – clear our reference but
                // the pool holds a strong ref for future reuse
                this.native = null;
                return;
            }
        }

        // Widget wasn't pooled – null out reference for GC
        this.native = null;
    }

    private getParentProps() {
        if (this.parentFiber) {
            const memoizedProps = (this.parentFiber as any).memoizedProps ?? (this.parentFiber as any).memorizedProps;
            if (memoizedProps) {
                return memoizedProps;
            }
        }

        return {};
    }
}

class RootContainer {
    public widgetTree: UE.WidgetTree;
    public reconcilerContainer: any;

    /** Top-level children attached to the widget tree root. */
    public children: UMGWidget[] = [];

    constructor(nativePtr: UE.WidgetTree) {
        this.widgetTree = nativePtr;
    }

    appendChild(child: UMGWidget) {
        this.children.push(child);
        if (child?.native) {
            UE.UMGManager.AddRootWidgetToWidgetTree(this.widgetTree, child.native);
        }
    }

    removeChild(child: UMGWidget) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
        }
        if (child?.native) {
            UE.UMGManager.RemoveRootWidgetFromWidgetTree(this.widgetTree, child.native);
        }
    }

    /**
     * Inserts a child before another in the root container.
     * Root containers typically hold a single child, so this falls back
     * to a simple append for pragmatic correctness.
     */
    insertBefore(child: UMGWidget, _beforeChild: UMGWidget) {
        this.appendChild(child);
    }

    clearAllWidgets() {
        this.widgetTree.RootWidget = null;
        this.children.length = 0;
    }
}

const hostConfig : Reconciler.HostConfig<string, any, RootContainer, UMGWidget, UMGWidget, any, any, {}, any, any, any, any, any> = {
    getRootHostContext () { return {}; },
    //CanvasPanel()的parentHostContext是getRootHostContext返回值; 累加父元素class以便后代样式解析
    getChildHostContext (parentHostContext: any, _type: string, props: any) {
        return {};
    },
    appendInitialChild (parent: UMGWidget, child: UMGWidget) { parent.appendChild(child); },
    appendChildToContainer (container: RootContainer, child: UMGWidget) { container.appendChild(child); },
    appendChild (parent: UMGWidget, child: UMGWidget) { parent.appendChild(child); },
    createInstance (type: string, props: any, rootContainer: RootContainer, hostContext: any, internalHandle: Reconciler.OpaqueHandle) { 
        return new UMGWidget(type, props, rootContainer, internalHandle.return ?? null);
    },
    createTextInstance (text: string, rootContainer: RootContainer, hostContext: any, internalHandle: Reconciler.OpaqueHandle) {
        return new UMGWidget("text", {text: text, _children_text_instance: true}, rootContainer, internalHandle.return ?? null);
    },
    finalizeInitialChildren () { return false; },
    getPublicInstance (instance: UMGWidget) { return instance.native; },
    prepareForCommit(containerInfo: RootContainer): any {},
    resetAfterCommit (container: RootContainer) {
        // Drain the batched property sync queue. All widgets/slots touched
        // during this commit get a single SynchronizeProperties() call here,
        // eliminating the 2-3x redundant calls that happen per widget when
        // common props, converter-specific props, and events are each synced
        // independently.
        flushSyncQueue();
    },
    resetTextContent (instance: UMGWidget) { },
    shouldSetTextContent (type, props) {
        const textContainers = new Set([
            'text','span','p', 'textarea', 'label', 'a','h1','h2','h3','h4','h5','h6'
        ]);
        const children = props && props.children;
        return textContainers.has(type) && (typeof children === 'string' || typeof children === 'number');
    },
    commitTextUpdate (textInstance: UMGWidget, oldText: string, newText: string) {
        if (textInstance != null && oldText != newText) {
            textInstance.update({}, {text: newText})
        }
    },
  
    prepareUpdate (instance: UMGWidget, type: string, oldProps: any, newProps: any) {
        try{
            return !deepEquals(oldProps, newProps);
        } catch(e) {
            console.error(e.message);
            return true;
        }
    },

    commitUpdate (instance: UMGWidget, updatePayload: any, type : string, oldProps : any, newProps: any) {
        try{
            instance.update(oldProps, newProps);
        } catch(e) {
            console.error("commitUpdate fail!, " + e + "\n" + e.stack);
        }
    },

    removeChildFromContainer (container: RootContainer, child: UMGWidget) { container.removeChild(child); },

    removeChild(parent: UMGWidget, child: UMGWidget) {
        parent.removeChild(child);
    },

    // -- Insertion ordering (required for keyed list reordering) --
    insertBefore(parent: UMGWidget, child: UMGWidget, beforeChild: UMGWidget) {
        parent.insertBefore(child, beforeChild);
    },

    insertInContainerBefore(container: RootContainer, child: UMGWidget, beforeChild: UMGWidget) {
        container.insertBefore(child, beforeChild);
    },

    clearContainer(container: RootContainer) {
        container.clearAllWidgets();
    },
    getCurrentEventPriority(){ return 0; },
    getInstanceFromNode(node: any){ return undefined; },
    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    prepareScopeUpdate(scopeInstance: any, instance: any) {},
    getInstanceFromScope(scopeInstance: any) { return null; },
    detachDeletedInstance(node: UMGWidget) {
        // Called by the reconciler after a node is permanently removed.
        // Dispose converter resources and release native UObject references.
        if (node && typeof node.dispose === 'function') {
            node.dispose();
        }
    },

    supportsMutation: true,
    isPrimaryRenderer: true,
    supportsPersistence: false,
    supportsHydration: false,
    noTimeout: undefined,
    preparePortalMount() {},
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout
    //useSyncScheduling: true,
    // scheduleDeferredCallback: undefined,
    // shouldDeprioritizeSubtree: undefined,
    // setTimeout: undefined,
    // clearTimeout: undefined,
    // cancelDeferredCallback: undefined,
}

const reconciler = Reconciler(hostConfig);

export const ReactorUMG = {
    
    render: function(inWidgetTree: UE.WidgetTree, reactElement: React.ReactNode) {
        if (inWidgetTree == undefined) {
            throw new Error("init with ReactorUIWidget first!");
        }
        const root = new RootContainer(inWidgetTree);
        const container = reconciler.createContainer(root, 0, null, false, false, "", null, null);
        root.reconcilerContainer = container;
        reconciler.updateContainer(reactElement, container, null, null);
        return root;
    },
    release: function(root: RootContainer) {
        reconciler.updateContainer(null, root.reconcilerContainer, null, null);
        // Tear down the event system when the React tree is unmounted
        disposeEventSystem();
        // Clear pending syncs to prevent stale widget references from
        // being synced after the tree is destroyed
        clearSyncQueue();
        // Release all pooled widgets back to GC
        destroyWidgetPool();
    },

    /**
     * Routes a keyboard event from the C++/PuerTS bridge into the React
     * event system. Call this from the ReactorUIWidget's OnKeyDown/OnKeyUp
     * overrides (or from a PuerTS bridge callback).
     * 
     * @param eventType "keydown" or "keyup"
     * @param keyEvent  The native UE.KeyEvent
     * @param repeat    Whether this is a repeated key press
     */
    routeKeyEvent: function(eventType: string, keyEvent: UE.KeyEvent, repeat: boolean = false) {
        routeKeyboardEvent(eventType, keyEvent, repeat);
    },

    /**
     * Routes a Tab key press for focus navigation. Returns true if focus was
     * moved, allowing the caller to consume the event.
     * 
     * @param shiftHeld True if Shift+Tab (reverse navigation)
     */
    routeTabKey: function(shiftHeld: boolean): boolean {
        return routeTabNavigation(shiftHeld);
    }
}
