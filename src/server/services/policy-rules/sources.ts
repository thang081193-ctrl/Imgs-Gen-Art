// PLAN-v3 §4.2 — Phase C2 (Session #42) policy-source registry.
//
// Per-platform list of upstream policy URLs the scraper hits. v2 ships
// 1 URL per platform (Q-42.B); future platforms or extra pages extend
// the array. Selectors target the page's main content region so header/
// nav churn doesn't trigger false-positive change pings (Q-42.C).
//
// Adding a source: append a `PolicyScrapeSource` with a unique `label` (used
// in logs + the freshness ping panel). Default selector is `main` —
// override per-source if the page wraps policy text in a different tag.

import type { PolicyPlatform } from "@/core/schemas/policy-rule"

export interface PolicyScrapeSource {
  /** Stable kebab-case identifier — used in scraper output filename + logs. */
  label: string
  url: string
  /**
   * CSS selector for the policy text region. cheerio's first match wins.
   * Default `main` works for most help-center pages; override when
   * upstream wraps the content in a custom class/role. Keep narrow so
   * header/footer/nav churn doesn't trigger false-positive change pings.
   */
  contentSelector: string
}

// Q-42.B (LOCKED 2026-04-25): 3 pre-filled URLs accepted. Em sẽ
// sanity-check Meta redirect khi fire — capture canonical URL into
// fixture if it 30x's. Selectors default to `main`; tune per-platform
// during the first real scrape if any selector doesn't bracket the
// policy text cleanly.
export const POLICY_SOURCES: Record<PolicyPlatform, PolicyScrapeSource[]> = {
  meta: [
    {
      label: "meta-text-overlay-20pct",
      url: "https://www.facebook.com/business/help/980593475366490",
      contentSelector: "main",
    },
  ],
  "google-ads": [
    {
      label: "google-ads-prohibited-content",
      url: "https://support.google.com/adspolicy/answer/6008942",
      contentSelector: "main",
    },
  ],
  play: [
    {
      label: "play-graphic-asset-specs",
      url: "https://support.google.com/googleplay/android-developer/answer/9866151",
      contentSelector: "main",
    },
  ],
}

export const ALL_POLICY_PLATFORMS: PolicyPlatform[] = Object.keys(
  POLICY_SOURCES,
) as PolicyPlatform[]

export function getSourcesFor(platform: PolicyPlatform): PolicyScrapeSource[] {
  return POLICY_SOURCES[platform] ?? []
}
