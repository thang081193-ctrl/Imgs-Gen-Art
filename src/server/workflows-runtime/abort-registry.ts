// BOOTSTRAP-PHASE3 Step 2 — in-flight batch → AbortController index.
//
// When a workflow starts, dispatcher calls registerBatch(); when the
// route handler sees client disconnect or DELETE /workflows/runs/:batchId,
// it calls abortBatch(). Dispatcher deregisters on completion so memory
// doesn't leak.
//
// Module-level Map — batches are server-process scoped (no persistence).
// Restart wipes in-flight state, which is acceptable for a local single-user
// tool (no resume per PLAN §6.4).

const registry = new Map<string, AbortController>()

export function registerBatch(batchId: string, controller: AbortController): void {
  if (registry.has(batchId)) {
    throw new Error(`abort-registry: batchId '${batchId}' already registered`)
  }
  registry.set(batchId, controller)
}

/**
 * Aborts the controller associated with `batchId` if found.
 * Returns true on successful abort, false if batch is unknown or already
 * aborted. Callers map false → HTTP 404.
 */
export function abortBatch(batchId: string): boolean {
  const controller = registry.get(batchId)
  if (!controller) return false
  if (controller.signal.aborted) return false
  controller.abort()
  return true
}

export function deregisterBatch(batchId: string): void {
  registry.delete(batchId)
}

export function isBatchActive(batchId: string): boolean {
  return registry.has(batchId)
}

/** Test-only: wipe all entries between cases. */
export function _resetAbortRegistryForTests(): void {
  registry.clear()
}
