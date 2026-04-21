// Plan §7 — declarative resolver with override.
// Algorithm:
//   1. Apply explicit override (if any) — returns early with source="override".
//   2. Declarative check:
//      - Any forbidden flag set on model → incompatible
//      - Any required flag missing → incompatible
//      - minResolution unmet → incompatible
//   3. Scoring:
//      - +1 per matched preferred flag
//      - +0 otherwise (score=0 does NOT mean incompatible here; just no preference match)
//      - status="compatible" as long as required pass

import type { ModelInfo, ProviderCapability } from "../model-registry/types"
import type {
  CompatibilityMatrix,
  CompatibilityResult,
  ResolveInput,
  WorkflowCompatInput,
  WorkflowRequirement,
} from "./types"

const RESOLUTION_RANK: Record<"1K" | "2K" | "4K", number> = { "1K": 1, "2K": 2, "4K": 4 }

function hasFlag(capability: ProviderCapability, key: keyof ProviderCapability): boolean {
  const v = capability[key]
  if (typeof v === "boolean") return v
  // non-boolean flags (supportsTextInImage, maxResolution, arrays) aren't meant to be used as required/preferred
  // but if someone does, treat truthy as "present"
  return Boolean(v)
}

function checkDeclarative(
  requirement: WorkflowRequirement,
  model: ModelInfo,
): CompatibilityResult {
  const { capability } = model

  if (requirement.forbidden) {
    for (const flag of requirement.forbidden) {
      if (hasFlag(capability, flag)) {
        return {
          status: "incompatible",
          score: 0,
          source: "declarative",
          reason: `model has forbidden capability ${String(flag)}`,
        }
      }
    }
  }

  for (const flag of requirement.required) {
    if (!hasFlag(capability, flag)) {
      return {
        status: "incompatible",
        score: 0,
        source: "declarative",
        reason: `model missing required capability ${String(flag)}`,
      }
    }
  }

  if (requirement.minResolution) {
    if (RESOLUTION_RANK[capability.maxResolution] < RESOLUTION_RANK[requirement.minResolution]) {
      return {
        status: "incompatible",
        score: 0,
        source: "declarative",
        reason: `model maxResolution ${capability.maxResolution} below required ${requirement.minResolution}`,
      }
    }
  }

  let score = 0
  for (const flag of requirement.preferred) {
    if (hasFlag(capability, flag)) score += 1
  }

  return { status: "compatible", score, source: "declarative" }
}

function resolveForModel(
  workflow: WorkflowCompatInput,
  model: ModelInfo,
): CompatibilityResult {
  const override = workflow.compatibilityOverrides.find(
    (o) => o.providerId === model.providerId && o.modelId === model.id,
  )
  if (override) {
    return {
      status: override.forceStatus,
      score: override.forceStatus === "compatible" ? 1 : 0,
      source: "override",
      reason: override.reason,
    }
  }
  return checkDeclarative(workflow.requirement, model)
}

export function resolveCompatibility(input: ResolveInput): CompatibilityMatrix {
  const matrix: CompatibilityMatrix = {} as CompatibilityMatrix

  for (const workflow of input.workflows) {
    const perModel: Record<string, CompatibilityResult> = {}
    let bestScore = -1
    const scoresByKey: Record<string, number> = {}

    for (const model of input.models) {
      const result = resolveForModel(workflow, model)
      const key = `${model.providerId}:${model.id}`
      perModel[key] = result
      if (result.status === "compatible") {
        scoresByKey[key] = result.score
        if (result.score > bestScore) bestScore = result.score
      }
    }

    // Mark best-scored compatible models with recommendedForWorkflow flag
    if (bestScore >= 0) {
      for (const [key, score] of Object.entries(scoresByKey)) {
        if (score === bestScore) {
          const existing = perModel[key]
          if (existing) perModel[key] = { ...existing, recommendedForWorkflow: true }
        }
      }
    }

    matrix[workflow.id] = perModel
  }

  return matrix
}
