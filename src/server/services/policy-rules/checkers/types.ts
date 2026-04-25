// Phase C3 (Session #43) — shared types for the 6 per-kind checkers.
//
// `PolicyCheckInput` is the surface area exposed by both wizard preflight
// (Q-43.F LOCKED — asset-* fields optional because the asset doesn't
// exist yet at preflight-time) and `finalizeBatch` (asset-* populated
// from the persisted asset row). Each checker exports a pure
// `(rule, input) => PolicyViolation | null` so the aggregator can
// dispatch on `rule.pattern.kind` without per-kind plumbing.

import type { PolicyPlatform, PolicyRule } from "@/core/schemas/policy-rule"
import type { PolicyViolation } from "@/core/schemas/policy-decision"

export interface PolicyCheckInput {
  platform: PolicyPlatform
  prompt?: string
  copyTexts?: string[]
  assetWidth?: number
  assetHeight?: number
  assetFileSizeBytes?: number
  assetAspectRatio?: string
}

export type PolicyChecker = (
  rule: PolicyRule,
  input: PolicyCheckInput,
) => PolicyViolation | PolicyViolation[] | null

/** Shared helper: prompt + copy concatenated for substring/regex kinds. */
export function joinTextSurface(input: PolicyCheckInput): string {
  const copy = input.copyTexts?.join(" ") ?? ""
  const prompt = input.prompt ?? ""
  return prompt && copy ? `${prompt} ${copy}` : prompt || copy
}
