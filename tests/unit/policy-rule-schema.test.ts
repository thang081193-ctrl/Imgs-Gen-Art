// PLAN-v3 §4.1 / Phase C1 — Zod validation tests for PolicyRule.

import { describe, expect, it } from "vitest"

import {
  HandCuratedPolicyRuleFileSchema,
  PolicyPatternSchema,
  PolicyRuleSchema,
  ScrapedPolicyRuleFileSchema,
} from "@/core/schemas/policy-rule"

const baseRule = {
  id: "meta-test-rule-001",
  platform: "meta" as const,
  category: "text-density",
  description: "test rule",
  severity: "warning" as const,
  pattern: { kind: "text-area-ratio" as const, maxRatio: 0.2 },
  lastReviewedAt: "2026-04-25",
  source: "hand-curated" as const,
}

describe("PolicyPatternSchema — discriminated union round-trip", () => {
  it("accepts text-area-ratio", () => {
    const ok = PolicyPatternSchema.safeParse({
      kind: "text-area-ratio",
      maxRatio: 0.2,
    })
    expect(ok.success).toBe(true)
  })

  it("accepts keyword-blocklist with default caseInsensitive", () => {
    const out = PolicyPatternSchema.parse({
      kind: "keyword-blocklist",
      keywords: ["foo"],
    })
    expect(out).toMatchObject({ kind: "keyword-blocklist", caseInsensitive: true })
  })

  it("accepts aspect-ratio with valid `n:n` strings", () => {
    const ok = PolicyPatternSchema.safeParse({
      kind: "aspect-ratio",
      allowed: ["1:1", "16:9", "9:16"],
    })
    expect(ok.success).toBe(true)
  })

  it("rejects aspect-ratio with malformed ratio", () => {
    const bad = PolicyPatternSchema.safeParse({
      kind: "aspect-ratio",
      allowed: ["square"],
    })
    expect(bad.success).toBe(false)
  })

  it("accepts file-size-max with positive int", () => {
    expect(
      PolicyPatternSchema.safeParse({ kind: "file-size-max", maxBytes: 5_000_000 })
        .success,
    ).toBe(true)
  })

  it("rejects file-size-max with non-positive bytes", () => {
    expect(
      PolicyPatternSchema.safeParse({ kind: "file-size-max", maxBytes: 0 }).success,
    ).toBe(false)
  })

  it("accepts resolution-min", () => {
    expect(
      PolicyPatternSchema.safeParse({
        kind: "resolution-min",
        minWidth: 1080,
        minHeight: 1920,
      }).success,
    ).toBe(true)
  })

  it("accepts claim-regex with optional flags", () => {
    expect(
      PolicyPatternSchema.safeParse({
        kind: "claim-regex",
        pattern: "miracle",
        flags: "i",
      }).success,
    ).toBe(true)
  })

  it("rejects unknown kind", () => {
    expect(
      PolicyPatternSchema.safeParse({ kind: "image-hash-blocklist" }).success,
    ).toBe(false)
  })
})

describe("PolicyRuleSchema — strict mode + field validation", () => {
  it("accepts the canonical example", () => {
    const out = PolicyRuleSchema.parse(baseRule)
    expect(out.id).toBe("meta-test-rule-001")
  })

  it("rejects unknown top-level keys (.strict())", () => {
    const bad = PolicyRuleSchema.safeParse({ ...baseRule, extra: "nope" })
    expect(bad.success).toBe(false)
  })

  it("rejects non-kebab-case id", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, id: "Meta_RuleOne" }).success,
    ).toBe(false)
  })

  it("rejects unknown severity", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, severity: "fatal" }).success,
    ).toBe(false)
  })

  it("rejects unknown platform", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, platform: "twitter" }).success,
    ).toBe(false)
  })

  it("requires description to be non-empty", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, description: "" }).success,
    ).toBe(false)
  })

  it("accepts ISO datetime in lastReviewedAt", () => {
    expect(
      PolicyRuleSchema.safeParse({
        ...baseRule,
        lastReviewedAt: "2026-04-25T10:30:00+07:00",
      }).success,
    ).toBe(true)
  })

  it("rejects malformed date", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, lastReviewedAt: "April 25 2026" })
        .success,
    ).toBe(false)
  })

  it("rejects non-URL sourceUrl", () => {
    expect(
      PolicyRuleSchema.safeParse({ ...baseRule, sourceUrl: "not a url" }).success,
    ).toBe(false)
  })
})

describe("File-wrapper schemas", () => {
  it("ScrapedPolicyRuleFileSchema requires scrapedAt", () => {
    expect(
      ScrapedPolicyRuleFileSchema.safeParse({ rules: [baseRule] }).success,
    ).toBe(false)
    expect(
      ScrapedPolicyRuleFileSchema.safeParse({
        scrapedAt: "2026-04-25T10:00:00Z",
        rules: [baseRule],
      }).success,
    ).toBe(true)
  })

  it("HandCuratedPolicyRuleFileSchema rejects unknown wrapper keys", () => {
    expect(
      HandCuratedPolicyRuleFileSchema.safeParse({
        rules: [baseRule],
        scrapedAt: "2026-04-25T10:00:00Z",
      }).success,
    ).toBe(false)
  })

  it("Empty rules array is allowed in both wrappers", () => {
    expect(HandCuratedPolicyRuleFileSchema.safeParse({ rules: [] }).success).toBe(
      true,
    )
    expect(
      ScrapedPolicyRuleFileSchema.safeParse({
        scrapedAt: "2026-04-25T10:00:00Z",
        rules: [],
      }).success,
    ).toBe(true)
  })
})
