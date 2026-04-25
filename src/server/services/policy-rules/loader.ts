// PLAN-v3 §4.2 — policy-rule loader + merger (Phase C1, Session #41).
//
// Reads `data/policy-rules/{scraped,hand-curated}/<file>.json`, validates
// each file via Zod, then merges per platform: hand-curated wins on `id`
// collision (silent), same-layer collisions throw at load time (Q-41.H).
// Lazy on first `getPolicyRules` call (Q-41.J) — boot is not blocked.
// In-memory cache with explicit `refreshPolicyRules` (Q-41.I).
//
// `merged.cache.json` is written after every successful merge so external
// tools (lint, future CI) can read without re-running this loader. It is
// gitignored (Q-41.E) since it's a derived artefact.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { ExtractionError } from "@/core/shared/errors"
import {
  HandCuratedPolicyRuleFileSchema,
  type PolicyPlatform,
  type PolicyRule,
  PolicyRuleSchema,
  ScrapedPolicyRuleFileSchema,
} from "@/core/schemas/policy-rule"

export class PolicyRulesLoaderError extends ExtractionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details)
    this.name = "PolicyRulesLoaderError"
  }
}

export const DEFAULT_POLICY_RULES_DIR = resolve(
  process.cwd(),
  "data",
  "policy-rules",
)

// File-name-on-disk per platform. `play` maps to `play-aso.json` to mirror
// the lane terminology used in PLAN-v3 §6 (Play store ASO).
const PLATFORM_TO_FILENAME: Record<PolicyPlatform, string> = {
  meta: "meta.json",
  "google-ads": "google-ads.json",
  play: "play-aso.json",
}

const ALL_PLATFORMS = Object.keys(PLATFORM_TO_FILENAME) as PolicyPlatform[]

export interface PolicyRulesLoaderOptions {
  /** Override base dir (tests). Defaults to `./data/policy-rules/`. */
  baseDir?: string
  /**
   * If false, skip writing `merged.cache.json` (tests using a tmp dir set
   * this so the cache isn't littered into the test's temp tree, unless
   * the test explicitly asserts on it).
   */
  writeCache?: boolean
}

interface PolicyRulesCache {
  byPlatform: Map<PolicyPlatform, PolicyRule[]>
  generatedAt: string
}

let cache: PolicyRulesCache | null = null

export function refreshPolicyRules(
  options: PolicyRulesLoaderOptions = {},
): PolicyRulesCache {
  const baseDir = options.baseDir ?? DEFAULT_POLICY_RULES_DIR
  const writeCache = options.writeCache ?? true

  const byPlatform = new Map<PolicyPlatform, PolicyRule[]>()
  for (const platform of ALL_PLATFORMS) {
    byPlatform.set(platform, mergePlatform(platform, baseDir))
  }

  const generatedAt = new Date().toISOString()
  cache = { byPlatform, generatedAt }

  if (writeCache) writeMergedCache(baseDir, cache)
  return cache
}

export function loadPolicyRules(
  options: PolicyRulesLoaderOptions = {},
): Map<PolicyPlatform, PolicyRule[]> {
  if (cache === null) refreshPolicyRules(options)
  return cache!.byPlatform
}

export function getPolicyRules(
  platform: PolicyPlatform,
  options: PolicyRulesLoaderOptions = {},
): PolicyRule[] {
  return loadPolicyRules(options).get(platform) ?? []
}

/** Test-only: drop the in-memory cache so the next call re-reads from disk. */
export function resetPolicyRulesCacheForTests(): void {
  cache = null
}

function mergePlatform(
  platform: PolicyPlatform,
  baseDir: string,
): PolicyRule[] {
  const filename = PLATFORM_TO_FILENAME[platform]
  const scraped = readScrapedLayer(join(baseDir, "scraped", filename))
  const handCurated = readHandCuratedLayer(
    join(baseDir, "hand-curated", filename),
  )

  // Hand-curated overrides scraped on shared `id`; otherwise union.
  const merged = new Map<string, PolicyRule>()
  for (const rule of scraped) merged.set(rule.id, rule)
  for (const rule of handCurated) merged.set(rule.id, rule)

  for (const rule of merged.values()) {
    if (rule.platform !== platform) {
      throw new PolicyRulesLoaderError(
        `policy rule "${rule.id}" declares platform "${rule.platform}" ` +
          `but lives in ${platform} file`,
        { ruleId: rule.id, expected: platform, actual: rule.platform },
      )
    }
  }
  return [...merged.values()]
}

function readScrapedLayer(path: string): PolicyRule[] {
  if (!existsSync(path)) return []
  const parsed = parseJsonFile(path)
  const result = ScrapedPolicyRuleFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new PolicyRulesLoaderError(
      `scraped policy file failed schema validation: ${path}`,
      { path, issues: result.error.issues },
    )
  }
  for (const rule of result.data.rules) assertSourceMatches(rule, "scraped", path)
  assertNoSameLayerCollisions(result.data.rules, path, "scraped")
  return result.data.rules
}

function readHandCuratedLayer(path: string): PolicyRule[] {
  if (!existsSync(path)) return []
  const parsed = parseJsonFile(path)
  const result = HandCuratedPolicyRuleFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new PolicyRulesLoaderError(
      `hand-curated policy file failed schema validation: ${path}`,
      { path, issues: result.error.issues },
    )
  }
  for (const rule of result.data.rules) {
    assertSourceMatches(rule, "hand-curated", path)
  }
  assertNoSameLayerCollisions(result.data.rules, path, "hand-curated")
  return result.data.rules
}

function parseJsonFile(path: string): unknown {
  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (err) {
    throw new PolicyRulesLoaderError(`failed to read policy file: ${path}`, {
      path,
      cause: err instanceof Error ? err.message : String(err),
    })
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new PolicyRulesLoaderError(
      `policy file is not valid JSON: ${path}`,
      { path, cause: err instanceof Error ? err.message : String(err) },
    )
  }
}

function assertSourceMatches(
  rule: PolicyRule,
  expected: "scraped" | "hand-curated",
  path: string,
): void {
  if (rule.source !== expected) {
    throw new PolicyRulesLoaderError(
      `rule "${rule.id}" in ${path} declares source "${rule.source}" ` +
        `but file is in ${expected} layer`,
      { ruleId: rule.id, expected, actual: rule.source, path },
    )
  }
}

function assertNoSameLayerCollisions(
  rules: PolicyRule[],
  path: string,
  layer: "scraped" | "hand-curated",
): void {
  const seen = new Set<string>()
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      throw new PolicyRulesLoaderError(
        `duplicate rule id "${rule.id}" in ${layer} layer (${path})`,
        { ruleId: rule.id, layer, path },
      )
    }
    seen.add(rule.id)
  }
}

function writeMergedCache(baseDir: string, snapshot: PolicyRulesCache): void {
  try {
    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
    const payload = {
      generatedAt: snapshot.generatedAt,
      byPlatform: Object.fromEntries(
        [...snapshot.byPlatform.entries()].map(([platform, rules]) => [
          platform,
          rules,
        ]),
      ),
    }
    writeFileSync(
      join(baseDir, "merged.cache.json"),
      JSON.stringify(payload, null, 2),
      "utf-8",
    )
  } catch (err) {
    // Cache is a best-effort artefact; if disk write fails (read-only FS,
    // permission), keep the in-memory cache and let callers proceed.
    // Surface a single warning so it doesn't go unnoticed in dev.
    // eslint-disable-next-line no-console
    console.warn(
      `[policy-rules] failed to write merged.cache.json: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

// Re-export for convenience so consumers don't need a separate schema import.
export { PolicyRuleSchema }
