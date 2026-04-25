// Phase C3 (Session #43) — per-kind checker round-trip tests.
//
// One describe block per kind: hit, miss, and skip-when-input-missing.
// Synthetic PolicyRule objects (Q-43.I LOCKED — no real images, pure
// number/string comparisons).

import { describe, expect, it } from "vitest"

import {
  checkAspectRatio,
  checkClaimRegex,
  checkFileSizeMax,
  checkKeywordBlocklist,
  checkResolutionMin,
  checkTextAreaRatio,
  type PolicyCheckInput,
} from "@/server/services/policy-rules/checkers"
import type { PolicyRule } from "@/server/services/policy-rules"

const BASE_INPUT: PolicyCheckInput = { platform: "meta" }

function makeRule(overrides: Partial<PolicyRule> & Pick<PolicyRule, "pattern">): PolicyRule {
  return {
    id: overrides.id ?? "test-rule",
    platform: overrides.platform ?? "meta",
    category: overrides.category ?? "test",
    description: overrides.description ?? "stub",
    severity: overrides.severity ?? "warning",
    pattern: overrides.pattern,
    lastReviewedAt: overrides.lastReviewedAt ?? "2026-04-25",
    source: overrides.source ?? "hand-curated",
  }
}

describe("checkTextAreaRatio (deferred stub)", () => {
  it("emits text-area-pending warning regardless of input (kind not implemented in v2)", () => {
    const rule = makeRule({
      id: "meta-text-area",
      severity: "block",
      pattern: { kind: "text-area-ratio", maxRatio: 0.2 },
    })
    const out = checkTextAreaRatio(rule, BASE_INPUT)
    expect(out).not.toBeNull()
    expect(out).toMatchObject({
      ruleId: "meta-text-area",
      severity: "warning",
      kind: "text-area-pending",
    })
    // Even when the rule's severity is "block", stub forces "warning"
    // because we cannot evaluate → bro can override.
    expect((out as { severity: string }).severity).toBe("warning")
  })

  it("returns null for non-matching kind (defensive)", () => {
    const rule = makeRule({
      pattern: { kind: "keyword-blocklist", keywords: ["bad"], caseInsensitive: true },
    })
    expect(checkTextAreaRatio(rule, BASE_INPUT)).toBeNull()
  })
})

describe("checkKeywordBlocklist", () => {
  const rule = makeRule({
    id: "meta-no-miracle",
    pattern: {
      kind: "keyword-blocklist",
      keywords: ["miracle", "guaranteed"],
      caseInsensitive: true,
    },
  })

  it("hit: 1 violation per matched keyword (case-insensitive)", () => {
    const out = checkKeywordBlocklist(rule, {
      ...BASE_INPUT,
      prompt: "MIRACLE cure GUARANTEED results",
    })
    expect(Array.isArray(out)).toBe(true)
    const arr = out as Array<{ details?: { keyword: string } }>
    expect(arr).toHaveLength(2)
    expect(arr.map((v) => v.details?.keyword).sort()).toEqual([
      "guaranteed",
      "miracle",
    ])
  })

  it("hit: case-sensitive rule does NOT match different-case input", () => {
    const sensitive = makeRule({
      pattern: {
        kind: "keyword-blocklist",
        keywords: ["Free"],
        caseInsensitive: false,
      },
    })
    expect(
      checkKeywordBlocklist(sensitive, { ...BASE_INPUT, prompt: "free trial" }),
    ).toBeNull()
    const hit = checkKeywordBlocklist(sensitive, {
      ...BASE_INPUT,
      prompt: "Free trial",
    })
    expect(Array.isArray(hit)).toBe(true)
  })

  it("miss: no keyword present", () => {
    expect(
      checkKeywordBlocklist(rule, { ...BASE_INPUT, prompt: "clean copy here" }),
    ).toBeNull()
  })

  it("skip: empty prompt + empty copyTexts → null", () => {
    expect(checkKeywordBlocklist(rule, BASE_INPUT)).toBeNull()
  })

  it("matches across copyTexts join", () => {
    const out = checkKeywordBlocklist(rule, {
      ...BASE_INPUT,
      copyTexts: ["headline only", "this is guaranteed"],
    })
    expect(Array.isArray(out)).toBe(true)
    expect((out as unknown[]).length).toBe(1)
  })
})

describe("checkAspectRatio", () => {
  const rule = makeRule({
    id: "meta-ar",
    severity: "block",
    pattern: { kind: "aspect-ratio", allowed: ["16:9", "1:1"] },
  })

  it("hit: ratio not in allow-list", () => {
    const out = checkAspectRatio(rule, { ...BASE_INPUT, assetAspectRatio: "9:16" })
    expect(out).toMatchObject({ ruleId: "meta-ar", kind: "aspect-ratio" })
  })

  it("miss: ratio in allow-list", () => {
    expect(
      checkAspectRatio(rule, { ...BASE_INPUT, assetAspectRatio: "1:1" }),
    ).toBeNull()
  })

  it("skip: assetAspectRatio undefined", () => {
    expect(checkAspectRatio(rule, BASE_INPUT)).toBeNull()
  })
})

describe("checkFileSizeMax", () => {
  const rule = makeRule({
    pattern: { kind: "file-size-max", maxBytes: 1024 },
  })

  it("hit: file size over max", () => {
    const out = checkFileSizeMax(rule, { ...BASE_INPUT, assetFileSizeBytes: 2048 })
    expect(out).toMatchObject({ kind: "file-size-max" })
  })

  it("miss: file size at exactly max (boundary inclusive ok)", () => {
    expect(
      checkFileSizeMax(rule, { ...BASE_INPUT, assetFileSizeBytes: 1024 }),
    ).toBeNull()
  })

  it("skip: assetFileSizeBytes undefined", () => {
    expect(checkFileSizeMax(rule, BASE_INPUT)).toBeNull()
  })
})

describe("checkResolutionMin", () => {
  const rule = makeRule({
    pattern: { kind: "resolution-min", minWidth: 800, minHeight: 600 },
  })

  it("hit: width below min", () => {
    const out = checkResolutionMin(rule, {
      ...BASE_INPUT,
      assetWidth: 700,
      assetHeight: 600,
    })
    expect(out).toMatchObject({ kind: "resolution-min" })
  })

  it("hit: height below min", () => {
    const out = checkResolutionMin(rule, {
      ...BASE_INPUT,
      assetWidth: 800,
      assetHeight: 500,
    })
    expect(out).not.toBeNull()
  })

  it("miss: both dimensions ≥ min", () => {
    expect(
      checkResolutionMin(rule, {
        ...BASE_INPUT,
        assetWidth: 1024,
        assetHeight: 768,
      }),
    ).toBeNull()
  })

  it("skip: missing one dimension → null (cannot evaluate)", () => {
    expect(checkResolutionMin(rule, { ...BASE_INPUT, assetWidth: 1024 })).toBeNull()
  })
})

describe("checkClaimRegex", () => {
  const rule = makeRule({
    id: "meta-claim",
    pattern: { kind: "claim-regex", pattern: "\\b(cure|heal)\\b", flags: "i" },
  })

  it("hit: 1 violation per match (matchAll)", () => {
    const out = checkClaimRegex(rule, {
      ...BASE_INPUT,
      prompt: "cure your skin Heal naturally",
    })
    expect(Array.isArray(out)).toBe(true)
    const arr = out as Array<{ details?: { matchedText: string } }>
    expect(arr).toHaveLength(2)
    expect(arr.map((v) => v.details?.matchedText?.toLowerCase()).sort()).toEqual([
      "cure",
      "heal",
    ])
  })

  it("miss: no claim phrase", () => {
    expect(
      checkClaimRegex(rule, { ...BASE_INPUT, prompt: "stylish copy" }),
    ).toBeNull()
  })

  it("skip: empty surface → null", () => {
    expect(checkClaimRegex(rule, BASE_INPUT)).toBeNull()
  })

  it("invalid regex → claim-regex-invalid warning (does not throw)", () => {
    const broken = makeRule({
      id: "broken",
      pattern: { kind: "claim-regex", pattern: "(unclosed", flags: "i" },
    })
    const out = checkClaimRegex(broken, { ...BASE_INPUT, prompt: "x" })
    expect(out).toMatchObject({
      ruleId: "broken",
      kind: "claim-regex-invalid",
      severity: "warning",
    })
  })
})
