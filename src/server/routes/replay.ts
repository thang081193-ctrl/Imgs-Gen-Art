// Phase 5 Step 1 (Session #25) — /api/assets/:assetId/replay + /replay-class.
//
// POST /replay      — starts a replay batch, streams WorkflowEvent SSE.
// GET  /replay-class — lightweight precondition probe for the UI (Q2 button
//                      label "Replay (exact/approximate) · $X.XX" vs hidden
//                      for not_replayable). Same preconditions as POST but
//                      returns JSON instead of running the provider.
//
// Session #27a — body.mode === "edit" wired: overridePayload parsed strictly
// by OverridePayloadSchema; any unrecognized key is lifted from Zod's
// generic BAD_REQUEST to a field-named EDIT_FIELD_NOT_ALLOWED 400.
// Capability gate (CAPABILITY_NOT_SUPPORTED) + legacy source rejection
// (LEGACY_PAYLOAD_NOT_EDITABLE) live in replay-service.ts.
//
// SSE framing mirrors src/server/routes/workflows.ts:53-110 — pump the first
// generator event BEFORE entering streamSSE so precondition errors surface
// as real HTTP statuses (400/401/404), not SSE error frames.
//
// Mount: must register on /api/assets BEFORE createAssetsRoute() in app.ts
// so GET /:assetId/replay-class wins over the base GET /:id handler. Hono
// matches sub-apps in registration order.

import { Hono, type Context } from "hono"
import { streamSSE } from "hono/streaming"
import { ZodError } from "zod"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import {
  BadRequestError,
  EditFieldNotAllowedError,
} from "@/core/shared/errors"
import { shortId } from "@/core/shared/id"
import { probeReplayClass } from "@/server/workflows-runtime/replay-probe"
import { executeReplay } from "@/server/workflows-runtime/replay-service"

import { ReplayBodySchema, type ReplayBody } from "./replay.body"

export function createReplayRoute(): Hono {
  const route = new Hono()

  route.get("/:assetId/replay-class", (c) => {
    const assetId = c.req.param("assetId")
    // Session #26 fold-in: probe returns a discriminated union so the UI can
    // render "disabled button + tooltip-per-reason" for not_replayable rather
    // than getting back a 400 with a generic message. Replayable path still
    // runs all preconditions (400 data-integrity / 401 no-key / 404).
    const probe = probeReplayClass(assetId)
    if (probe.kind === "not_replayable") {
      return c.json({
        assetId,
        replayClass: "not_replayable" as const,
        reason: probe.reason,
        providerId: probe.providerId,
        modelId: probe.modelId,
        workflowId: probe.workflowId,
      })
    }
    return c.json({
      assetId,
      replayClass: probe.replayClass,
      providerId: probe.providerId,
      modelId: probe.modelId,
      estimatedCostUsd: probe.estimatedCostUsd,
      workflowId: probe.workflowId,
    })
  })

  route.post("/:assetId/replay", async (c) => {
    const assetId = c.req.param("assetId")
    const body = parseReplayBody(await readJsonBody(c))

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
      ...(body.overridePayload !== undefined
        ? { overridePayload: body.overridePayload }
        : {}),
    })

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

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw new BadRequestError("Invalid JSON body")
  }
}

function parseReplayBody(raw: unknown): ReplayBody {
  const result = ReplayBodySchema.safeParse(raw)
  if (result.success) return result.data
  // OverridePayloadSchema is strict — unknown keys come through as
  // "unrecognized_keys" issues. Lift the first such key into a field-named
  // EDIT_FIELD_NOT_ALLOWED so the client gets an actionable 400 with the
  // exact offending field. Other issues (missing overridePayload on edit,
  // bad type, refine rejections) stay as standard 400 BAD_REQUEST with
  // Zod issues attached.
  const unrecognized = result.error.issues.find(
    (i) => i.code === "unrecognized_keys",
  )
  if (unrecognized && "keys" in unrecognized && Array.isArray(unrecognized.keys) && unrecognized.keys.length > 0) {
    throw new EditFieldNotAllowedError(String(unrecognized.keys[0]))
  }
  throw new ZodError(result.error.issues)
}
