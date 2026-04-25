// PLAN-v3 §4.2 / Phase C1 — loader merge + cache + error tests.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  PolicyRulesLoaderError,
  getPolicyRules,
  loadPolicyRules,
  refreshPolicyRules,
  resetPolicyRulesCacheForTests,
} from "@/server/services/policy-rules"
import type { PolicyRule } from "@/server/services/policy-rules"

function makeRule(
  overrides: Partial<PolicyRule> & Pick<PolicyRule, "id" | "source">,
): PolicyRule {
  return {
    id: overrides.id,
    platform: overrides.platform ?? "meta",
    category: overrides.category ?? "category",
    description: overrides.description ?? "stub",
    severity: overrides.severity ?? "warning",
    pattern: overrides.pattern ?? { kind: "text-area-ratio", maxRatio: 0.2 },
    lastReviewedAt: overrides.lastReviewedAt ?? "2026-04-25",
    source: overrides.source,
    ...(overrides.format !== undefined ? { format: overrides.format } : {}),
    ...(overrides.sourceUrl !== undefined
      ? { sourceUrl: overrides.sourceUrl }
      : {}),
  }
}

function writeLayer(
  baseDir: string,
  layer: "scraped" | "hand-curated",
  filename: string,
  rules: PolicyRule[],
): void {
  const dir = join(baseDir, layer)
  mkdirSync(dir, { recursive: true })
  const payload =
    layer === "scraped"
      ? { scrapedAt: "2026-04-25T10:00:00Z", rules }
      : { rules }
  writeFileSync(join(dir, filename), JSON.stringify(payload, null, 2), "utf-8")
}

describe("policy-rules loader", () => {
  let baseDir: string

  beforeEach(() => {
    resetPolicyRulesCacheForTests()
    baseDir = mkdtempSync(join(tmpdir(), "policy-rules-"))
  })
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
    resetPolicyRulesCacheForTests()
  })

  it("returns empty arrays when no layer files exist", () => {
    const map = loadPolicyRules({ baseDir, writeCache: false })
    expect(map.get("meta")).toEqual([])
    expect(map.get("google-ads")).toEqual([])
    expect(map.get("play")).toEqual([])
  })

  it("hand-curated overrides scraped on shared id (silent)", () => {
    writeLayer(baseDir, "scraped", "meta.json", [
      makeRule({
        id: "meta-rule-shared",
        source: "scraped",
        description: "from scraper",
      }),
    ])
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({
        id: "meta-rule-shared",
        source: "hand-curated",
        description: "bro override",
      }),
    ])
    const rules = getPolicyRules("meta", { baseDir, writeCache: false })
    expect(rules).toHaveLength(1)
    expect(rules[0]!.description).toBe("bro override")
    expect(rules[0]!.source).toBe("hand-curated")
  })

  it("unions distinct ids across layers", () => {
    writeLayer(baseDir, "scraped", "meta.json", [
      makeRule({ id: "meta-rule-a", source: "scraped" }),
    ])
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-rule-b", source: "hand-curated" }),
    ])
    const rules = getPolicyRules("meta", { baseDir, writeCache: false })
    expect(rules.map((r) => r.id).sort()).toEqual(["meta-rule-a", "meta-rule-b"])
  })

  it("throws PolicyRulesLoaderError on same-layer id collision", () => {
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-dup-001", source: "hand-curated" }),
      makeRule({ id: "meta-dup-001", source: "hand-curated" }),
    ])
    expect(() => loadPolicyRules({ baseDir, writeCache: false })).toThrow(
      PolicyRulesLoaderError,
    )
  })

  it("throws on Zod validation failure (unknown severity)", () => {
    mkdirSync(join(baseDir, "hand-curated"), { recursive: true })
    writeFileSync(
      join(baseDir, "hand-curated", "meta.json"),
      JSON.stringify({
        rules: [
          {
            ...makeRule({ id: "meta-x", source: "hand-curated" }),
            severity: "fatal",
          },
        ],
      }),
      "utf-8",
    )
    expect(() => loadPolicyRules({ baseDir, writeCache: false })).toThrow(
      PolicyRulesLoaderError,
    )
  })

  it("throws when rule source-field disagrees with the layer dir", () => {
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-mismatch", source: "scraped" }),
    ])
    expect(() => loadPolicyRules({ baseDir, writeCache: false })).toThrow(
      PolicyRulesLoaderError,
    )
  })

  it("throws when a rule's platform field disagrees with its file", () => {
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({
        id: "meta-wrong-platform",
        source: "hand-curated",
        platform: "play",
      }),
    ])
    expect(() => loadPolicyRules({ baseDir, writeCache: false })).toThrow(
      PolicyRulesLoaderError,
    )
  })

  it("writes merged.cache.json when writeCache=true", () => {
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-cache-test", source: "hand-curated" }),
    ])
    refreshPolicyRules({ baseDir, writeCache: true })
    const cachePath = join(baseDir, "merged.cache.json")
    expect(existsSync(cachePath)).toBe(true)
  })

  it("caches in-memory; refresh re-reads from disk", () => {
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-v1", source: "hand-curated", description: "v1" }),
    ])
    expect(getPolicyRules("meta", { baseDir, writeCache: false })[0]!.description).toBe(
      "v1",
    )

    // Mutate disk; without refresh we still see v1.
    writeLayer(baseDir, "hand-curated", "meta.json", [
      makeRule({ id: "meta-v1", source: "hand-curated", description: "v2" }),
    ])
    expect(getPolicyRules("meta", { baseDir, writeCache: false })[0]!.description).toBe(
      "v1",
    )

    refreshPolicyRules({ baseDir, writeCache: false })
    expect(getPolicyRules("meta", { baseDir, writeCache: false })[0]!.description).toBe(
      "v2",
    )
  })

  it("throws on malformed JSON", () => {
    mkdirSync(join(baseDir, "hand-curated"), { recursive: true })
    writeFileSync(
      join(baseDir, "hand-curated", "meta.json"),
      "{not json",
      "utf-8",
    )
    expect(() => loadPolicyRules({ baseDir, writeCache: false })).toThrow(
      PolicyRulesLoaderError,
    )
  })
})

describe("policy-rules loader — real committed seed", () => {
  beforeEach(() => resetPolicyRulesCacheForTests())
  afterEach(() => resetPolicyRulesCacheForTests())

  it("loads the hand-curated seed without throwing and exercises every PolicyPattern kind", () => {
    const map = loadPolicyRules({ writeCache: false })
    const all = [
      ...(map.get("meta") ?? []),
      ...(map.get("google-ads") ?? []),
      ...(map.get("play") ?? []),
    ]
    expect(all.length).toBeGreaterThan(0)

    const kinds = new Set(all.map((r) => r.pattern.kind))
    expect(kinds).toEqual(
      new Set([
        "text-area-ratio",
        "keyword-blocklist",
        "aspect-ratio",
        "file-size-max",
        "resolution-min",
        "claim-regex",
      ]),
    )
  })

  it("getPolicyRules('meta') returns at least one rule from real seed", () => {
    const rules = getPolicyRules("meta", { writeCache: false })
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((r) => r.platform === "meta")).toBe(true)
    expect(rules.every((r) => r.source === "hand-curated")).toBe(true)
  })
})
