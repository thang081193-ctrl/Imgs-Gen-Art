// Registry of sidecar workflow forms. Workflow page looks up by WorkflowId.

import type { WorkflowId } from "@/core/design/types"
import type { WorkflowFormDescriptor } from "./types"
import { ArtworkBatchForm } from "./artwork-batch"
import { AdProductionForm } from "./ad-production"
import { StyleTransformForm } from "./style-transform"
import { AsoScreenshotsForm } from "./aso-screenshots"

export const WORKFLOW_FORMS: Record<WorkflowId, WorkflowFormDescriptor> = {
  "artwork-batch":    { id: "artwork-batch",    Component: ArtworkBatchForm },
  "ad-production":    { id: "ad-production",    Component: AdProductionForm },
  "style-transform":  { id: "style-transform",  Component: StyleTransformForm },
  "aso-screenshots":  { id: "aso-screenshots",  Component: AsoScreenshotsForm },
}

export type { WorkflowFormProps, WorkflowFormDescriptor } from "./types"
