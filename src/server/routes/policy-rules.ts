// PLAN-v3 §4.4 — /api/policy-rules routes (Phase C2, Session #42).
//
// Two endpoints powering the Home freshness banner + manual rescrape:
//   GET  /status     → { lastScrapedAt, daysSince, isStale, perPlatform[] }
//   POST /rescrape   → triggers scrapeAll, updates settings, refreshes
//                      the merged-rules cache so hot consumers pick
//                      up the new scraped files.
//
// `lastScrapedAt` lives in the `settings` table under
// `policy_rules.lastScrapedAt`; bootstrap migration seeds it to
// `1970-01-01T00:00:00Z` so the banner pings on first boot.

import { Hono } from "hono"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { ScrapedPolicyRuleFileSchema } from "@/core/schemas/policy-rule"
import type { PolicyPlatform } from "@/core/schemas/policy-rule"
import { getSettingsRepo } from "@/server/asset-store"
import { validateBody } from "@/server/middleware/validator"
import {
  ALL_POLICY_PLATFORMS,
  DEFAULT_POLICY_RULES_DIR,
  refreshPolicyRules,
  scrapeAll,
  type ScrapeAllResult,
} from "@/server/services/policy-rules"
import {
  RescrapePolicyRulesBodySchema,
  type RescrapePolicyRulesBody,
} from "./policy-rules.body"

export const POLICY_RULES_LAST_SCRAPED_KEY = "policy_rules.lastScrapedAt"
export const POLICY_RULES_STALENESS_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

const PLATFORM_FILENAME: Record<PolicyPlatform, string> = {
  meta: "meta.json",
  "google-ads": "google-ads.json",
  play: "play-aso.json",
}

export interface PerPlatformStatus {
  platform: PolicyPlatform
  scrapedAt: string | null
  contentHash: string | null
  sourceUrl: string | null
}

export interface PolicyRulesStatus {
  lastScrapedAt: string | null
  daysSince: number | null
  stalenessThresholdDays: number
  isStale: boolean
  perPlatform: PerPlatformStatus[]
}

export interface PolicyRulesStatusOptions {
  baseDir?: string
  now?: () => Date
}

export function readPolicyRulesStatus(
  options: PolicyRulesStatusOptions = {},
): PolicyRulesStatus {
  const baseDir = options.baseDir ?? DEFAULT_POLICY_RULES_DIR
  const now = options.now ?? (() => new Date())
  const lastScrapedAt = getSettingsRepo().getString(
    POLICY_RULES_LAST_SCRAPED_KEY,
  )

  const daysSince = computeDaysSince(lastScrapedAt, now())
  // `daysSince === null` (no setting row yet) → still stale so the banner
  // pings on a fresh DB. Threshold is 14 days per PLAN-v3 §4.4.
  const isStale =
    daysSince === null || daysSince >= POLICY_RULES_STALENESS_DAYS

  const perPlatform: PerPlatformStatus[] = ALL_POLICY_PLATFORMS.map(
    (platform) => readPerPlatform(platform, baseDir),
  )

  return {
    lastScrapedAt,
    daysSince,
    stalenessThresholdDays: POLICY_RULES_STALENESS_DAYS,
    isStale,
    perPlatform,
  }
}

function readPerPlatform(
  platform: PolicyPlatform,
  baseDir: string,
): PerPlatformStatus {
  const path = join(baseDir, "scraped", PLATFORM_FILENAME[platform])
  if (!existsSync(path)) {
    return { platform, scrapedAt: null, contentHash: null, sourceUrl: null }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown
    const result = ScrapedPolicyRuleFileSchema.safeParse(parsed)
    if (!result.success) {
      return { platform, scrapedAt: null, contentHash: null, sourceUrl: null }
    }
    return {
      platform,
      scrapedAt: result.data.scrapedAt,
      contentHash: result.data.contentHash ?? null,
      sourceUrl: result.data.sourceUrl ?? null,
    }
  } catch {
    return { platform, scrapedAt: null, contentHash: null, sourceUrl: null }
  }
}

function computeDaysSince(iso: string | null, now: Date): number | null {
  if (iso === null) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diffMs = now.getTime() - t
  // Negative (clock skew) → 0 so the banner doesn't go negative.
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY))
}

type PolicyRulesEnv = {
  Variables: { validatedBody: RescrapePolicyRulesBody }
}

export interface RescrapeFn {
  (
    body: RescrapePolicyRulesBody,
  ): Promise<ScrapeAllResult>
}

export interface CreatePolicyRulesRouteOptions {
  /** Override scraper for tests — defaults to the real `scrapeAll`. */
  rescrape?: RescrapeFn
  /** Override status reader for tests. */
  readStatus?: () => PolicyRulesStatus
}

const defaultRescrape: RescrapeFn = (body) =>
  scrapeAll(body.platforms ? { platforms: body.platforms } : {})

export function createPolicyRulesRoute(
  options: CreatePolicyRulesRouteOptions = {},
): Hono<PolicyRulesEnv> {
  const route = new Hono<PolicyRulesEnv>()
  const rescrape = options.rescrape ?? defaultRescrape
  const readStatus = options.readStatus ?? (() => readPolicyRulesStatus())

  route.get("/status", (c) => c.json(readStatus()))

  route.post(
    "/rescrape",
    validateBody(RescrapePolicyRulesBodySchema),
    async (c) => {
      const body = c.get("validatedBody") as RescrapePolicyRulesBody
      const result = await rescrape(body)
      if (result.lastScrapedAt) {
        getSettingsRepo().setString(
          POLICY_RULES_LAST_SCRAPED_KEY,
          result.lastScrapedAt,
        )
        // Refresh merged cache so hot consumers see the new scraped files.
        // Best-effort: a loader error here is rare (the scraper's own
        // schema check guards malformed writes) and would already throw
        // 500 via the route's onError.
        refreshPolicyRules()
      }
      return c.json(result)
    },
  )

  return route
}
