// S#38 Q-38.C — /api/health.lastGenAt contract.
//
// AppHeader's version strip needs the most-recent assets row's
// timestamp ("last gen 5m ago"). This test exercises three states:
//   1. asset-store initialized but empty → lastGenAt: null
//   2. assets seeded → lastGenAt = max(created_at)
//   3. asset-store NOT initialized → lastGenAt: null (graceful
//      fallback so /api/health stays a green liveness probe even
//      when test contexts mount the app without a DB)

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"
let tmpRoot: string

function fetchHealth(): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request("http://127.0.0.1/api/health"))
}

function seedAssetAt(id: string, createdAt: string): void {
  const profileId = "chartlens"
  const filePath = join(tmpRoot, profileId, `${id}.png`)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  getAssetRepo().insert({
    id,
    profileId,
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId: null,
    variantGroup: null,
    promptRaw: "test",
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
    filePath,
    width: 16,
    height: 16,
    fileSizeBytes: 4,
    status: "completed",
    errorMessage: null,
    generationTimeMs: 1,
    costUsd: 0,
    createdAt,
  })
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-health-lastgen-"))
})

afterEach(() => {
  _resetAssetStoreForTests()
})

describe("GET /api/health — lastGenAt (Q-38.C)", () => {
  it("returns null when asset-store is bound but has no rows", async () => {
    initAssetStore({ path: ":memory:" })
    const res = await fetchHealth()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lastGenAt).toBeNull()
  })

  it("returns the most-recent assets.created_at when rows exist", async () => {
    initAssetStore({ path: ":memory:" })
    seedAssetAt("ast_old", "2026-04-20T00:00:00.000Z")
    seedAssetAt("ast_new", "2026-04-25T10:30:00.000Z")
    seedAssetAt("ast_mid", "2026-04-22T00:00:00.000Z")
    const res = await fetchHealth()
    const body = await res.json()
    expect(body.lastGenAt).toBe("2026-04-25T10:30:00.000Z")
  })

  it("returns null when asset-store is NOT initialized (graceful fallback)", async () => {
    // No initAssetStore() — mirrors the contexts in app.test.ts and
    // sse-echo.test.ts that mount the app without a DB.
    const res = await fetchHealth()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lastGenAt).toBeNull()
    expect(body.status).toBe("ok")
  })
})
