// Session #17 Step 9 — Rule 11 tripwire.
//
// Walks a HAND-MAINTAINED list of GET/POST routes (`AUDIT_TARGETS`) and
// asserts every JSON response is free of BANNED_KEYS (imported from
// dto-filter so the middleware + this test use the SAME set — zero drift).
//
// Hand-maintained list > auto-discover: adding a new route is a deliberate
// act; forcing the author to also add a row here (and rerun the test) is
// the point. Rejected (A) Hono route registry walk (over-scoped, catches
// MCP-style "not a public surface" routes), and (B) no-audit (the production
// middleware already scans in dev but production skips — this test is our
// compile-time guarantee the middleware WOULD catch a leak if it ran).
//
// CONTRIBUTING Rule 11 amendment (Session #17): adding any route that
// returns JSON requires adding an AUDIT_TARGETS entry here.

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getProfileAssetsRepo,
  initAssetStore,
} from "@/server/asset-store/context"
import { BANNED_KEYS } from "@/server/middleware/dto-filter"
import { preloadAllTemplates } from "@/server/templates"

const TEST_VERSION = "0.0.0-test"
let tmpRoot: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

// Walk an arbitrary JSON tree and return the first banned key path, or null.
// Mirrors dto-filter's scanner but lives here so this test has zero implicit
// dependency on middleware internals.
function findBannedKey(node: unknown, path = "$"): string | null {
  if (node === null || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = findBannedKey(node[i], `${path}[${i}]`)
      if (found !== null) return found
    }
    return null
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (BANNED_KEYS.has(key)) return `${path}.${key}`
    const found = findBannedKey(value, `${path}.${key}`)
    if (found !== null) return found
  }
  return null
}

async function expectCleanJson(res: Response, label: string): Promise<void> {
  const ct = res.headers.get("Content-Type") ?? ""
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error(`[${label}] expected JSON response, got Content-Type='${ct}' (status ${res.status})`)
  }
  const body: unknown = await res.json()
  const bannedPath = findBannedKey(body)
  if (bannedPath !== null) {
    throw new Error(
      `[${label}] DTO leak: response contains banned key at ${bannedPath}. Body: ${JSON.stringify(body).slice(0, 500)}`,
    )
  }
}

// Hand-maintained registry. Adding a new route ⇒ add row here.
// GET routes have no body; POST routes include a minimal valid body or
// expect a 4xx/5xx status that still returns JSON.
interface AuditTarget {
  label: string
  method: "GET" | "POST"
  path: string
  body?: unknown
  expectStatus?: number // optional — defaults to accepting any 2xx/4xx JSON
}

const AUDIT_TARGETS: readonly AuditTarget[] = [
  // Health
  { label: "GET /api/health", method: "GET", path: "/api/health" },
  // Providers
  { label: "GET /api/providers", method: "GET", path: "/api/providers" },
  { label: "GET /api/providers/compatibility", method: "GET", path: "/api/providers/compatibility" },
  { label: "GET /api/providers/health", method: "GET", path: "/api/providers/health" },
  { label: "GET /api/providers/health?provider=mock", method: "GET", path: "/api/providers/health?provider=mock" },
  { label: "GET /api/providers/health?provider=mock&model=mock-fast", method: "GET", path: "/api/providers/health?provider=mock&model=mock-fast" },
  // Profiles
  { label: "GET /api/profiles", method: "GET", path: "/api/profiles" },
  { label: "GET /api/profiles/chartlens", method: "GET", path: "/api/profiles/chartlens" },
  { label: "GET /api/profiles/unknown-id → 404 JSON", method: "GET", path: "/api/profiles/does-not-exist" },
  // Tags
  { label: "GET /api/tags", method: "GET", path: "/api/tags" },
  // Profile-assets — seeded `pa_audit` (kind=logo); /file endpoint streams
  // binary, so we only audit the 404 JSON path for consistency. The file
  // endpoint itself returns image bytes, not a JSON envelope.
  { label: "GET /api/profile-assets/unknown/file → 404 JSON", method: "GET", path: "/api/profile-assets/pa_unknown/file" },
  // Templates
  { label: "GET /api/templates/artwork-groups", method: "GET", path: "/api/templates/artwork-groups" },
  { label: "GET /api/templates/ad-layouts", method: "GET", path: "/api/templates/ad-layouts" },
  { label: "GET /api/templates/country-profiles", method: "GET", path: "/api/templates/country-profiles" },
  { label: "GET /api/templates/style-dna", method: "GET", path: "/api/templates/style-dna" },
  { label: "GET /api/templates/i18n", method: "GET", path: "/api/templates/i18n" },
  { label: "GET /api/templates/copy", method: "GET", path: "/api/templates/copy" },
  // Keys
  { label: "GET /api/keys", method: "GET", path: "/api/keys" },
  // Assets
  { label: "GET /api/assets", method: "GET", path: "/api/assets" },
  { label: "GET /api/assets/seeded-id", method: "GET", path: "/api/assets/audit-seed" },
  { label: "GET /api/assets/seeded-id?include=replayPayload", method: "GET", path: "/api/assets/audit-seed?include=replayPayload" },
  // Workflows
  { label: "GET /api/workflows", method: "GET", path: "/api/workflows" },
]

beforeAll(() => {
  preloadAllTemplates()
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-audit-"))
  process.env.IMAGES_GEN_ART_KEYS_PATH = join(tmpRoot, "keys.enc")
  process.env.IMAGES_GEN_ART_VERTEX_DIR = join(tmpRoot, "vertex-files")
})

afterAll(() => {
  delete process.env.IMAGES_GEN_ART_KEYS_PATH
  delete process.env.IMAGES_GEN_ART_VERTEX_DIR
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })

  // Seed the asset + profile-asset referenced by AUDIT_TARGETS so the
  // route actually returns a real row (not just a 404 stub).
  const fileName = `audit-seed.png`
  const fakeAsset = join(tmpRoot, "assets", "chartlens", fileName)
  mkdirSync(dirname(fakeAsset), { recursive: true })
  writeFileSync(fakeAsset, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  getAssetRepo().insert({
    id: "audit-seed",
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId: null,
    variantGroup: null,
    promptRaw: "audit seed",
    promptTemplateId: null,
    promptTemplateVersion: null,
    inputParams: "{}",
    replayPayload: null,
    replayClass: "deterministic",
    providerId: "mock",
    modelId: "mock-fast",
    seed: 1,
    aspectRatio: "1:1",
    language: null,
    filePath: fakeAsset,
    width: 1024,
    height: 1024,
    fileSizeBytes: 4,
    status: "completed",
    errorMessage: null,
    generationTimeMs: 1,
    costUsd: 0,
    tags: null,
    notes: null,
    replayedFrom: null,
  })
  getProfileAssetsRepo().insert({
    id: "pa_audit",
    profileId: "chartlens",
    kind: "logo",
    filePath: fakeAsset,
    mimeType: "image/png",
    fileSizeBytes: 4,
  })
})

afterEach(() => {
  // Tree inside tmpRoot persists across tests; no need to scrub per-test.
})

describe("DTO audit — BANNED_KEYS scanner across all GET routes", () => {
  for (const target of AUDIT_TARGETS) {
    it(`[${target.method}] ${target.path} — no banned keys in response`, async () => {
      const init: RequestInit = { method: target.method }
      if (target.body !== undefined) {
        init.headers = { "Content-Type": "application/json" }
        init.body = JSON.stringify(target.body)
      }
      const res = await fetchApp(target.path, init)
      if (target.expectStatus !== undefined) {
        expect(res.status).toBe(target.expectStatus)
      }
      await expectCleanJson(res, target.label)
    })
  }
})

describe("DTO audit — BANNED_KEYS set sanity", () => {
  it("includes every key CONTRIBUTING Rule 11 + 13 lists", () => {
    const required = [
      "file_path", "filePath",
      "serviceAccountPath", "service_account_path",
      "keyEncrypted", "key_encrypted",
      "apiKey", "api_key",
      "credentials",
      "appLogoPath", "app_logo_path",
      "storeBadgePath", "store_badge_path",
      "screenshotPath", "screenshot_path",
      "screenshotPaths", "screenshot_paths",
    ]
    for (const k of required) {
      expect(BANNED_KEYS.has(k)).toBe(true)
    }
  })
})
