"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactorUMG = void 0;
const Reconciler = require("react-reconciler");
const UE = require("ue");
const converter_1 = require("./converter");
const events_1 = require("./events");
const batch_sync_1 = require("./perf/batch_sync");
const widget_pool_1 = require("./perf/widget_pool");
const REACT_ELEMENT_TYPE = typeof Symbol === 'function' ? Symbol.for('react.element') : 0;
function isReactElement(value) {
    return value && typeof value === 'object' && value.$$typeof === REACT_ELEMENT_TYPE;
}
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function normalizeComparableChildren(value) {
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
function deepEquals(x, y) {
    const seen = new WeakMap();
    const hasOwn = Object.prototype.hasOwnProperty;
    const equals = (left, right) => {
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
                set = new WeakSet();
                seen.set(left, set);
            }
            if (set.has(right)) {
                return true; // already compared this pair
            }
            set.add(right);
            const leftKeys = Object.keys(left);
            const rightKeys = Object.keys(right);
            let normalizedLeftChildren;
            let normalizedRightChildren;
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
    native;
    typeName;
    props;
    rootContainer;
    converter;
    parentFiber;
    parentProps;
    /** Reference to the parent UMGWidget for event tree traversal */
    parentUMGWidget;
    /**
     * Ordered list of child UMGWidgets managed by this node.
     * Kept in sync with the native UMG widget tree so that insertBefore
     * can reconstruct child order without a native "insert at index" API.
     */
    children = [];
    /** Event node reference for cleanup (managed by event dispatcher) */
    _eventNode;
    constructor(typeName, props, rootContainer, parentFiber) {
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
            this.converter = (0, converter_1.createElementConverter)(this.typeName, this.props, WidgetTreeOuter);
            // Attempt to acquire a recycled widget from the pool before
            // constructing a fresh one. Pool hits avoid UObject allocation
            // and reduce GC pressure during rapid mount/unmount cycles.
            const pool = (0, widget_pool_1.getWidgetPool)();
            const recycled = pool.acquire(this.typeName);
            if (recycled) {
                this.native = recycled;
                // The converter's proxy chain is created lazily inside
                // createNativeWidget. Since we skip that for recycled
                // widgets, ensureReady initialises the proxy so update()
                // can delegate to type-specific property logic.
                this.converter.ensureReady();
                // Re-apply all props to the recycled widget so it reflects
                // the current element's desired state
                this.converter.updateWidget(this.native, {}, this.props);
            }
            else {
                this.native = this.converter.createWidget();
            }
            const shouldIgnore = this.converter?.ignore === true;
            if (this.native === null && !shouldIgnore) {
                console.warn("Not supported widget: " + this.typeName);
            }
            // Register with the event system if we have a native widget
            if (this.native) {
                this._registerEventNode();
            }
        }
        catch (e) {
            console.error("Failed to create widget: " + this.typeName + ", error: " + e);
            console.error(e.stack);
        }
    }
    /**
     * Registers this widget with the event dispatcher, creating an EventNode
     * and syncing any event handlers found in the props.
     */
    _registerEventNode() {
        // Find the parent native widget for event tree linking
        const parentNative = this.parentUMGWidget?.native ?? null;
        this._eventNode = (0, events_1.createEventNode)(this.native, this, parentNative, this.props);
    }
    update(oldProps, newProps) {
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
                (0, events_1.syncEventHandlers)(this._eventNode, newProps);
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
    _completeDeferredParentSlot() {
        if (!this.parentUMGWidget?.converter || !this.native)
            return;
        const parentConverter = this.parentUMGWidget.converter;
        if (typeof parentConverter.completeDeferredSlotSetup === 'function') {
            parentConverter.completeDeferredSlotSetup(this.parentUMGWidget.native, this.native);
        }
    }
    /**
     * Determines whether a child should be appended to the native widget tree.
     * Some converters (e.g. <option>) set forceAppend to indicate they should
     * participate in appendChild even when they have no native widget.
     */
    shouldAppendNative(child) {
        const shouldForceAppend = child.converter?.forceAppend === true;
        return (shouldForceAppend && this.native && !!child)
            || (this.native && !!child && !!child.native);
    }
    appendChild(child) {
        // Track the child in our ordered list
        this.children.push(child);
        // Inject structural pseudo-class metadata so :first-child, :last-child,
        // :nth-child() selectors can be evaluated by the style resolver.
        const childIndex = this.children.length - 1;
        child.props.__childIndex = childIndex;
        child.props.__childCount = this.children.length;
        // Update sibling counts when a new child is added (previous children
        // need their __childCount updated for :last-child to work correctly)
        for (let i = 0; i < this.children.length - 1; i++) {
            if (this.children[i].props) {
                this.children[i].props.__childCount = this.children.length;
            }
        }
        // Set parent reference for event tree traversal
        child.parentUMGWidget = this;
        // If the child's event node was created before it had a parent,
        // re-link it now that the parent relationship is established
        if (child._eventNode && this._eventNode) {
            const dispatcher = events_1.EventDispatcher.getInstance();
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
    removeChild(child) {
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
    insertBefore(child, beforeChild) {
        if (!this.native)
            return;
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
            (0, events_1.destroyEventNode)(this.native);
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
        if (this.native && (0, widget_pool_1.isPoolableType)(this.typeName)) {
            const pooled = (0, widget_pool_1.getWidgetPool)().release(this.typeName, this.native);
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
    getParentProps() {
        if (this.parentFiber) {
            const memoizedProps = this.parentFiber.memoizedProps ?? this.parentFiber.memorizedProps;
            if (memoizedProps) {
                return memoizedProps;
            }
        }
        return {};
    }
}
class RootContainer {
    widgetTree;
    reconcilerContainer;
    /** Top-level children attached to the widget tree root. */
    children = [];
    constructor(nativePtr) {
        this.widgetTree = nativePtr;
    }
    appendChild(child) {
        this.children.push(child);
        if (child?.native) {
            UE.UMGManager.AddRootWidgetToWidgetTree(this.widgetTree, child.native);
        }
    }
    removeChild(child) {
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
    insertBefore(child, _beforeChild) {
        this.appendChild(child);
    }
    clearAllWidgets() {
        this.widgetTree.RootWidget = null;
        this.children.length = 0;
    }
}
const hostConfig = {
    getRootHostContext() { return {}; },
    //CanvasPanel()的parentHostContext是getRootHostContext返回值; 累加父元素class以便后代样式解析
    getChildHostContext(parentHostContext, _type, props) {
        return {};
    },
    appendInitialChild(parent, child) { parent.appendChild(child); },
    appendChildToContainer(container, child) { container.appendChild(child); },
    appendChild(parent, child) { parent.appendChild(child); },
    createInstance(type, props, rootContainer, hostContext, internalHandle) {
        return new UMGWidget(type, props, rootContainer, internalHandle.return ?? null);
    },
    createTextInstance(text, rootContainer, hostContext, internalHandle) {
        return new UMGWidget("text", { text: text, _children_text_instance: true }, rootContainer, internalHandle.return ?? null);
    },
    finalizeInitialChildren() { return false; },
    getPublicInstance(instance) { return instance.native; },
    prepareForCommit(containerInfo) { },
    resetAfterCommit(container) {
        // Drain the batched property sync queue. All widgets/slots touched
        // during this commit get a single SynchronizeProperties() call here,
        // eliminating the 2-3x redundant calls that happen per widget when
        // common props, converter-specific props, and events are each synced
        // independently.
        (0, batch_sync_1.flushSyncQueue)();
    },
    resetTextContent(instance) { },
    shouldSetTextContent(type, props) {
        const textContainers = new Set([
            'text', 'span', 'p', 'textarea', 'label', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
        ]);
        const children = props && props.children;
        return textContainers.has(type) && (typeof children === 'string' || typeof children === 'number');
    },
    commitTextUpdate(textInstance, oldText, newText) {
        if (textInstance != null && oldText != newText) {
            textInstance.update({}, { text: newText });
        }
    },
    prepareUpdate(instance, type, oldProps, newProps) {
        try {
            return !deepEquals(oldProps, newProps);
        }
        catch (e) {
            console.error(e.message);
            return true;
        }
    },
    commitUpdate(instance, updatePayload, type, oldProps, newProps) {
        try {
            instance.update(oldProps, newProps);
        }
        catch (e) {
            console.error("commitUpdate fail!, " + e + "\n" + e.stack);
        }
    },
    removeChildFromContainer(container, child) { container.removeChild(child); },
    removeChild(parent, child) {
        parent.removeChild(child);
    },
    // -- Insertion ordering (required for keyed list reordering) --
    insertBefore(parent, child, beforeChild) {
        parent.insertBefore(child, beforeChild);
    },
    insertInContainerBefore(container, child, beforeChild) {
        container.insertBefore(child, beforeChild);
    },
    clearContainer(container) {
        container.clearAllWidgets();
    },
    getCurrentEventPriority() { return 0; },
    getInstanceFromNode(node) { return undefined; },
    beforeActiveInstanceBlur() { },
    afterActiveInstanceBlur() { },
    prepareScopeUpdate(scopeInstance, instance) { },
    getInstanceFromScope(scopeInstance) { return null; },
    detachDeletedInstance(node) {
        // Called by the reconciler after a node is permanently removed.
        // Dispose converter resources and release native UObject references.
        if (node && typeof node.dispose === 'function') {
            node.dispose();
        }
    },
    // -- Suspense visibility hooks --
    // React Suspense uses these to temporarily hide content while a
    // fallback is being displayed.  Without them, children behind a
    // Suspense boundary remain visible when they should be hidden.
    hideInstance(instance) {
        if (instance?.native) {
            instance.native.SetVisibility(UE.ESlateVisibility.Collapsed);
        }
    },
    hideTextInstance(textInstance) {
        if (textInstance?.native) {
            textInstance.native.SetVisibility(UE.ESlateVisibility.Collapsed);
        }
    },
    unhideInstance(instance, props) {
        if (instance?.native) {
            // Restore visibility from the element's props; default to Visible
            const styles = props?.style;
            const vis = styles?.visibility ?? styles?.visible;
            if (vis === 'hidden') {
                instance.native.SetVisibility(UE.ESlateVisibility.Hidden);
            }
            else if (vis === 'collapse' || vis === 'collapsed') {
                instance.native.SetVisibility(UE.ESlateVisibility.Collapsed);
            }
            else {
                instance.native.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
            }
        }
    },
    unhideTextInstance(textInstance, _text) {
        if (textInstance?.native) {
            textInstance.native.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
        }
    },
    supportsMutation: true,
    isPrimaryRenderer: true,
    supportsPersistence: false,
    supportsHydration: false,
    noTimeout: undefined,
    preparePortalMount() { },
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout
    //useSyncScheduling: true,
    // scheduleDeferredCallback: undefined,
    // shouldDeprioritizeSubtree: undefined,
    // setTimeout: undefined,
    // clearTimeout: undefined,
    // cancelDeferredCallback: undefined,
};
const reconciler = Reconciler(hostConfig);
exports.ReactorUMG = {
    render: function (inWidgetTree, reactElement) {
        if (inWidgetTree == undefined) {
            throw new Error("init with ReactorUIWidget first!");
        }
        const root = new RootContainer(inWidgetTree);
        const container = reconciler.createContainer(root, 0, null, false, false, "", null, null);
        root.reconcilerContainer = container;
        reconciler.updateContainer(reactElement, container, null, null);
        return root;
    },
    release: function (root) {
        reconciler.updateContainer(null, root.reconcilerContainer, null, null);
        // Tear down the event system when the React tree is unmounted
        (0, events_1.disposeEventSystem)();
        // Clear pending syncs to prevent stale widget references from
        // being synced after the tree is destroyed
        (0, batch_sync_1.clearSyncQueue)();
        // Release all pooled widgets back to GC
        (0, widget_pool_1.destroyWidgetPool)();
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
    routeKeyEvent: function (eventType, keyEvent, repeat = false) {
        (0, events_1.routeKeyboardEvent)(eventType, keyEvent, repeat);
    },
    /**
     * Routes a Tab key press for focus navigation. Returns true if focus was
     * moved, allowing the caller to consume the event.
     *
     * @param shiftHeld True if Shift+Tab (reverse navigation)
     */
    routeTabKey: function (shiftHeld) {
        return (0, events_1.routeTabNavigation)(shiftHeld);
    }
};
//# sourceMappingURL=renderer.js.map