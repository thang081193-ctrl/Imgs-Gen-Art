// PLAN §6.3 — Workflow contract (universal types).
//
// WorkflowDefinition is the shape every workflow exports. Its `run()` is
// a pure AsyncGenerator — no SSE / HTTP concerns here (routing layer in
// src/server/routes/workflows.ts handles framing).
//
// Input schemas MUST NOT declare `aspectRatio` or `language`. Both are
// top-level run params (per §6.3) and adding them to the workflow input
// would create two sources of truth. Enforced by precondition #7 + unit
// test sweep in Step 7.

import type { z } from "zod"

import type { ColorVariant, WorkflowId } from "@/core/design/types"
import type {
  AspectRatio,
  LanguageCode,
} from "@/core/model-registry/types"
import type { AppProfile } from "@/core/schemas/app-profile"

export type {
  Concept,
  WorkflowEvent,
} from "@/core/dto/workflow-dto"
export type {
  CompatibilityMatrix,
  CompatibilityOverride,
  CompatibilityResult,
  WorkflowRequirement,
} from "@/core/compatibility/types"
export type { WorkflowId } from "@/core/design/types"

export interface WorkflowRunParams {
  profile: AppProfile
  providerId: string
  modelId: string
  aspectRatio: AspectRatio
  language?: LanguageCode
  input: unknown
  abortSignal: AbortSignal
  batchId: string
}

export interface WorkflowDefinition {
  readonly id: WorkflowId
  readonly displayName: string
  readonly description: string
  readonly colorVariant: ColorVariant
  readonly requirement: import("@/core/compatibility/types").WorkflowRequirement
  readonly compatibilityOverrides: readonly import("@/core/compatibility/types").CompatibilityOverride[]
  readonly inputSchema: z.ZodTypeAny
  run: (params: WorkflowRunParams) => AsyncGenerator<
    import("@/core/dto/workflow-dto").WorkflowEvent
  >
}
