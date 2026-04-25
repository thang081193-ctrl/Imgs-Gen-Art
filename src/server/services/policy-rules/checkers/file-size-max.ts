// Phase C3 (Session #43) — file-size-max checker.
//
// Skips when `assetFileSizeBytes` is undefined (preflight-time).

import type { PolicyChecker } from "./types"

export const checkFileSizeMax: PolicyChecker = (rule, input) => {
  if (rule.pattern.kind !== "file-size-max") return null
  if (input.assetFileSizeBytes === undefined) return null
  if (input.assetFileSizeBytes <= rule.pattern.maxBytes) return null
  return {
    ruleId: rule.id,
    severity: rule.severity,
    kind: "file-size-max",
    message:
      `Asset file size ${input.assetFileSizeBytes} bytes exceeds ` +
      `max ${rule.pattern.maxBytes} bytes.`,
    details: {
      observedBytes: input.assetFileSizeBytes,
      maxBytes: rule.pattern.maxBytes,
    },
  }
}
