// PLAN-v3 §4.2 — Phase C2 (Session #42) policy-page scraper.
//
// Change-detection ping per Q-42.E (LOCKED): fetch each platform's
// public policy page, extract the main-content region via cheerio,
// SHA-256 hash the normalized text, and write a per-platform JSON file
// under `data/policy-rules/scraped/`. Hand-curated stays the canonical
// rule source — the scraper's job is freshness + diffability, not
// auto-extraction. When the hash differs from the prior scrape, the
// Home banner pings bro to review the diff and promote new rules into
// hand-curated/ manually.
//
// Output shape: `{scrapedAt, sourceUrl, contentHash, contentExcerpt,
// rules: []}` — `rules: []` is intentional (Q-42.E ping mode); the
// loader still merges it as a no-op against hand-curated. Schema delta
// in core/schemas/policy-rule.ts marks the metadata fields optional so
// pre-C2 fixtures keep validating.
//
// Failure mode: per-platform partial (Q-42.D LOCKED). One platform
// failing doesn't block the others; `lastScrapedAt` updates to the
// latest successful scrape. UA + 1s host delay + 30s timeout + 1
// retry on 5xx per Q-42.F.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"

import { load as loadCheerio } from "cheerio"

import { ExtractionError } from "@/core/shared/errors"
import {
  type PolicyPlatform,
  ScrapedPolicyRuleFileSchema,
} from "@/core/schemas/policy-rule"
import { ALL_POLICY_PLATFORMS, getSourcesFor } from "./sources"

export class PolicyRulesScraperError extends ExtractionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details)
    this.name = "PolicyRulesScraperError"
  }
}

export const DEFAULT_SCRAPED_DIR = resolve(
  process.cwd(),
  "data",
  "policy-rules",
  "scraped",
)

// Q-42.F LOCKED — polite UA + repo URL.
export const SCRAPER_USER_AGENT =
  "ImagesGenArt/0.1 policy-scraper " +
  "(https://github.com/thang081193-ctrl/Imgs-Gen-Art)"
export const SCRAPER_TIMEOUT_MS = 30_000
export const SCRAPER_HOST_DELAY_MS = 1_000
const EXCERPT_MAX_CHARS = 1_500

const PLATFORM_TO_FILENAME: Record<PolicyPlatform, string> = {
  meta: "meta.json",
  "google-ads": "google-ads.json",
  play: "play-aso.json",
}

export interface ScrapeResult {
  platform: PolicyPlatform
  scrapedAt: string
  sourceUrl: string
  contentHash: string
  contentExcerpt: string
  /** True when hash differs from the existing scraped file (or no prior file). */
  changedFromPrev: boolean
}

export interface ScrapeFailure {
  platform: PolicyPlatform
  sourceUrl: string
  error: string
}

export interface ScrapeAllResult {
  ok: ScrapeResult[]
  failed: ScrapeFailure[]
  /** ISO timestamp persisted to settings.policy_rules.lastScrapedAt. */
  lastScrapedAt: string | null
}

export type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface ScrapePlatformOptions {
  baseDir?: string
  fetchImpl?: FetchFn
  /** Override for tests — skip the inter-host delay between scrapes. */
  hostDelayMs?: number
  /** Override for tests — wall-clock for `scrapedAt`. */
  now?: () => Date
}

export interface ScrapeAllOptions extends ScrapePlatformOptions {
  /** Subset of platforms to scrape; default = all 3. */
  platforms?: PolicyPlatform[]
}

const defaultFetch: FetchFn = (url, init) => fetch(url, init)

export async function scrapePlatform(
  platform: PolicyPlatform,
  options: ScrapePlatformOptions = {},
): Promise<ScrapeResult> {
  const sources = getSourcesFor(platform)
  if (sources.length === 0) {
    throw new PolicyRulesScraperError(
      `no sources configured for platform "${platform}"`,
      { platform },
    )
  }
  const baseDir = options.baseDir ?? DEFAULT_SCRAPED_DIR
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const now = options.now ?? (() => new Date())

  // v2 ships 1 source/platform — use the first; future multi-source extends here.
  const source = sources[0]!

  const html = await fetchHtmlWithRetry(source.url, fetchImpl)
  const text = extractText(html, source.contentSelector)
  const contentHash = sha256Hex(text)
  const contentExcerpt = text.slice(0, EXCERPT_MAX_CHARS)
  const scrapedAt = now().toISOString()

  const path = join(baseDir, PLATFORM_TO_FILENAME[platform])
  const prevHash = readPrevHash(path)
  const changedFromPrev = prevHash !== contentHash

  writeScrapedFile(path, {
    scrapedAt,
    sourceUrl: source.url,
    contentHash,
    contentExcerpt,
    rules: [],
  })

  return {
    platform,
    scrapedAt,
    sourceUrl: source.url,
    contentHash,
    contentExcerpt,
    changedFromPrev,
  }
}

export async function scrapeAll(
  options: ScrapeAllOptions = {},
): Promise<ScrapeAllResult> {
  const platforms = options.platforms ?? ALL_POLICY_PLATFORMS
  const hostDelayMs = options.hostDelayMs ?? SCRAPER_HOST_DELAY_MS
  const ok: ScrapeResult[] = []
  const failed: ScrapeFailure[] = []

  // Sequential with 1s spacing per Q-42.F. v2's 3 hosts are distinct so
  // strictly we could parallelize, but a uniform delay keeps the polite
  // contract honest if the source list grows on the same host later.
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i]!
    if (i > 0 && hostDelayMs > 0) await sleep(hostDelayMs)
    try {
      ok.push(await scrapePlatform(platform, options))
    } catch (err) {
      const sources = getSourcesFor(platform)
      failed.push({
        platform,
        sourceUrl: sources[0]?.url ?? "",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Q-42.D LOCKED — `lastScrapedAt` = latest *successful* platform timestamp.
  // If all 3 fail, leave it untouched (caller decides whether to clear).
  const lastScrapedAt =
    ok.length === 0
      ? null
      : ok.reduce(
          (max, r) => (r.scrapedAt > max ? r.scrapedAt : max),
          ok[0]!.scrapedAt,
        )

  return { ok, failed, lastScrapedAt }
}

async function fetchHtmlWithRetry(url: string, fetchImpl: FetchFn): Promise<string> {
  let lastErr: unknown = null
  // Q-42.F: 1 retry on 5xx, no retry on 4xx, no retry on network error
  // (network errors are usually persistent — retry-on-network would mask
  // a misconfigured proxy or offline state behind a 30s timeout × 2).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS),
        headers: { "user-agent": SCRAPER_USER_AGENT },
      })
      if (res.ok) return await res.text()
      if (res.status >= 400 && res.status < 500) {
        throw new PolicyRulesScraperError(`HTTP ${res.status} for ${url}`, {
          url,
          status: res.status,
        })
      }
      // 5xx — retry once
      lastErr = new PolicyRulesScraperError(
        `HTTP ${res.status} for ${url} (attempt ${attempt + 1})`,
        { url, status: res.status, attempt },
      )
    } catch (err) {
      // 4xx already threw with a useful message; bubble it up immediately.
      if (err instanceof PolicyRulesScraperError) throw err
      lastErr = err
      break // network/timeout: don't retry
    }
  }
  throw new PolicyRulesScraperError(
    `fetch failed for ${url}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
    { url },
  )
}

function extractText(html: string, selector: string): string {
  const $ = loadCheerio(html)
  const node = $(selector).first()
  // Fall back to <body> if the selector doesn't match — preserves a
  // non-empty hash so a layout flip (e.g. removed `<main>`) flips the
  // hash + pings bro to investigate, rather than crashing the scrape.
  const region = node.length > 0 ? node : $("body")
  return normalizeWhitespace(region.text())
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

function readPrevHash(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const result = ScrapedPolicyRuleFileSchema.safeParse(parsed)
    return result.success ? result.data.contentHash ?? null : null
  } catch {
    // Malformed prior file → treat as no prior hash so the scrape replaces it.
    return null
  }
}

function writeScrapedFile(
  path: string,
  payload: {
    scrapedAt: string
    sourceUrl: string
    contentHash: string
    contentExcerpt: string
    rules: never[]
  },
): void {
  const dir = path.replace(/[/\\][^/\\]+$/, "")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Validate before writing so a bug in this module surfaces here instead
  // of corrupting the on-disk file the loader will trust on next boot.
  ScrapedPolicyRuleFileSchema.parse(payload)
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8")
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
