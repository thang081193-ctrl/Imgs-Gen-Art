// PLAN-v3 §4.2 — Phase C2 (Session #42) scraper tests.
//
// Fixture-fed (Q-42.K LOCKED): 3 committed HTML snippets under
// tests/fixtures/policy-rules/. fetch is replaced with an in-memory
// stub so tests are deterministic and offline. Coverage:
//   - hash stability across two fetches of the same body
//   - change detection: prior file's hash mismatch flips changedFromPrev
//   - selector narrowing: header/footer text excluded from the hash
//   - partial success: meta ok + google-ads 404 → ok=[meta], failed=[google-ads]
//   - 5xx retry path (1 retry, second attempt succeeds)
//   - 4xx no-retry (single fetch then PolicyRulesScraperError)
//   - lastScrapedAt = latest successful timestamp

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PolicyRulesScraperError,
  scrapeAll,
  scrapePlatform,
  type FetchFn,
} from "@/server/services/policy-rules"
import { POLICY_SOURCES } from "@/server/services/policy-rules/sources"
import { ScrapedPolicyRuleFileSchema } from "@/core/schemas/policy-rule"

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/policy-rules")
const META_HTML = readFileSync(join(FIXTURE_DIR, "meta.html"), "utf-8")
const GOOGLE_HTML = readFileSync(join(FIXTURE_DIR, "google-ads.html"), "utf-8")
const PLAY_HTML = readFileSync(join(FIXTURE_DIR, "play.html"), "utf-8")

function htmlResponse(body: string, status = 200): {
  ok: boolean
  status: number
  text(): Promise<string>
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  }
}

function makeFetch(
  routes: Record<string, () => ReturnType<typeof htmlResponse>>,
): FetchFn {
  return async (url) => {
    const handler = routes[url]
    if (!handler) throw new Error(`unexpected URL ${url}`)
    return handler()
  }
}

let baseDir: string

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "policy-scraper-"))
})

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true })
})

describe("scrapePlatform", () => {
  it("hashes stable: two fetches of same HTML yield identical contentHash", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    const fetchImpl = makeFetch({ [url]: () => htmlResponse(META_HTML) })

    const a = await scrapePlatform("meta", { baseDir, fetchImpl, hostDelayMs: 0 })
    const b = await scrapePlatform("meta", { baseDir, fetchImpl, hostDelayMs: 0 })

    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(b.contentHash).toBe(a.contentHash)
  })

  it("change detection: different HTML flips changedFromPrev=true", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    const fetchA = makeFetch({ [url]: () => htmlResponse(META_HTML) })
    const fetchB = makeFetch({ [url]: () => htmlResponse(GOOGLE_HTML) })

    const a = await scrapePlatform("meta", { baseDir, fetchImpl: fetchA, hostDelayMs: 0 })
    expect(a.changedFromPrev).toBe(true)

    const same = await scrapePlatform("meta", { baseDir, fetchImpl: fetchA, hostDelayMs: 0 })
    expect(same.changedFromPrev).toBe(false)

    const flipped = await scrapePlatform("meta", { baseDir, fetchImpl: fetchB, hostDelayMs: 0 })
    expect(flipped.changedFromPrev).toBe(true)
    expect(flipped.contentHash).not.toBe(a.contentHash)
  })

  it("selector narrowing: header/footer text excluded from hash", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    const fetchA = makeFetch({ [url]: () => htmlResponse(META_HTML) })
    const noisy = META_HTML.replace(
      "<header>Header noise that should NOT enter the hash.</header>",
      "<header>Totally different header noise.</header>",
    ).replace(
      "<footer>Footer noise — also stripped by the `main` selector.</footer>",
      "<footer>Different footer noise.</footer>",
    )
    const fetchB = makeFetch({ [url]: () => htmlResponse(noisy) })

    const a = await scrapePlatform("meta", { baseDir, fetchImpl: fetchA, hostDelayMs: 0 })
    // Wipe prior file so prevHash isn't carried over from `a`.
    rmSync(join(baseDir, "meta.json"), { force: true })
    const b = await scrapePlatform("meta", { baseDir, fetchImpl: fetchB, hostDelayMs: 0 })
    expect(b.contentHash).toBe(a.contentHash)
  })

  it("writes a schema-valid scraped file with sourceUrl + contentHash + excerpt", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    const fetchImpl = makeFetch({ [url]: () => htmlResponse(META_HTML) })
    await scrapePlatform("meta", { baseDir, fetchImpl, hostDelayMs: 0 })

    const path = join(baseDir, "meta.json")
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown
    const result = ScrapedPolicyRuleFileSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sourceUrl).toBe(url)
      expect(result.data.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(result.data.contentExcerpt).toContain("Text in Ad Images")
      expect(result.data.rules).toEqual([])
    }
  })

  it("retries once on 5xx then succeeds", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    let calls = 0
    const fetchImpl: FetchFn = async () => {
      calls++
      if (calls === 1) return htmlResponse("server boom", 503)
      return htmlResponse(META_HTML, 200)
    }
    const result = await scrapePlatform("meta", {
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
    })
    expect(calls).toBe(2)
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("does NOT retry on 4xx — first response throws", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    let calls = 0
    const fetchImpl: FetchFn = async () => {
      calls++
      return htmlResponse("nope", 404)
    }
    await expect(
      scrapePlatform("meta", { baseDir, fetchImpl, hostDelayMs: 0 }),
    ).rejects.toBeInstanceOf(PolicyRulesScraperError)
    expect(calls).toBe(1)
  })

  it("uses now() override for deterministic scrapedAt", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    const fixed = new Date("2026-04-25T08:00:00.000Z")
    const fetchImpl = makeFetch({ [url]: () => htmlResponse(META_HTML) })
    const result = await scrapePlatform("meta", {
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
      now: () => fixed,
    })
    expect(result.scrapedAt).toBe(fixed.toISOString())
  })

  it("falls back to <body> when selector misses, still produces a hash", async () => {
    // Replace `main` with a div the selector doesn't target.
    const noMain = META_HTML.replace(/<main>/g, "<div>").replace(/<\/main>/g, "</div>")
    const url = POLICY_SOURCES.meta[0]!.url
    const fetchImpl = makeFetch({ [url]: () => htmlResponse(noMain) })
    const result = await scrapePlatform("meta", {
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
    })
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    // Body fallback includes the header/footer text now.
    expect(result.contentExcerpt).toContain("Header noise")
  })

  it("treats malformed prior file as no prevHash (changedFromPrev=true)", async () => {
    const url = POLICY_SOURCES.meta[0]!.url
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, "meta.json"), "{ not valid json", "utf-8")
    const fetchImpl = makeFetch({ [url]: () => htmlResponse(META_HTML) })
    const result = await scrapePlatform("meta", {
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
    })
    expect(result.changedFromPrev).toBe(true)
  })
})

describe("scrapeAll", () => {
  it("partial success: meta ok + google-ads 404 + play ok", async () => {
    const fetchImpl: FetchFn = async (url) => {
      if (url === POLICY_SOURCES.meta[0]!.url) return htmlResponse(META_HTML)
      if (url === POLICY_SOURCES["google-ads"][0]!.url) return htmlResponse("nope", 404)
      if (url === POLICY_SOURCES.play[0]!.url) return htmlResponse(PLAY_HTML)
      throw new Error(`unexpected URL ${url}`)
    }
    const fixed = new Date("2026-04-25T08:00:00.000Z")
    const result = await scrapeAll({
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
      now: () => fixed,
    })

    expect(result.ok.map((r) => r.platform).sort()).toEqual(["meta", "play"])
    expect(result.failed.map((f) => f.platform)).toEqual(["google-ads"])
    expect(result.lastScrapedAt).toBe(fixed.toISOString())
    // google-ads.json was never written.
    expect(existsSync(join(baseDir, "google-ads.json"))).toBe(false)
  })

  it("all-fail leaves lastScrapedAt null", async () => {
    const fetchImpl: FetchFn = async () => htmlResponse("nope", 404)
    const result = await scrapeAll({ baseDir, fetchImpl, hostDelayMs: 0 })
    expect(result.ok).toEqual([])
    expect(result.failed).toHaveLength(3)
    expect(result.lastScrapedAt).toBeNull()
  })

  it("subset filter: only meta scraped when platforms=['meta']", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(POLICY_SOURCES.meta[0]!.url)
      return htmlResponse(META_HTML)
    })
    const result = await scrapeAll({
      baseDir,
      fetchImpl: fetchImpl as unknown as FetchFn,
      hostDelayMs: 0,
      platforms: ["meta"],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
  })

  it("lastScrapedAt = latest successful timestamp across platforms", async () => {
    let i = 0
    const stamps = [
      "2026-04-25T08:00:00.000Z",
      "2026-04-25T08:00:01.000Z",
      "2026-04-25T08:00:02.000Z",
    ]
    const fetchImpl: FetchFn = async (url) => {
      if (url === POLICY_SOURCES.meta[0]!.url) return htmlResponse(META_HTML)
      if (url === POLICY_SOURCES["google-ads"][0]!.url) return htmlResponse(GOOGLE_HTML)
      if (url === POLICY_SOURCES.play[0]!.url) return htmlResponse(PLAY_HTML)
      throw new Error(`unexpected URL ${url}`)
    }
    const result = await scrapeAll({
      baseDir,
      fetchImpl,
      hostDelayMs: 0,
      now: () => new Date(stamps[i++ % stamps.length]!),
    })
    expect(result.ok).toHaveLength(3)
    expect(result.lastScrapedAt).toBe(stamps[2])
  })
})
