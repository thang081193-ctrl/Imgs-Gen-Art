// Phase C3 (Session #43) — text-area-ratio checker (DEFERRED stub).
//
// Q-43.C LOCKED: real check needs sharp + OCR (image analysis), which v2
// hasn't shipped. Stub emits a single `severity:"warning"` violation
// `text-area-pending` so the rule stays VISIBLE in the wizard preflight
// UI (D1+) rather than silently disappearing. Real check lands in a
// dedicated post-D session per carry-forward §15.

import type { PolicyChecker } from "./types"

export const checkTextAreaRatio: PolicyChecker = (rule) => {
  if (rule.pattern.kind !== "text-area-ratio") return null
  return {
    ruleId: rule.id,
    severity: "warning",
    kind: "text-area-pending",
    message:
      `Manual review required: text-area-ratio (max ${rule.pattern.maxRatio}) ` +
      `cannot be evaluated automatically until image-analysis ships.`,
    details: { maxRatio: rule.pattern.maxRatio },
  }
}
