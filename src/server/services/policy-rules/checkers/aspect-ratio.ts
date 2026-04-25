// Phase C3 (Session #43) — aspect-ratio checker.
//
// Skips when `assetAspectRatio` is undefined (preflight-time = asset
// doesn't exist yet → cannot evaluate; downstream finalize-batch path
// supplies it from the persisted asset row).

import type { PolicyChecker } from "./types"

export const checkAspectRatio: PolicyChecker = (rule, input) => {
  if (rule.pattern.kind !== "aspect-ratio") return null
  if (input.assetAspectRatio === undefined) return null
  if (rule.pattern.allowed.includes(input.assetAspectRatio)) return null
  return {
    ruleId: rule.id,
    severity: rule.severity,
    kind: "aspect-ratio",
    message:
      `Aspect ratio "${input.assetAspectRatio}" not in allowed list ` +
      `[${rule.pattern.allowed.join(", ")}].`,
    details: {
      observed: input.assetAspectRatio,
      allowed: rule.pattern.allowed,
    },
  }
}
