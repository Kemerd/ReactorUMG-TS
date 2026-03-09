/**
 * Widget Object Pool
 *
 * Reduces GC pressure and allocation cost by recycling UMG widget instances
 * instead of creating new ones for every React element. When a widget is
 * removed from the tree (detachDeletedInstance), it gets returned to a
 * per-type pool. The next createInstance call for the same type pulls from
 * the pool instead of calling `new UE.SomeWidget(outer)`.
 *
 * This is particularly effective for:
 *   - Virtual lists (ListView/TileView) where items scroll in/out rapidly
 *   - Dynamic UIs that frequently mount/unmount components
 *   - Any scenario with repeated create-destroy cycles of the same widget type
 *
 * Pool capacity is bounded per type to prevent unbounded memory growth.
 * Widgets that exceed the pool capacity are left for normal GC.
 *
 * Lifecycle:
 *   1. createInstance -> pool.acquire(type) -> returns cached widget or null
 *   2. If null, normal widget construction proceeds
 *   3. detachDeletedInstance -> pool.release(type, widget) -> caches for reuse
 *   4. ReactorUMG.release() -> pool.clear() -> all pooled widgets freed
 *
 * Safety:
 *   - Pooled widgets are detached from their parent via RemoveFromParent()
 *   - All children are removed before pooling (clean slate for reuse)
 *   - Pool only accepts widgets that are still valid UObject references
 */

import * as UE from 'ue';

/**
 * Set of widget type names that are eligible for pooling.
 * Only commonly-created, structurally-simple types should be pooled.
 * Complex widgets with extensive internal state (e.g., ComboBox, EditableText)
 * are excluded because resetting their state is error-prone.
 */
/**
 * Only widget types that go through UMGConverter (not ContainerConverter)
 * and have a matching predefined converter or NativeWidgetConverter are
 * safe for recycling.
 *
 * Excluded:
 *   - 'CanvasPanel' / 'WrapBox' — listed in UMGConverter.predefinedWidgets
 *     but have NO converter file, so require() would crash.
 *   - 'Overlay' — matched by containerKeywords → goes through
 *     ContainerConverter whose wrapper-widget setup can't be replayed
 *     via ensureReady alone.
 */
const POOLABLE_TYPES: ReadonlySet<string> = new Set([
    // Layout containers with NativeWidgetConverter fallback
    'HorizontalBox',
    'VerticalBox',

    // Common leaf widgets with predefined converters
    'TextBlock',
    'Image',
    'Border',
    'SizeBox',
    'ScaleBox',
    'Spacer',
]);

/**
 * Maximum number of widgets to retain per type.
 * Beyond this limit, excess widgets are abandoned to GC.
 * Tuned to balance memory overhead vs. allocation savings.
 */
const DEFAULT_MAX_POOL_SIZE = 16;

class WidgetPool {
    /**
     * Per-type LIFO stacks of recycled widget instances.
     * LIFO ordering means recently-used widgets are reused first,
     * which improves cache locality on the engine side.
     */
    private readonly pools: Map<string, UE.Widget[]> = new Map();

    /** Per-type maximum capacity (can be overridden per type) */
    private readonly maxSizes: Map<string, number> = new Map();

    /** Global default max pool size */
    private readonly defaultMaxSize: number;

    /** Running count of total acquires that hit the pool (cache hits) */
    private _cacheHits = 0;

    /** Running count of total acquires that missed (cache misses) */
    private _cacheMisses = 0;

    constructor(defaultMaxSize: number = DEFAULT_MAX_POOL_SIZE) {
        this.defaultMaxSize = defaultMaxSize;
    }

    /**
     * Attempt to acquire a recycled widget of the given type.
     *
     * Returns null if no pooled instance is available, in which case the
     * caller should construct a new widget normally. The returned widget
     * has been detached from any parent but may still have stale UPROPERTY
     * values – the caller is responsible for re-initializing it.
     *
     * @param typeName  The UMG widget class name (e.g., 'TextBlock')
     * @returns A recycled widget instance, or null if the pool is empty
     */
    acquire(typeName: string): UE.Widget | null {
        if (!POOLABLE_TYPES.has(typeName)) {
            this._cacheMisses++;
            return null;
        }

        const pool = this.pools.get(typeName);
        if (!pool || pool.length === 0) {
            this._cacheMisses++;
            return null;
        }

        const widget = pool.pop()!;
        this._cacheHits++;
        return widget;
    }

    /**
     * Return a widget to the pool for future reuse.
     *
     * The widget is detached from any parent and its children are stripped.
     * Returns false if the widget couldn't be pooled (type not eligible,
     * pool full, or invalid widget reference).
     *
     * @param typeName  The UMG widget class name
     * @param widget    The widget instance to recycle
     * @returns true if the widget was successfully pooled
     */
    release(typeName: string, widget: UE.Widget): boolean {
        if (!widget || !POOLABLE_TYPES.has(typeName)) {
            return false;
        }

        const maxSize = this.maxSizes.get(typeName) ?? this.defaultMaxSize;
        let pool = this.pools.get(typeName);

        if (!pool) {
            pool = [];
            this.pools.set(typeName, pool);
        }

        // Pool is at capacity – let this widget be GC'd normally
        if (pool.length >= maxSize) {
            return false;
        }

        // Detach from parent to break the native widget tree link
        try {
            widget.RemoveFromParent();
        } catch (_) {
            // Widget may already be detached; that's fine
        }

        // Strip children if this is a panel widget, so pooled widgets
        // don't hold references to child subtrees
        if (widget instanceof UE.PanelWidget) {
            const panel = widget as UE.PanelWidget;
            try {
                const childCount = panel.GetChildrenCount();
                for (let i = childCount - 1; i >= 0; i--) {
                    const child = panel.GetChildAt(i);
                    if (child) {
                        child.RemoveFromParent();
                    }
                }
            } catch (_) {
                // If child removal fails, the widget is in a bad state –
                // don't pool it
                return false;
            }
        }

        pool.push(widget);
        return true;
    }

    /**
     * Set the maximum pool size for a specific widget type.
     * Higher values retain more widgets in memory but improve reuse rates.
     *
     * @param typeName  The widget type name
     * @param maxSize   Maximum number of instances to retain
     */
    setMaxPoolSize(typeName: string, maxSize: number): void {
        this.maxSizes.set(typeName, Math.max(0, maxSize));
    }

    /**
     * Flush all pools, releasing every cached widget for GC.
     * Called during ReactorUMG.release() to prevent leaked references.
     */
    clear(): void {
        this.pools.clear();
        this._cacheHits = 0;
        this._cacheMisses = 0;
    }

    /**
     * Returns pool statistics for development profiling.
     */
    getStats(): { hits: number; misses: number; hitRate: number; pooledWidgets: number } {
        const total = this._cacheHits + this._cacheMisses;
        let pooledWidgets = 0;
        for (const pool of this.pools.values()) {
            pooledWidgets += pool.length;
        }

        return {
            hits: this._cacheHits,
            misses: this._cacheMisses,
            hitRate: total > 0 ? this._cacheHits / total : 0,
            pooledWidgets,
        };
    }

    /**
     * Returns the number of currently pooled widgets for a specific type.
     */
    getPoolSize(typeName: string): number {
        return this.pools.get(typeName)?.length ?? 0;
    }
}

/**
 * Singleton pool instance shared across the entire renderer.
 * Access via getWidgetPool() to guarantee single-instance semantics.
 */
let globalPool: WidgetPool | null = null;

/**
 * Get the global widget pool instance (creates on first access).
 */
export function getWidgetPool(): WidgetPool {
    if (!globalPool) {
        globalPool = new WidgetPool();
    }
    return globalPool;
}

/**
 * Destroy the global pool and release all cached widgets.
 * Called during full teardown (ReactorUMG.release).
 */
export function destroyWidgetPool(): void {
    if (globalPool) {
        globalPool.clear();
        globalPool = null;
    }
}

/**
 * Check whether a widget type name is eligible for pooling.
 */
export function isPoolableType(typeName: string): boolean {
    return POOLABLE_TYPES.has(typeName);
}
