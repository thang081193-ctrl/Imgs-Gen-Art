// Registry for all 4 workflows. Populated incrementally — Step 3 adds
// artwork-batch; Step 7 adds ad-production, style-transform, aso-screenshots.
// Consumers (server routes, client Workflow page) import getWorkflow(id) or
// ALL_WORKFLOWS from here.

import { NotFoundError } from "@/core/shared/errors"
import { artworkBatchWorkflow } from "./artwork-batch"
import type { WorkflowDefinition } from "./types"

export * from "./types"
export { artworkBatchWorkflow } from "./artwork-batch"

export const ALL_WORKFLOWS: readonly WorkflowDefinition[] = [
  artworkBatchWorkflow,
  // Step 7: adProductionWorkflow, styleTransformWorkflow, asoScreenshotsWorkflow,
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
