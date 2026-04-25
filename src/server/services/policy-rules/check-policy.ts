// PLAN-v3 §4.3 — checkPolicy aggregator (Phase C3, Session #43).
//
// Pure function: `(input, options?) => PolicyDecision`. Loads merged
// rules for `input.platform` (hand-curated wins on id collision per the
// loader contract), dispatches each rule to its per-kind checker, then
// applies overrides + computes `ok` (Q-43.D LOCKED — only `warning`
// rules can be overridden; `block` is unconditional).
//
// `options.rules` lets tests pre-resolve a rule list to skip the loader
// (handy when a test needs a synthetic rule that doesn't live on disk).
// `options.now` is a clock seam so test snapshots are deterministic.

import type {
  PolicyDecision,
  PolicyOverride,
  PolicyViolation,
} from "@/core/schemas/policy-decision"
import type { PolicyRule } from "@/core/schemas/policy-rule"

import {
  checkAspectRatio,
  checkClaimRegex,
  checkFileSizeMax,
  checkKeywordBlocklist,
  checkResolutionMin,
  checkTextAreaRatio,
  type PolicyChecker,
  type PolicyCheckInput,
} from "./checkers"
import { getPolicyRules } from "./loader"

const CHECKER_BY_KIND: Record<PolicyRule["pattern"]["kind"], PolicyChecker> = {
  "text-area-ratio": checkTextAreaRatio,
  "keyword-blocklist": checkKeywordBlocklist,
  "aspect-ratio": checkAspectRatio,
  "file-size-max": checkFileSizeMax,
  "resolution-min": checkResolutionMin,
  "claim-regex": checkClaimRegex,
}

export interface CheckPolicyOptions {
  /** Pre-resolved rules. When supplied, the loader is bypassed. */
  rules?: PolicyRule[]
  /** Override `decidedAt` clock for deterministic tests. */
  now?: () => Date
  /** Caller-supplied overrides (preflight body / runner audit). */
  overrides?: PolicyOverride[]
  /** Reserved — populated by D-phase rule-set hashing. */
  ruleSetVersion?: string
}

export function checkPolicy(
  input: PolicyCheckInput,
  options: CheckPolicyOptions = {},
): PolicyDecision {
  const rules = options.rules ?? getPolicyRules(input.platform)
  const overrides = options.overrides ?? []

  const violations: PolicyViolation[] = []
  for (const rule of rules) {
    if (rule.platform !== input.platform) continue
    const checker = CHECKER_BY_KIND[rule.pattern.kind]
    const out = checker(rule, input)
    if (out === null) continue
    if (Array.isArray(out)) violations.push(...out)
    else violations.push(out)
  }

  // Q-43.D LOCKED: overrides only neutralize warning-severity rules. A
  // block-severity rule with a matching override row stays counted in
  // `ok=false`. The override row IS preserved in the audit blob (so
  // bro can later see "client tried to override rule X" — useful when
  // debugging a regressed wizard).
  const overriddenWarningRuleIds = new Set(
    overrides
      .filter((o) => {
        const rule = rules.find((r) => r.id === o.ruleId)
        return rule?.severity === "warning"
      })
      .map((o) => o.ruleId),
  )

  const hasUnoverriddenBlock = violations.some(
    (v) => v.severity === "block",
  )
  const ok = !hasUnoverriddenBlock

  const decidedAt = (options.now ?? (() => new Date()))().toISOString()
  const decision: PolicyDecision = {
    decidedAt,
    ok,
    violations,
    overrides: overrides.length > 0 ? overrides : undefined,
    ruleSetVersion: options.ruleSetVersion,
  }
  // Strip undefined keys so JSON round-trip stays clean (zod
  // `.strict()` doesn't reject undefined values, but keeping the shape
  // tidy makes audit-blob diffs easier to eyeball).
  if (decision.ruleSetVersion === undefined) delete decision.ruleSetVersion
  if (decision.overrides === undefined) delete decision.overrides

  // Surface which warning rules had their severity neutralized by an
  // override — purely informational on the violation row's `details`
  // bag so consumers can render "overridden" badges. Block rules stay
  // unchanged regardless of override presence.
  if (overriddenWarningRuleIds.size > 0) {
    decision.violations = violations.map((v) =>
      overriddenWarningRuleIds.has(v.ruleId)
        ? {
            ...v,
            details: { ...(v.details ?? {}), overridden: true },
          }
        : v,
    )
  }

  return decision
}
