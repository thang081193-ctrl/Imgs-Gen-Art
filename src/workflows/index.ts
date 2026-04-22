// Registry for all 4 workflows. Session #15 (Step 7) finalizes the roster —
// ad-production, style-transform, aso-screenshots join artwork-batch, bringing
// PLAN §9.1's full lineup online. Consumers (server routes, client Workflow
// page) import getWorkflow(id) or ALL_WORKFLOWS from here.

import { NotFoundError } from "@/core/shared/errors"
import { adProductionWorkflow } from "./ad-production"
import { artworkBatchWorkflow } from "./artwork-batch"
import { asoScreenshotsWorkflow } from "./aso-screenshots"
import { styleTransformWorkflow } from "./style-transform"
import type { WorkflowDefinition } from "./types"

export * from "./types"
export { adProductionWorkflow } from "./ad-production"
export { artworkBatchWorkflow } from "./artwork-batch"
export { asoScreenshotsWorkflow } from "./aso-screenshots"
export { styleTransformWorkflow } from "./style-transform"

export const ALL_WORKFLOWS: readonly WorkflowDefinition[] = [
  artworkBatchWorkflow,
  adProductionWorkflow,
  styleTransformWorkflow,
  asoScreenshotsWorkflow,
] as const

export function getWorkflow(id: string): WorkflowDefinition {
  const found = ALL_WORKFLOWS.find((w) => w.id === id)
  if (!found) {
    throw new NotFoundError(`Workflow '${id}' not found`, {
      workflowId: id,
      availableWorkflows: ALL_WORKFLOWS.map((w) => w.id),
    })
  }
  return found
}
