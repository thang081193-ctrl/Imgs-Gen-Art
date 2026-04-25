// Phase C3 (Session #43) — keyword-blocklist checker.
//
// Q-43.E LOCKED: emits one violation per matched keyword (so the wizard
// can highlight each independently). Case-insensitivity follows the
// rule's `caseInsensitive` flag (default true at schema level).
// Substring match against `prompt + copyTexts` per Q-43.F.

import type { PolicyChecker } from "./types"
import { joinTextSurface } from "./types"

export const checkKeywordBlocklist: PolicyChecker = (rule, input) => {
  if (rule.pattern.kind !== "keyword-blocklist") return null
  const surface = joinTextSurface(input)
  if (!surface) return null

  const haystack = rule.pattern.caseInsensitive ? surface.toLowerCase() : surface
  const violations = []
  for (const keyword of rule.pattern.keywords) {
    const needle = rule.pattern.caseInsensitive ? keyword.toLowerCase() : keyword
    if (haystack.includes(needle)) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        kind: "keyword-blocklist",
        message: `Matched blocked keyword "${keyword}" in prompt/copy.`,
        details: {
          keyword,
          caseInsensitive: rule.pattern.caseInsensitive,
        },
      })
    }
  }
  return violations.length === 0 ? null : violations
}
