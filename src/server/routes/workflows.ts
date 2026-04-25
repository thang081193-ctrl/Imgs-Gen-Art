// BOOTSTRAP-PHASE3 Step 4 — /api/workflows routes.
//
// GET /             — list registered workflow metadata (read-only catalog).
// POST /:id/run     — start a batch; streams WorkflowEvent payloads as SSE.
//
// Abort wiring (3 layers, per Session #12 bonus A):
//   client disconnect → c.req.raw.signal → local AbortController (passed to
//   dispatcher) → workflow.run's abortSignal → provider.generate abortSignal.
// DELETE /runs/:batchId (workflow-runs.ts) aborts the same registered
// controller via abort-registry → same chain.
//
// SSE framing per Session #12 Q1: pure `streamSSE` — no Retry-After, no
// event-id (resume not supported in v1 per PLAN §6.4).
//
// Precondition errors (400/401/404/409 from checkPreconditions) MUST surface
// as real HTTP statuses, not SSE error frames — Hono's `streamSSE` sets
// `text/event-stream` + 200 the moment the handler returns, so we pump the
// dispatcher's first event BEFORE entering streamSSE. If precondition throws,
// errorHandler middleware runs normally; only on success do headers flip.

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { shortId } from "@/core/shared/id"
import { validateBody } from "@/server/middleware/validator"
import { dispatch } from "@/server/workflows-runtime/dispatcher"
import { ALL_WORKFLOWS } from "@/workflows"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { WorkflowRunBodySchema, type WorkflowRunBody } from "./workflows.body"

// Typed Variables so `c.get("validatedBody")` resolves to the parsed body
// without a runtime cast. validator middleware sets the key; this type
// declares the shape the handler reads.
type WorkflowsEnv = { Variables: { validatedBody: WorkflowRunBody } }

export function createWorkflowsRoute(): Hono<WorkflowsEnv> {
  const route = new Hono<WorkflowsEnv>()

  route.get("/", (c) => {
    const workflows = ALL_WORKFLOWS.map((w) => ({
      id: w.id,
      displayName: w.displayName,
      description: w.description,
      colorVariant: w.colorVariant,
      requirement: {
        required: [...w.requirement.required],
        preferred: [...w.requirement.preferred],
      },
      compatibilityOverrides: [...w.compatibilityOverrides],
    }))
    return c.json({ workflows })
  })

  route.post("/:id/run", validateBody(WorkflowRunBodySchema), async (c) => {
    const workflowId = c.req.param("id")
    const body = c.get("validatedBody")
    const batchId = shortId("batch", 10)

    const controller = new AbortController()
    const onClientAbort = (): void => {
      if (!controller.signal.aborted) controller.abort()
    }
    c.req.raw.signal.addEventListener("abort", onClientAbort)
    // Defensive: if the request was already aborted by the time we attached
    // the listener (rare in prod, possible in tight tests), the event never
    // fires — trigger once up-front so the controller mirrors state.
    if (c.req.raw.signal.aborted) onClientAbort()

    const generator = dispatch(
      {
        workflowId,
        profileId: body.profileId,
        providerId: body.providerId,
        modelId: body.modelId,
        aspectRatio: body.aspectRatio,
        ...(body.language !== undefined ? { language: body.language } : {}),
        input: body.input,
        batchId,
        ...(body.policyOverrides !== undefined
          ? { policyOverrides: body.policyOverrides }
          : {}),
      },
      { controller },
    )

    // Pump first event. Throws on precondition failure → errorHandler maps
    // to 400/401/404/409. Once this resolves successfully, we're committed
    // to SSE framing: headers will be text/event-stream + 200.
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
