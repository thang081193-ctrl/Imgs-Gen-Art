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

function seedAsset(
  id: string,
  overrides?: { profileId?: string; workflowId?: "artwork-batch"; filePath?: string; status?: "completed" | "error" },
): string {
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
    batchId: null,
    variantGroup: null,
    promptRaw: "test prompt",
    promptTemplateId: null,
    promptTemplateVersion: null,
    inputParams: "{}",
    replayPayload: null,
    replayClass: "deterministic",
    providerId: "mock",
    modelId: "mock-fast",
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
    tags: null,
    notes: null,
    replayedFrom: null,
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
