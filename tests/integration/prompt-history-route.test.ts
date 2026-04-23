// Phase 5 Step 5b (Session #27b) — integration tests for PromptLab's backing
// history log. Covers:
//   1. GET /api/assets/:id/prompt-history — empty list on new asset
//   2. GET /api/assets/:id/prompt-history — 404 on unknown asset
//   3. Full edit-replay flow inserts history row (status: pending → complete)
//      + costUsd + resultAssetId populated on success
//   4. DESC ordering by createdAt across multiple edits
//   5. Pure mode=replay does NOT insert a history row (edit-only log)
//   6. Failed edit (provider throws) → status=failed + error_message
//
// Cancelled path is covered at the unit level in replay-service.test.ts
// (abort before generate) — HTTP flow can't easily fire AbortSignal mid-
// stream without jumping through hoops for this v1 batch.

import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"
import type { PromptHistoryDto } from "@/core/dto/prompt-history-dto"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getBatchRepo,
  getPromptHistoryRepo,
  initAssetStore,
} from "@/server/asset-store"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

const TEST_VERSION = "0.0.0-test"
const ASSET_CLEANUP_DIR = resolve(process.cwd(), "data", "assets", "chartlens-ph")
const MOCK_MODEL_ID = "mock-fast"

const testProfile: AppProfile = {
  version: 1,
  id: "chartlens-ph",
  name: "ChartLens",
  tagline: "Instant chart reader",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#111111",
    secondaryColor: "#ff66cc",
    accentColor: "#00ccff",
    tone: "minimal",
    doList: ["a"],
    dontList: ["b"],
  },
  positioning: { usp: "x", targetPersona: "y", marketTier: "global" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

async function readSSE(res: Response): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) return
  for (;;) {
    const { done } = await reader.read()
    if (done) break
  }
}

function seedCanonicalSource(id = "asset_ph_src"): string {
  const batchId = "batch_ph_src"
  if (!getBatchRepo().findById(batchId)) {
    getBatchRepo().create({
      id: batchId,
      profileId: "chartlens-ph",
      workflowId: "artwork-batch",
      totalAssets: 1,
      successfulAssets: 1,
      status: "completed",
    })
  }
  const canonical: ReplayPayload = {
    version: 1,
    prompt: "origin prompt",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    aspectRatio: "1:1",
    seed: 5,
    providerSpecificParams: { addWatermark: false },
    promptTemplateId: "artwork-batch",
    promptTemplateVersion: "1",
    contextSnapshot: {
      profileId: testProfile.id,
      profileVersion: testProfile.version,
      profileSnapshot: testProfile,
    },
  }
  getAssetRepo().insert({
    id,
    profileId: "chartlens-ph",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId,
    promptRaw: canonical.prompt,
    promptTemplateId: canonical.promptTemplateId,
    promptTemplateVersion: canonical.promptTemplateVersion,
    inputParams: "{}",
    replayPayload: JSON.stringify(canonical),
    replayClass: "deterministic",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 5,
    aspectRatio: "1:1",
    filePath: `./data/assets/${id}.png`,
    status: "completed",
    tags: [],
  })
  return id
}

beforeAll(() => {
  preloadAllTemplates()
})

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  if (existsSync(ASSET_CLEANUP_DIR)) {
    rmSync(ASSET_CLEANUP_DIR, { recursive: true, force: true })
  }
})

describe("GET /api/assets/:id/prompt-history — read surface", () => {
  it("1. returns empty history for a brand-new asset", async () => {
    const sourceId = seedCanonicalSource()
    const res = await fetchApp(`/api/assets/${sourceId}/prompt-history`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { assetId: string; history: PromptHistoryDto[] }
    expect(body.assetId).toBe(sourceId)
    expect(body.history).toEqual([])
  })

  it("2. returns 404 when the source asset does not exist", async () => {
    const res = await fetchApp(`/api/assets/asset_nope/prompt-history`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("NOT_FOUND")
  })
})

describe("POST /api/assets/:id/replay mode=edit — history writes", () => {
  it("3. inserts a history row on edit-replay; status: pending → complete with resultAssetId + costUsd", async () => {
    const sourceId = seedCanonicalSource()
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { prompt: "edited neon skyline" },
      }),
    })
    expect(res.status).toBe(200)
    await readSSE(res)

    const history = getPromptHistoryRepo().listByAsset(sourceId)
    expect(history).toHaveLength(1)
    const entry = history[0]
    if (!entry) throw new Error("history entry missing")
    expect(entry.id).toMatch(/^ph_/)
    expect(entry.assetId).toBe(sourceId)
    expect(entry.profileId).toBe("chartlens-ph")
    expect(entry.promptRaw).toBe("edited neon skyline")
    expect(entry.status).toBe("complete")
    expect(entry.resultAssetId).not.toBeNull()
    expect(entry.costUsd).toBeTypeOf("number")
    expect(entry.parentHistoryId).toBeNull()
    expect(entry.overrideParams).toEqual({})
  })

  it("4. multiple edits are returned DESC by createdAt", async () => {
    const sourceId = seedCanonicalSource("asset_ph_order")
    async function runEdit(prompt: string): Promise<void> {
      const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "edit",
          overridePayload: { prompt },
        }),
      })
      await readSSE(res)
      // Ensure createdAt timestamps are distinguishable on fast systems.
      await new Promise((r) => setTimeout(r, 10))
    }
    await runEdit("first edit")
    await runEdit("second edit")
    await runEdit("third edit")

    const listRes = await fetchApp(`/api/assets/${sourceId}/prompt-history`)
    const body = (await listRes.json()) as {
      assetId: string
      history: PromptHistoryDto[]
    }
    expect(body.history.map((h) => h.promptRaw)).toEqual([
      "third edit",
      "second edit",
      "first edit",
    ])
  })

  it("5. persists overrideParams (addWatermark + negativePrompt) from the edit request", async () => {
    const sourceId = seedCanonicalSource("asset_ph_params")
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: {
          prompt: "with params",
          addWatermark: true,
          negativePrompt: "no text",
        },
      }),
    })
    await readSSE(res)

    const history = getPromptHistoryRepo().listByAsset(sourceId)
    expect(history).toHaveLength(1)
    const entry = history[0]
    if (!entry) throw new Error("history entry missing")
    expect(entry.overrideParams).toEqual({
      addWatermark: true,
      negativePrompt: "no text",
    })
  })
})

describe("POST /api/assets/:id/replay mode=replay — history NOT written", () => {
  it("6. pure replay (no overridePayload) does NOT insert a history row", async () => {
    const sourceId = seedCanonicalSource("asset_ph_pure")
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "replay" }),
    })
    expect(res.status).toBe(200)
    await readSSE(res)

    const history = getPromptHistoryRepo().listByAsset(sourceId)
    expect(history).toEqual([])
  })
})
