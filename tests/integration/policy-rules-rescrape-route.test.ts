// Phase C2 (Session #42) — /api/policy-rules HTTP integration tests.
//
// Mounts the real Hono app + drives GET /status + POST /rescrape with
// a mocked scrapeAll. Asserts the route updates settings + returns the
// expected wire shape end-to-end. Uses an in-memory sqlite per the
// saved-styles-routes pattern.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getSettingsRepo,
  initAssetStore,
} from "@/server/asset-store"
import { preloadAllTemplates } from "@/server/templates"
import {
  POLICY_RULES_LAST_SCRAPED_KEY,
  createPolicyRulesRoute,
  readPolicyRulesStatus,
} from "@/server/routes/policy-rules"
import type { ScrapeAllResult } from "@/server/services/policy-rules"

const TEST_VERSION = "0.0.0-test"

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

beforeAll(() => {
  preloadAllTemplates()
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  _resetAssetStoreForTests()
})

describe("GET /api/policy-rules/status", () => {
  it("returns isStale=true with the migration-seeded epoch lastScrapedAt on a fresh DB", async () => {
    // schema.sql seeds settings.policy_rules.lastScrapedAt =
    // '1970-01-01T00:00:00Z' so the banner pings on first boot post-
    // migration. After C2 ships there's always a row; daysSince is a
    // very large number → isStale stays true until first rescrape.
    const res = await fetchApp("/api/policy-rules/status")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      lastScrapedAt: string | null
      daysSince: number | null
      isStale: boolean
      stalenessThresholdDays: number
      perPlatform: Array<{ platform: string }>
    }
    expect(body.lastScrapedAt).toBe("1970-01-01T00:00:00Z")
    expect(body.daysSince).toBeGreaterThan(14)
    expect(body.isStale).toBe(true)
    expect(body.stalenessThresholdDays).toBe(14)
    expect(body.perPlatform.map((p) => p.platform).sort()).toEqual([
      "google-ads",
      "meta",
      "play",
    ])
  })

  it("returns isStale=false when lastScrapedAt is recent", async () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    getSettingsRepo().setString(POLICY_RULES_LAST_SCRAPED_KEY, recent)

    const res = await fetchApp("/api/policy-rules/status")
    const body = (await res.json()) as { isStale: boolean; daysSince: number | null }
    expect(body.isStale).toBe(false)
    expect(body.daysSince).toBe(1)
  })

  it("returns isStale=true when lastScrapedAt is over 14 days old", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    getSettingsRepo().setString(POLICY_RULES_LAST_SCRAPED_KEY, old)

    const res = await fetchApp("/api/policy-rules/status")
    const body = (await res.json()) as { isStale: boolean; daysSince: number | null }
    expect(body.isStale).toBe(true)
    expect(body.daysSince).toBeGreaterThanOrEqual(30)
  })

  it("reads per-platform contentHash from scraped JSON file when present", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "policy-status-"))
    try {
      mkdirSync(join(tmp, "scraped"), { recursive: true })
      writeFileSync(
        join(tmp, "scraped", "meta.json"),
        JSON.stringify({
          scrapedAt: "2026-04-25T08:00:00.000Z",
          rules: [],
          sourceUrl: "https://example.com/meta",
          contentHash: "f".repeat(64),
          contentExcerpt: "x",
        }),
        "utf-8",
      )

      // Mount a custom route bound to the tmp dir so we read its scraped/ files.
      const customRoute = createPolicyRulesRoute({
        readStatus: () => readPolicyRulesStatus({ baseDir: tmp }),
      })
      const res = await customRoute.fetch(
        new Request("http://127.0.0.1/status"),
      )
      const body = (await res.json()) as {
        perPlatform: Array<{ platform: string; contentHash: string | null }>
      }
      const meta = body.perPlatform.find((p) => p.platform === "meta")
      expect(meta?.contentHash).toBe("f".repeat(64))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe("POST /api/policy-rules/rescrape", () => {
  it("happy path: updates settings.policy_rules.lastScrapedAt + returns scrape result", async () => {
    const fakeResult: ScrapeAllResult = {
      ok: [
        {
          platform: "meta",
          scrapedAt: "2026-04-25T09:00:00.000Z",
          sourceUrl: "https://example.com/meta",
          contentHash: "a".repeat(64),
          contentExcerpt: "x",
          changedFromPrev: true,
        },
      ],
      failed: [],
      lastScrapedAt: "2026-04-25T09:00:00.000Z",
    }
    const customRoute = createPolicyRulesRoute({
      rescrape: vi.fn(async () => fakeResult),
    })

    const res = await customRoute.fetch(
      new Request("http://127.0.0.1/rescrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as ScrapeAllResult
    expect(body.lastScrapedAt).toBe("2026-04-25T09:00:00.000Z")
    expect(body.ok).toHaveLength(1)

    const stored = getSettingsRepo().getString(POLICY_RULES_LAST_SCRAPED_KEY)
    expect(stored).toBe("2026-04-25T09:00:00.000Z")
  })

  it("partial failure: settings updates to ok timestamp; failed array surfaces", async () => {
    const fakeResult: ScrapeAllResult = {
      ok: [
        {
          platform: "meta",
          scrapedAt: "2026-04-25T09:00:00.000Z",
          sourceUrl: "https://example.com/meta",
          contentHash: "a".repeat(64),
          contentExcerpt: "x",
          changedFromPrev: true,
        },
      ],
      failed: [
        { platform: "google-ads", sourceUrl: "https://example.com/g", error: "HTTP 404" },
      ],
      lastScrapedAt: "2026-04-25T09:00:00.000Z",
    }
    const customRoute = createPolicyRulesRoute({
      rescrape: vi.fn(async () => fakeResult),
    })

    const res = await customRoute.fetch(
      new Request("http://127.0.0.1/rescrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    const body = (await res.json()) as ScrapeAllResult
    expect(body.ok).toHaveLength(1)
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0]?.platform).toBe("google-ads")
    expect(getSettingsRepo().getString(POLICY_RULES_LAST_SCRAPED_KEY)).toBe(
      "2026-04-25T09:00:00.000Z",
    )
  })

  it("all-fail: settings NOT updated; lastScrapedAt remains its prior value", async () => {
    getSettingsRepo().setString(
      POLICY_RULES_LAST_SCRAPED_KEY,
      "2025-01-01T00:00:00.000Z",
    )
    const fakeResult: ScrapeAllResult = {
      ok: [],
      failed: [
        { platform: "meta", sourceUrl: "https://x", error: "HTTP 500" },
        { platform: "google-ads", sourceUrl: "https://y", error: "HTTP 500" },
        { platform: "play", sourceUrl: "https://z", error: "HTTP 500" },
      ],
      lastScrapedAt: null,
    }
    const customRoute = createPolicyRulesRoute({
      rescrape: vi.fn(async () => fakeResult),
    })

    const res = await customRoute.fetch(
      new Request("http://127.0.0.1/rescrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(200)
    expect(getSettingsRepo().getString(POLICY_RULES_LAST_SCRAPED_KEY)).toBe(
      "2025-01-01T00:00:00.000Z",
    )
  })

  it("400 on unknown platform value", async () => {
    const res = await fetchApp("/api/policy-rules/rescrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platforms: ["bogus"] }),
    })
    expect(res.status).toBe(400)
  })

  it("400 on extra unknown body field (strict)", async () => {
    const res = await fetchApp("/api/policy-rules/rescrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extra: "no" }),
    })
    expect(res.status).toBe(400)
  })

  it("subset platforms forwarded to scrapeAll", async () => {
    const rescrape = vi.fn(
      async () =>
        ({
          ok: [],
          failed: [],
          lastScrapedAt: null,
        }) as ScrapeAllResult,
    )
    const customRoute = createPolicyRulesRoute({ rescrape })
    await customRoute.fetch(
      new Request("http://127.0.0.1/rescrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platforms: ["meta"] }),
      }),
    )
    expect(rescrape).toHaveBeenCalledWith({ platforms: ["meta"] })
  })
})
