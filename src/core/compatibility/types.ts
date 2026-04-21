// Plan §6.3 + §7 — compatibility types.

import type { AspectRatio, LanguageCode, ModelInfo, ProviderCapability } from "../model-registry/types"
import type { WorkflowId } from "../design/types"

export interface WorkflowRequirement {
  required: (keyof ProviderCapability)[]
  preferred: (keyof ProviderCapability)[]
  forbidden?: (keyof ProviderCapability)[]
  minResolution?: "1K" | "2K" | "4K"
  requiredAspectRatios?: AspectRatio[]
  requiredLanguages?: LanguageCode[]
}

export interface CompatibilityOverride {
  providerId: string
  modelId: string
  forceStatus: "compatible" | "incompatible"
  reason: string
}

export interface CompatibilityResult {
  status: "compatible" | "incompatible"
  score: number
  source: "declarative" | "override"
  reason?: string
  recommendedForWorkflow?: boolean
}

export type CompatibilityMatrix = Record<
  WorkflowId,
  Record<string, CompatibilityResult>
>

export interface WorkflowCompatInput {
  id: WorkflowId
  requirement: WorkflowRequirement
  compatibilityOverrides: CompatibilityOverride[]
}

export interface ResolveInput {
  workflows: readonly WorkflowCompatInput[]
  models: readonly ModelInfo[]
}
