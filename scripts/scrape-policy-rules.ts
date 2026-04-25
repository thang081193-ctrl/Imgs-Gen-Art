/**
 * scripts/scrape-policy-rules.ts — Phase C2 (Session #42) CLI entry.
 *
 * Calls the same `scrapeAll()` the HTTP route fires; useful for cron
 * (Q-42.J LOCKED) or a quick manual pulse outside the dev server.
 * Updates `settings.policy_rules.lastScrapedAt` on at-least-one-success
 * so the Home banner clears.
 *
 * Usage:
 *   npm run scrape-policy-rules
 *   npm run scrape-policy-rules -- --platforms=meta,google-ads
 *
 * Exit codes:
 *   0 — at least one platform scraped successfully
 *   1 — all configured platforms failed (network, 4xx, etc.)
 *   2 — config error (e.g. unknown --platforms value)
 */

import { initAssetStore, getSettingsRepo } from "@/server/asset-store"
import {
  ALL_POLICY_PLATFORMS,
  scrapeAll,
  type PolicyPlatform,
} from "@/server/services/policy-rules"
import { POLICY_RULES_LAST_SCRAPED_KEY } from "@/server/routes/policy-rules"

function parsePlatforms(arg: string | undefined): PolicyPlatform[] | null {
  if (!arg) return null
  const parts = arg.split(",").map((s) => s.trim()).filter(Boolean)
  for (const p of parts) {
    if (!(ALL_POLICY_PLATFORMS as string[]).includes(p)) {
      console.error(
        `[scrape-policy-rules] unknown platform "${p}". ` +
          `Allowed: ${ALL_POLICY_PLATFORMS.join(", ")}`,
      )
      process.exit(2)
    }
  }
  return parts as PolicyPlatform[]
}

async function main(): Promise<void> {
  const platformsArg = process.argv
    .find((a) => a.startsWith("--platforms="))
    ?.slice("--platforms=".length)
  const platforms = parsePlatforms(platformsArg)

  initAssetStore()
  const result = await scrapeAll(platforms ? { platforms } : {})

  for (const ok of result.ok) {
    console.log(
      `[scrape-policy-rules] ok ${ok.platform} ` +
        `hash=${ok.contentHash.slice(0, 12)} ` +
        `${ok.changedFromPrev ? "CHANGED" : "unchanged"}`,
    )
  }
  for (const fail of result.failed) {
    console.error(
      `[scrape-policy-rules] FAIL ${fail.platform} (${fail.sourceUrl}): ${fail.error}`,
    )
  }

  if (result.lastScrapedAt) {
    getSettingsRepo().setString(
      POLICY_RULES_LAST_SCRAPED_KEY,
      result.lastScrapedAt,
    )
  }

  process.exit(result.ok.length > 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("[scrape-policy-rules] fatal:", err)
  process.exit(1)
})
