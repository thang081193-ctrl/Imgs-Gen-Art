// Phase 5 Step 1 (Session #25) — /api/assets/:assetId/replay + /replay-class.
//
// POST /replay      — starts a replay batch, streams WorkflowEvent SSE.
// GET  /replay-class — lightweight precondition probe for the UI (Q2 button
//                      label "Replay (exact/approximate) · $X.XX" vs hidden
//                      for not_replayable). Same preconditions as POST but
//                      returns JSON instead of running the provider.
//
// SSE framing mirrors src/server/routes/workflows.ts:53-110 — pump the first
// generator event BEFORE entering streamSSE so precondition errors surface
// as real HTTP statuses (400/401/404), not SSE error frames.
//
// Mount: must register on /api/assets BEFORE createAssetsRoute() in app.ts
// so GET /:assetId/replay-class wins over the base GET /:id handler. Hono
// matches sub-apps in registration order.

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { shortId } from "@/core/shared/id"
import { validateBody } from "@/server/middleware/validator"
import {
  executeReplay,
  loadReplayContext,
} from "@/server/workflows-runtime/replay-service"

import { ReplayBodySchema, type ReplayBody } from "./replay.body"

type ReplayEnv = { Variables: { validatedBody: ReplayBody } }

export function createReplayRoute(): Hono<ReplayEnv> {
  const route = new Hono<ReplayEnv>()

  route.get("/:assetId/replay-class", (c) => {
    const assetId = c.req.param("assetId")
    // loadReplayContext runs ALL 4 preconditions (asset exists, payload
    // present, class != not_replayable, active key). Any failure bubbles
    // as a typed error → errorHandler → proper HTTP status. On success
    // return a tiny probe payload the UI can use for button state + cost.
    const ctx = loadReplayContext(assetId)
    return c.json({
      assetId: ctx.sourceAsset.id,
      replayClass: ctx.sourceAsset.replayClass,
      providerId: ctx.payload.providerId,
      modelId: ctx.payload.modelId,
      estimatedCostUsd: ctx.model.costPerImageUsd,
      workflowId: ctx.sourceAsset.workflowId,
    })
  })

  route.post("/:assetId/replay", validateBody(ReplayBodySchema), async (c) => {
    const assetId = c.req.param("assetId")
    const body = c.get("validatedBody")

    if (body.mode === "edit") {
      return c.json(
        {
          error: "NOT_IMPLEMENTED",
          message:
            "mode='edit' is reserved for a follow-up step — canonical payload migration required first",
        },
        501,
      )
    }

    const newBatchId = shortId("batch", 10)
    const controller = new AbortController()
    const onClientAbort = (): void => {
      if (!controller.signal.aborted) controller.abort()
    }
    c.req.raw.signal.addEventListener("abort", onClientAbort)
    if (c.req.raw.signal.aborted) onClientAbort()

    const generator = executeReplay({
      assetId,
      newBatchId,
      abortSignal: controller.signal,
    })

    // Pump first event. Throws on precondition failure → errorHandler maps
    // to 400/401/404. Once this resolves successfully, we're committed to
    // SSE framing: headers will be text/event-stream + 200.
    let first: IteratorResult<WorkflowEvent>
    try {
      first = await generator.next()
    } catch (err) {
      c.req.raw.signal.removeEventListener("abort", onClientAbort)
      throw err
    }

    return streamSSE(c, async (stream) => {
      try {
        if (!first.done) {
          await stream.writeSSE({
            event: first.value.type,
            data: JSON.stringify(first.value),
          })
        }
        for await (const event of generator) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })
        }
      } finally {
        c.req.raw.signal.removeEventListener("abort", onClientAbort)
      }
    })
  })

  return route
}
