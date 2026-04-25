// Phase C3 (Session #43) — claim-regex checker.
//
// Q-43.E LOCKED: one violation per match (RegExp.prototype.matchAll). If
// the rule's regex compiles invalid (rule author error), surface a
// `severity:"warning"` `claim-regex-invalid` so the wizard can flag the
// rule for review without crashing the aggregator.

import type { PolicyChecker } from "./types"
import { joinTextSurface } from "./types"

export const checkClaimRegex: PolicyChecker = (rule, input) => {
  if (rule.pattern.kind !== "claim-regex") return null
  // Hoist the narrowed pattern so closures (matches.map) keep the
  // discriminated-union narrowing — TS otherwise loses it across the
  // try/catch boundary.
  const pattern = rule.pattern
  const surface = joinTextSurface(input)
  if (!surface) return null

  let re: RegExp
  try {
    // Force the global flag so matchAll can iterate; preserve any author-
    // supplied flags (e.g. "i") by appending "g" if missing.
    const flags = pattern.flags ?? ""
    re = new RegExp(pattern.pattern, flags.includes("g") ? flags : `${flags}g`)
  } catch (err) {
    return {
      ruleId: rule.id,
      severity: "warning",
      kind: "claim-regex-invalid",
      message: `Rule "${rule.id}" has an invalid regex pattern.`,
      details: {
        pattern: pattern.pattern,
        flags: pattern.flags,
        cause: err instanceof Error ? err.message : String(err),
      },
    }
  }

  const matches = [...surface.matchAll(re)]
  if (matches.length === 0) return null
  return matches.map((m) => ({
    ruleId: rule.id,
    severity: rule.severity,
    kind: "claim-regex",
    message: `Matched disallowed claim phrase "${m[0]}".`,
    details: {
      matchedText: m[0],
      pattern: pattern.pattern,
      flags: pattern.flags,
    },
  }))
}
