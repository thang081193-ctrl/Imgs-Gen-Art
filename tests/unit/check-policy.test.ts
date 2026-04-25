// Phase C3 (Session #43) — checkPolicy aggregator tests.
//
// Uses `options.rules` to pre-resolve a synthetic rule list (skips the
// disk-loader path — that's covered in policy-rules-loader.test.ts).
// Coverage: no-rules, single-block, override-clears-warning,
// override-cannot-clear-block, hand-curated takes precedence (smoke).

import { describe, expect, it } from "vitest"

import { checkPolicy } from "@/server/services/policy-rules"
import type {
  PolicyOverride,
  PolicyRule,
} from "@/server/services/policy-rules"

const FIXED_NOW = (): Date => new Date("2026-04-25T10:00:00.000Z")

function rule(p: Partial<PolicyRule> & Pick<PolicyRule, "id" | "pattern" | "severity">): PolicyRule {
  return {
    id: p.id,
    platform: p.platform ?? "meta",
    category: p.category ?? "test",
    description: p.description ?? "stub",
    severity: p.severity,
    pattern: p.pattern,
    lastReviewedAt: p.lastReviewedAt ?? "2026-04-25",
    source: p.source ?? "hand-curated",
  }
}

describe("checkPolicy", () => {
  it("no rules → ok=true, empty violations", () => {
    const decision = checkPolicy(
      { platform: "meta", prompt: "anything goes" },
      { rules: [], now: FIXED_NOW },
    )
    expect(decision.ok).toBe(true)
    expect(decision.violations).toEqual([])
    expect(decision.decidedAt).toBe("2026-04-25T10:00:00.000Z")
    expect(decision.overrides).toBeUndefined()
  })

  it("single block-severity hit → ok=false", () => {
    const decision = checkPolicy(
      { platform: "meta", prompt: "miracle cure" },
      {
        rules: [
          rule({
            id: "no-miracle",
            severity: "block",
            pattern: { kind: "keyword-blocklist", keywords: ["miracle"], caseInsensitive: true },
          }),
        ],
        now: FIXED_NOW,
      },
    )
    expect(decision.ok).toBe(false)
    expect(decision.violations).toHaveLength(1)
    expect(decision.violations[0]?.severity).toBe("block")
  })

  it("override clears warning → ok=true; details.overridden=true", () => {
    const overrides: PolicyOverride[] = [
      { ruleId: "warn-rule", reason: "approved by legal", decidedBy: "p1" },
    ]
    const decision = checkPolicy(
      { platform: "meta", prompt: "edge case" },
      {
        rules: [
          rule({
            id: "warn-rule",
            severity: "warning",
            pattern: {
              kind: "keyword-blocklist",
              keywords: ["edge"],
              caseInsensitive: true,
            },
          }),
        ],
        overrides,
        now: FIXED_NOW,
      },
    )
    // Warnings don't gate `ok` regardless of override (Q-43.D).
    expect(decision.ok).toBe(true)
    expect(decision.overrides).toEqual(overrides)
    // The violation row gains `overridden:true` so the audit blob shows
    // the override was honored.
    expect(decision.violations[0]?.details?.overridden).toBe(true)
  })

  it("override CANNOT clear block — block stays unoverridden", () => {
    const overrides: PolicyOverride[] = [
      { ruleId: "block-rule", reason: "want to bypass" },
    ]
    const decision = checkPolicy(
      { platform: "meta", prompt: "miracle" },
      {
        rules: [
          rule({
            id: "block-rule",
            severity: "block",
            pattern: {
              kind: "keyword-blocklist",
              keywords: ["miracle"],
              caseInsensitive: true,
            },
          }),
        ],
        overrides,
        now: FIXED_NOW,
      },
    )
    expect(decision.ok).toBe(false)
    // Override is preserved in audit blob (Q-43.D rationale: visible
    // record of attempted bypass) but does NOT neutralize the block.
    expect(decision.overrides).toEqual(overrides)
    expect(decision.violations[0]?.details?.overridden).toBeUndefined()
  })

  it("rules from other platforms are ignored", () => {
    const decision = checkPolicy(
      { platform: "meta", prompt: "miracle" },
      {
        rules: [
          rule({
            id: "google-rule",
            platform: "google-ads",
            severity: "block",
            pattern: {
              kind: "keyword-blocklist",
              keywords: ["miracle"],
              caseInsensitive: true,
            },
          }),
        ],
        now: FIXED_NOW,
      },
    )
    expect(decision.ok).toBe(true)
    expect(decision.violations).toEqual([])
  })

  it("ruleSetVersion passes through when supplied", () => {
    const decision = checkPolicy(
      { platform: "meta" },
      { rules: [], now: FIXED_NOW, ruleSetVersion: "abc123" },
    )
    expect(decision.ruleSetVersion).toBe("abc123")
  })

  it("emits text-area-pending warning for text-area-ratio rules (deferred kind)", () => {
    const decision = checkPolicy(
      { platform: "meta" },
      {
        rules: [
          rule({
            id: "ar-rule",
            severity: "block",
            pattern: { kind: "text-area-ratio", maxRatio: 0.2 },
          }),
        ],
        now: FIXED_NOW,
      },
    )
    // Even though rule.severity is "block", stub forces "warning" so
    // bro is NOT gated until image-analysis ships → ok=true.
    expect(decision.ok).toBe(true)
    expect(decision.violations[0]?.kind).toBe("text-area-pending")
    expect(decision.violations[0]?.severity).toBe("warning")
  })
})
