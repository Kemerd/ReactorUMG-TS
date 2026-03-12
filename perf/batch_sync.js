"use strict";
/**
 * Batched Widget Property Synchronization
 *
 * UMG's SynchronizeProperties() is an expensive Slate-level rebuild that pushes
 * UPROPERTY values into the underlying Slate widget. During a single React
 * reconciliation commit, the same widget can be touched by:
 *   1. Common prop parsing (visibility, transform, opacity, etc.)
 *   2. Converter-specific update (font, color, background, etc.)
 *   3. Event handler sync
 *
 * Without batching, each step triggers a full SynchronizeProperties() call,
 * meaning a single widget might get synced 2-3 times per frame for one prop
 * change. For a list of 100 items, that's potentially 200-300 redundant
 * Slate rebuilds.
 *
 * This module provides a deduplicating queue that collects widget references
 * during a reconciliation pass, then flushes them in one batch via
 * resetAfterCommit. The Set data structure ensures each widget is synced
 * at most once per commit, regardless of how many code paths touch it.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────┐
 *   │  React Reconciler Commit Phase               │
 *   │  ┌──────────────┐  ┌──────────────────────┐ │
 *   │  │ commitUpdate  │  │ appendInitialChild   │ │
 *   │  │ calls update()│  │ calls appendChild()  │ │
 *   │  └──────┬───────┘  └──────────┬───────────┘ │
 *   │         │                      │             │
 *   │         ▼                      ▼             │
 *   │     queueWidgetSync(w)   queueSlotSync(s)   │
 *   │         │                      │             │
 *   │         ▼                      ▼             │
 *   │   ┌─────────────────────────────────┐        │
 *   │   │  pendingWidgets / pendingSlots  │        │
 *   │   │  (Set – auto-deduplicates)      │        │
 *   │   └─────────────────────────────────┘        │
 *   │                     │                         │
 *   │  resetAfterCommit   ▼                         │
 *   │              flushSyncQueue()                  │
 *   │    (calls SynchronizeWidgetProperties once     │
 *   │     per unique widget)                         │
 *   └─────────────────────────────────────────────┘
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueWidgetSync = queueWidgetSync;
exports.queueSlotSync = queueSlotSync;
exports.immediateWidgetSync = immediateWidgetSync;
exports.flushSyncQueue = flushSyncQueue;
exports.getSyncStats = getSyncStats;
exports.getPendingCount = getPendingCount;
exports.clearSyncQueue = clearSyncQueue;
const UE = require("ue");
/* ======================================================================
 *  Internal queues – use Set for O(1) dedup and O(n) iteration
 * ====================================================================== */
/** Widgets that need SynchronizeProperties called before next paint */
const pendingWidgets = new Set();
/** Panel slots that need SynchronizeProperties called before next paint */
const pendingSlots = new Set();
/**
 * Performance counter – tracks how many individual sync calls were
 * collapsed into each flush. Useful for profiling in dev builds.
 */
let _statsQueuedThisFrame = 0;
let _statsFlushedThisFrame = 0;
/* ======================================================================
 *  Public API
 * ====================================================================== */
/**
 * Queue a widget for batched property synchronization.
 *
 * Call this wherever you would normally call
 * `UE.UMGManager.SynchronizeWidgetProperties(widget)`.
 * The actual sync is deferred until flushSyncQueue() runs, which
 * happens once per reconciler commit in resetAfterCommit.
 *
 * Safe to call multiple times with the same widget – it will only
 * be synced once per flush cycle.
 *
 * @param widget  The UMG widget whose UPROPERTYs need syncing to Slate.
 *                Null/undefined values are silently ignored.
 */
function queueWidgetSync(widget) {
    if (!widget)
        return;
    pendingWidgets.add(widget);
    _statsQueuedThisFrame++;
}
/**
 * Queue a panel slot for batched layout synchronization.
 *
 * Same semantics as queueWidgetSync but for UPanelSlot subclasses
 * (CanvasPanelSlot, OverlaySlot, etc.).
 *
 * @param slot  The panel slot whose layout properties need syncing.
 */
function queueSlotSync(slot) {
    if (!slot)
        return;
    pendingSlots.add(slot);
}
/**
 * Immediately synchronize a widget without queueing.
 *
 * Use sparingly – only for cases where the Slate representation must be
 * up-to-date before the next line of code runs (e.g., querying geometry
 * right after a property change).
 *
 * @param widget  The widget to sync immediately.
 */
function immediateWidgetSync(widget) {
    if (!widget)
        return;
    // Remove from pending set to avoid double-syncing in the same frame
    pendingWidgets.delete(widget);
    UE.UMGManager.SynchronizeWidgetProperties(widget);
}
/**
 * Drain both the widget and slot sync queues.
 *
 * Iterates each unique widget/slot exactly once, calling
 * SynchronizeProperties on each. Designed to be called from the
 * reconciler's resetAfterCommit hook so all mutations from one
 * commit are batched into a single flush.
 *
 * Thread-safe from a JS perspective (single-threaded V8 engine).
 */
function flushSyncQueue() {
    _statsFlushedThisFrame = 0;
    // Drain widgets
    if (pendingWidgets.size > 0) {
        for (const widget of pendingWidgets) {
            // Guard against widgets that were garbage-collected or
            // removed between queueing and flushing
            if (widget) {
                UE.UMGManager.SynchronizeWidgetProperties(widget);
                _statsFlushedThisFrame++;
            }
        }
        pendingWidgets.clear();
    }
    // Drain slots
    if (pendingSlots.size > 0) {
        for (const slot of pendingSlots) {
            if (slot) {
                UE.UMGManager.SynchronizeSlotProperties(slot);
            }
        }
        pendingSlots.clear();
    }
    _statsQueuedThisFrame = 0;
}
/**
 * Returns performance statistics from the most recent flush cycle.
 * Useful for development profiling.
 *
 * @returns Object with `queued` (total calls before dedup) and
 *          `flushed` (actual sync calls made after dedup).
 */
function getSyncStats() {
    const savings = _statsQueuedThisFrame - _statsFlushedThisFrame;
    return {
        queued: _statsQueuedThisFrame,
        flushed: _statsFlushedThisFrame,
        savings: Math.max(0, savings),
    };
}
/**
 * Returns the current number of widgets waiting in the queue.
 * Useful for debugging to ensure the queue is draining properly.
 */
function getPendingCount() {
    return {
        widgets: pendingWidgets.size,
        slots: pendingSlots.size,
    };
}
/**
 * Forcefully clear all pending syncs without executing them.
 * Called during teardown (ReactorUMG.release) to prevent stale
 * references from being synced after the tree is destroyed.
 */
function clearSyncQueue() {
    pendingWidgets.clear();
    pendingSlots.clear();
    _statsQueuedThisFrame = 0;
    _statsFlushedThisFrame = 0;
}
//# sourceMappingURL=batch_sync.js.map