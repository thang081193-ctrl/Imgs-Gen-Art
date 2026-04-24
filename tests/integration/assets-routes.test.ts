// BOOTSTRAP-PHASE3 Step 6 — HTTP smoke for /api/assets.
//
// Tests use an in-memory asset-store + seed rows directly via assetRepo.insert
// (bypasses workflow runs for speed). File fixtures live in an mkdtempSync
// scope so /file + /delete paths exercise real FS without touching repo data.

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"
let tmpRoot: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

interface SeedOverrides {
  profileId?: string
  workflowId?: "artwork-batch" | "ad-production" | "style-transform" | "aso-screenshots"
  filePath?: string
  status?: "completed" | "error"
  providerId?: string
  modelId?: string
  replayClass?: "deterministic" | "best_effort" | "not_replayable"
  tags?: string[]
  createdAt?: string
  batchId?: string | null
  replayedFrom?: string | null
}

function seedAsset(id: string, overrides?: SeedOverrides): string {
  const profileId = overrides?.profileId ?? "chartlens"
  const fileName = `${id}.png`
  const filePath = overrides?.filePath ?? join(tmpRoot, "assets", profileId, fileName)
  mkdirSync(dirname(filePath), { recursive: true })
  if (overrides?.status !== "error") {
    // Write a tiny fixture PNG (actual PNG magic bytes — enough for mime check)
    writeFileSync(
      filePath,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
    )
  }

  getAssetRepo().insert({
    id,
    profileId,
    profileVersionAtGen: 1,
    workflowId: overrides?.workflowId ?? "artwork-batch",
    batchId: overrides?.batchId ?? null,
    variantGroup: null,
    promptRaw: "test prompt",
    promptTemplateId: null,
    promptTemplateVersion: null,
    inputParams: "{}",
    replayPayload: null,
    replayClass: overrides?.replayClass ?? "deterministic",
    providerId: overrides?.providerId ?? "mock",
    modelId: overrides?.modelId ?? "mock-fast",
    seed: 42,
    aspectRatio: "1:1",
    language: null,
    filePath,
    width: 1024,
    height: 1024,
    fileSizeBytes: 10,
    status: overrides?.status ?? "completed",
    errorMessage: null,
    generationTimeMs: 10,
    costUsd: 0,
    tags: overrides?.tags,
    notes: null,
    replayedFrom: overrides?.replayedFrom ?? null,
    createdAt: overrides?.createdAt,
  })
  return filePath
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-assets-test-"))
})

afterAll(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  _resetAssetStoreForTests()
})

describe("GET /api/assets", () => {
  it("returns empty list initially", async () => {
    const res = await fetchApp("/api/assets")
    expect(res.status).toBe(200)
    const body = await res.json() as { assets: unknown[]; limit: number; offset: number }
    expect(body.assets).toEqual([])
    expect(body.limit).toBe(50)
    expect(body.offset).toBe(0)
  })

  it("returns seeded assets, with imageUrl (DTO — no filePath)", async () => {
    seedAsset("ast_one")
    seedAsset("ast_two")

    const res = await fetchApp("/api/assets")
    const body = await res.json() as { assets: { id: string; imageUrl: string | null; [k: string]: unknown }[] }
    expect(body.assets).toHaveLength(2)
    for (const a of body.assets) {
      expect(a).not.toHaveProperty("filePath")
      expect(a.imageUrl).toMatch(/^\/api\/assets\/.+\/file$/)
    }
  })

  it("filters by profileId", async () => {
    seedAsset("ast_a", { profileId: "chartlens" })
    seedAsset("ast_b", { profileId: "ai-chatbot" })

    const res = await fetchApp("/api/assets?profileId=chartlens")
    const body = await res.json() as { assets: { id: string; profileId: string }[] }
    expect(body.assets).toHaveLength(1)
    expect(body.assets[0]?.profileId).toBe("chartlens")
  })

  it("rejects invalid limit (non-numeric) → 400", async () => {
    const res = await fetchApp("/api/assets?limit=abc")
    expect(res.status).toBe(400)
  })
})

// Session #28 Phase 5 Step 3 — expanded filter surface. Each test seeds
// multiple assets + verifies the HTTP filter narrows the result set.
describe("GET /api/assets — Session #28 filters", () => {
  it("profileIds CSV → IN clause (multi-select)", async () => {
    seedAsset("ast_a", { profileId: "chartlens" })
    seedAsset("ast_b", { profileId: "ai-chatbot" })
    seedAsset("ast_c", { profileId: "other" })

    const res = await fetchApp("/api/assets?profileIds=chartlens,ai-chatbot")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id).sort()).toEqual(["ast_a", "ast_b"])
  })

  it("replayClasses filters to subset", async () => {
    seedAsset("ast_det", { replayClass: "deterministic" })
    seedAsset("ast_best", { replayClass: "best_effort" })
    seedAsset("ast_not", { replayClass: "not_replayable" })

    const res = await fetchApp("/api/assets?replayClasses=deterministic,best_effort")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id).sort()).toEqual(["ast_best", "ast_det"])
  })

  it("providerIds + modelIds compose (AND)", async () => {
    seedAsset("ast_g", { providerId: "gemini", modelId: "gemini-3.1-flash-image-preview" })
    seedAsset("ast_v", { providerId: "vertex", modelId: "imagen-4.0-generate-001" })
    seedAsset("ast_m", { providerId: "mock", modelId: "mock-fast" })

    const res = await fetchApp("/api/assets?providerIds=gemini,vertex&modelIds=imagen-4.0-generate-001")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id)).toEqual(["ast_v"])
  })

  it("tags OR mode matches any selected tag", async () => {
    seedAsset("ast_sunset", { tags: ["sunset", "warm"] })
    seedAsset("ast_neon", { tags: ["neon", "cold"] })
    seedAsset("ast_retro", { tags: ["retro"] })

    const res = await fetchApp("/api/assets?tags=sunset,neon&tagMatchMode=any")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id).sort()).toEqual(["ast_neon", "ast_sunset"])
  })

  it("tags AND mode requires all selected tags present", async () => {
    seedAsset("ast_both", { tags: ["sunset", "warm"] })
    seedAsset("ast_one", { tags: ["sunset", "cold"] })

    const res = await fetchApp("/api/assets?tags=sunset,warm&tagMatchMode=all")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id)).toEqual(["ast_both"])
  })

  it("datePreset=7d excludes rows older than 7 days", async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    seedAsset("ast_old", { createdAt: old.toISOString() })
    seedAsset("ast_recent", { createdAt: recent.toISOString() })

    const res = await fetchApp("/api/assets?datePreset=7d")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets.map((a) => a.id)).toEqual(["ast_recent"])
  })

  it("unknown query key → 400 (strict allowlist)", async () => {
    const res = await fetchApp("/api/assets?unknownKey=x")
    expect(res.status).toBe(400)
  })

  it("singular profileId still works (legacy contract)", async () => {
    seedAsset("ast_a", { profileId: "chartlens" })
    seedAsset("ast_b", { profileId: "other" })

    const res = await fetchApp("/api/assets?profileId=chartlens")
    const body = await res.json() as { assets: { id: string }[] }
    expect(body.assets).toHaveLength(1)
    expect(body.assets[0]?.id).toBe("ast_a")
  })
})

describe("GET /api/assets/:id", () => {
  it("returns DTO for existing asset", async () => {
    seedAsset("ast_one")
    const res = await fetchApp("/api/assets/ast_one")
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; imageUrl: string }
    expect(body.id).toBe("ast_one")
    expect(body.imageUrl).toBe("/api/assets/ast_one/file")
  })

  it("unknown id → 404 NOT_FOUND", async () => {
    const res = await fetchApp("/api/assets/nope")
    expect(res.status).toBe(404)
  })

  it("?include=replayPayload attaches replayPayload: null (Phase 3 placeholder)", async () => {
    seedAsset("ast_one")
    const res = await fetchApp("/api/assets/ast_one?include=replayPayload")
    expect(res.status).toBe(200)
    const body = await res.json() as { replayPayload: unknown }
    expect(body).toHaveProperty("replayPayload")
    expect(body.replayPayload).toBeNull()
  })

  it("?include=unknown → 400", async () => {
    seedAsset("ast_one")
    const res = await fetchApp("/api/assets/ast_one?include=something-else")
    expect(res.status).toBe(400)
  })
})

describe("GET /api/assets/:id/file", () => {
  it("streams PNG bytes with Content-Type image/png", async () => {
    seedAsset("ast_file_one")
    const res = await fetchApp("/api/assets/ast_file_one/file")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf[0]).toBe(0x89)
    expect(buf[1]).toBe(0x50)
  })

  it("unknown id → 404", async () => {
    const res = await fetchApp("/api/assets/nope/file")
    expect(res.status).toBe(404)
  })

  it("db row exists but file missing → 404 with integrity detail", async () => {
    const filePath = seedAsset("ast_orphan")
    rmSync(filePath, { force: true })
    const res = await fetchApp("/api/assets/ast_orphan/file")
    expect(res.status).toBe(404)
    const body = await res.json() as { details?: { integrity?: string } }
    expect(body.details?.integrity).toBe("db_row_without_file")
  })
})

describe("DELETE /api/assets/:id", () => {
  it("removes DB row + file → 204", async () => {
    const filePath = seedAsset("ast_to_delete")
    expect(existsSync(filePath)).toBe(true)

    const res = await fetchApp("/api/assets/ast_to_delete", { method: "DELETE" })
    expect(res.status).toBe(204)
    expect(existsSync(filePath)).toBe(false)

    const check = await fetchApp("/api/assets/ast_to_delete")
    expect(check.status).toBe(404)
  })

  it("unknown id → 404 ASSET_NOT_FOUND", async () => {
    const res = await fetchApp("/api/assets/nope", { method: "DELETE" })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("ASSET_NOT_FOUND")
  })

  // Session #35 F1 — deleting a source with replay descendants used to
  // 500 on SQLite FK. The migration flipped the self-FK to ON DELETE
  // CASCADE so the source + all descendants go in a single 204.
  it("source with replay descendants → cascades delete (204)", async () => {
    seedAsset("ast_source")
    seedAsset("ast_child", { replayedFrom: "ast_source" })
    seedAsset("ast_grandchild", { replayedFrom: "ast_child" })

    const res = await fetchApp("/api/assets/ast_source", { method: "DELETE" })
    expect(res.status).toBe(204)

    for (const id of ["ast_source", "ast_child", "ast_grandchild"]) {
      const check = await fetchApp(`/api/assets/${id}`)
      expect(check.status).toBe(404)
    }
  })
})

describe("replayDescendantCount on AssetDto (Session #35 F1)", () => {
  it("0 for leaf assets", async () => {
    seedAsset("ast_leaf")
    const res = await fetchApp("/api/assets/ast_leaf")
    const body = await res.json() as { replayDescendantCount: number }
    expect(body.replayDescendantCount).toBe(0)
  })

  it("matches number of descendants sourcing from this asset", async () => {
    seedAsset("ast_src")
    seedAsset("ast_c1", { replayedFrom: "ast_src" })
    seedAsset("ast_c2", { replayedFrom: "ast_src" })
    // Grandchild references ast_c1 — not counted for ast_src (one-hop only).
    seedAsset("ast_gc", { replayedFrom: "ast_c1" })

    const src = await (await fetchApp("/api/assets/ast_src")).json() as {
      replayDescendantCount: number
    }
    const c1 = await (await fetchApp("/api/assets/ast_c1")).json() as {
      replayDescendantCount: number
    }
    expect(src.replayDescendantCount).toBe(2)
    expect(c1.replayDescendantCount).toBe(1)
  })

  it("list endpoint includes the count on every row", async () => {
    seedAsset("ast_a")
    seedAsset("ast_b", { replayedFrom: "ast_a" })

    const res = await fetchApp("/api/assets")
    const body = await res.json() as { assets: { id: string; replayDescendantCount: number }[] }
    const byId = Object.fromEntries(body.assets.map((a) => [a.id, a.replayDescendantCount]))
    expect(byId.ast_a).toBe(1)
    expect(byId.ast_b).toBe(0)
  })
})

describe("POST /api/assets/:id/replay — registered (Phase 5 Step 1)", () => {
  it("returns 404 when source asset does not exist", async () => {
    const res = await fetchApp("/api/assets/nope/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when source asset has no replay payload stored (Phase 3 seed)", async () => {
    // Legacy-shaped seedAsset in this file deliberately writes replayPayload:
    // null — the replay route must refuse it (can't replay without a payload)
    // rather than route-through to a provider call.
    seedAsset("ast_one")
    const res = await fetchApp("/api/assets/ast_one/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
