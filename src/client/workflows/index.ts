// Registry of sidecar workflow forms. Workflow page looks up by WorkflowId.
//
// S#38 PLAN-v3 §6.3 — `aso-screenshots` is retired from the *client* (no
// entry-point + no form file). The server route + DB rows survive
// untouched (Q-10c "preserve gallery"). Existing legacy ASO assets stay
// browsable via Gallery; new gens via this workflow stop because the
// picker no longer exposes it. The map is now `Partial<Record<…>>`
// because the client deliberately covers a strict subset of the
// server-known WorkflowIds.

import type { WorkflowId } from "@/core/design/types"
import type { WorkflowFormDescriptor } from "./types"
import { ArtworkBatchForm } from "./artwork-batch"
import { AdProductionForm } from "./ad-production"
import { StyleTransformForm } from "./style-transform"

export const WORKFLOW_FORMS: Partial<Record<WorkflowId, WorkflowFormDescriptor>> = {
  "artwork-batch":    { id: "artwork-batch",    Component: ArtworkBatchForm },
  "ad-production":    { id: "ad-production",    Component: AdProductionForm },
  "style-transform":  { id: "style-transform",  Component: StyleTransformForm },
}

// IDs the client UI deliberately hides — used by Workflow.tsx to filter
// the picker so retired workflows don't render even though /api/workflows
// still returns them for backward-compat replay.
export const RETIRED_WORKFLOW_IDS: readonly WorkflowId[] = ["aso-screenshots"]

export type { WorkflowFormProps, WorkflowFormDescriptor } from "./types"
