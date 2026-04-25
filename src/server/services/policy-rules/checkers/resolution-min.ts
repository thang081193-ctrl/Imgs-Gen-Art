// Phase C3 (Session #43) — resolution-min checker.
//
// Skips when EITHER assetWidth OR assetHeight is undefined — both
// dimensions are required to evaluate. Downstream callers either pass
// both or neither.

import type { PolicyChecker } from "./types"

export const checkResolutionMin: PolicyChecker = (rule, input) => {
  if (rule.pattern.kind !== "resolution-min") return null
  if (input.assetWidth === undefined || input.assetHeight === undefined) return null

  const widthOk = input.assetWidth >= rule.pattern.minWidth
  const heightOk = input.assetHeight >= rule.pattern.minHeight
  if (widthOk && heightOk) return null

  return {
    ruleId: rule.id,
    severity: rule.severity,
    kind: "resolution-min",
    message:
      `Asset resolution ${input.assetWidth}×${input.assetHeight} below ` +
      `min ${rule.pattern.minWidth}×${rule.pattern.minHeight}.`,
    details: {
      observedWidth: input.assetWidth,
      observedHeight: input.assetHeight,
      minWidth: rule.pattern.minWidth,
      minHeight: rule.pattern.minHeight,
    },
  }
}
