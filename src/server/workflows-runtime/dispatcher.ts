// BOOTSTRAP-PHASE3 Step 2 — workflow dispatcher (pure AsyncGenerator).
//
// Orchestration layer between the HTTP route and a concrete workflow.
// - Runs precondition sweep (throws before emitting any event).
// - Registers an AbortController so /workflows/runs/:batchId cancel works.
// - Delegates to workflow.run() and forwards every event.
// - Always deregisters the batch on finish (success, error, or abort).
//
// No SSE / HTTP framing here — route layer (Step 4) wraps with streamSSE.

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import {
  deregisterBatch,
  registerBatch,
} from "./abort-registry"
import {
  checkPreconditions,
  type PreconditionDeps,
  type PreconditionParams,
} from "./precondition-check"

export interface DispatchParams extends PreconditionParams {
  batchId: string
}

export interface DispatchDeps extends PreconditionDeps {
  /**
   * Optional externally-owned abort controller. Primarily useful so a route
   * handler can observe `c.req.raw.signal` and link it here. If omitted,
   * dispatcher creates a fresh controller.
   */
  controller?: AbortController
}

export async function* dispatch(
  params: DispatchParams,
  deps: DispatchDeps = {},
): AsyncGenerator<WorkflowEvent> {
  const pre = await checkPreconditions(params, deps)

  const controller = deps.controller ?? new AbortController()
  registerBatch(params.batchId, controller)

  try {
    const runParams = {
      profile: pre.profile,
      providerId: params.providerId,
      modelId: params.modelId,
      aspectRatio: params.aspectRatio,
      ...(params.language !== undefined ? { language: params.language } : {}),
      input: pre.parsedInput,
      abortSignal: controller.signal,
      batchId: params.batchId,
    }

    for await (const event of pre.workflow.run(runParams)) {
      yield event
      // If the workflow respects its own abort signal + emits aborted/complete,
      // we simply stop iterating once it does. Defensive early-exit if an
      // unresponsive workflow keeps yielding post-abort.
      if (controller.signal.aborted && event.type !== "aborted") {
        return
      }
    }
  } finally {
    deregisterBatch(params.batchId)
  }
}
