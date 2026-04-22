// BOOTSTRAP-PHASE3 Step 4 — /api/workflows/runs/:batchId cancel route.
//
// Tri-state per Session #12 Q2:
//   - running batch, abort succeeds    → 204 (no body)
//   - finished batch (any terminal)    → 409 BATCH_NOT_RUNNING + currentStatus
//   - unknown batchId                  → 404 BATCH_NOT_FOUND
// Distinguishing 404 from 409 lets the UI show a correct message
// ("already done" vs "never existed") instead of conflating.
//
// PLAN §6.4: resume NOT supported in v1.

import { Hono } from "hono"
import { getBatchRepo } from "@/server/asset-store/context"
import {
  abortBatch,
  isBatchActive,
} from "@/server/workflows-runtime/abort-registry"

export function createWorkflowRunsRoute(): Hono {
  const route = new Hono()

  route.delete("/:batchId", (c) => {
    const batchId = c.req.param("batchId")

    if (isBatchActive(batchId)) {
      // abortBatch returns false if the controller has already been aborted
      // (rare race — DELETE arrived after shutdown began but before dispatcher
      // deregistered). Accept the cancel request either way: 204 is correct.
      abortBatch(batchId)
      return c.body(null, 204)
    }

    const batch = getBatchRepo().findById(batchId)
    if (batch) {
      return c.json(
        { error: "BATCH_NOT_RUNNING", currentStatus: batch.status },
        409,
      )
    }

    return c.json({ error: "BATCH_NOT_FOUND" }, 404)
  })

  route.all("/:batchId/resume", (c) => {
    c.header("Resume", "not-supported")
    return c.json(
      { error: "RESUME_NOT_SUPPORTED", message: "Resume is not supported in v1 (PLAN §6.4)" },
      501,
    )
  })

  return route
}
