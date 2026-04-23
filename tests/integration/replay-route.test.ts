// Phase 5 Step 1 (Session #25) — HTTP smoke for /api/assets/:id/replay
// + /api/assets/:id/replay-class.
//
// Covers:
//   - POST happy path (SSE started → image_generated → complete)
//   - POST precondition errors (404 missing, 400 not_replayable, 400 no payload)
//   - POST 501 on mode=edit (v1 surface guard)
//   - GET replay-class happy + 404 + 400
// Reuses the same in-memory DB + app factory pattern as
// tests/integration/workflows-routes.test.ts.

import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getBatchRepo,
  initAssetStore,
  type AssetInsertInput,
} from "@/server/asset-store"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

const TEST_VERSION = "0.0.0-test"
const ASSET_CLEANUP_DIR = resolve(process.cwd(), "data", "assets", "chartlens")
const MOCK_MODEL_ID = "mock-fast"

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

async function readSSE(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("no body reader")
  const decoder = new TextDecoder()
  let out = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

function parseSSEEvents(raw: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = []
  for (const block of raw.split(/\n\n/)) {
    if (!block.trim()) continue
    let ev = ""
    const dataLines: string[] = []
    for (const line of block.split(/\n/)) {
      if (line.startsWith("event: ")) ev = line.slice(7)
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6))
    }
    if (ev) {
      const data: unknown = dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : null
      events.push({ event: ev, data })
    }
  }
  return events
}

function seedSourceAsset(overrides: Partial<AssetInsertInput> = {}): string {
  const id = overrides.id ?? "asset_r_src"
  const sourceBatchId = overrides.batchId ?? "batch_r_src"
  const batchRepo = getBatchRepo()
  if (sourceBatchId !== null && !batchRepo.findById(sourceBatchId)) {
    batchRepo.create({
      id: sourceBatchId,
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 1,
      successfulAssets: 1,
      status: "completed",
    })
  }
  const payload = {
    version: 1,
    promptRaw: "integration-test prompt stub",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 99,
    aspectRatio: "1:1" as const,
    language: null,
  }
  getAssetRepo().insert({
    id,
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId: sourceBatchId,
    promptRaw: payload.promptRaw,
    inputParams: "{}",
    replayPayload: JSON.stringify(payload),
    replayClass: "deterministic",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 99,
    aspectRatio: "1:1",
    filePath: `./data/assets/${id}.png`,
    status: "completed",
    tags: ["integration"],
    ...overrides,
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

describe("POST /api/assets/:id/replay — SSE happy path", () => {
  it("streams started → image_generated → complete with replayedFromAssetId linkage", async () => {
    const sourceId = seedSourceAsset()

    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type") ?? "").toContain("text/event-stream")

    const events = parseSSEEvents(await readSSE(res))
    const types = events.map((e) => e.event)
    expect(types).toEqual(["started", "image_generated", "complete"])

    const started = events[0]?.data as { batchId: string; total: number }
    expect(started.total).toBe(1)

    const batch = getBatchRepo().findById(started.batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.replayOfAssetId).toBe(sourceId)
    expect(batch?.replayOfBatchId).toBe("batch_r_src")

    const imageEv = events[1]?.data as { asset: { replayedFromAssetId: string | null } }
    expect(imageEv.asset.replayedFromAssetId).toBe(sourceId)
  }, 10000)
})

describe("POST /api/assets/:id/replay — precondition errors", () => {
  it("404 when source asset does not exist", async () => {
    const res = await fetchApp("/api/assets/not-a-real-id/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
    const err = (await res.json()) as { code: string }
    expect(err.code).toBe("NOT_FOUND")
  })

  it("400 when asset replayClass is 'not_replayable'", async () => {
    const sourceId = seedSourceAsset({
      id: "asset_r_nr",
      replayClass: "not_replayable",
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const err = (await res.json()) as { code: string }
    expect(err.code).toBe("BAD_REQUEST")
  })

  it("400 when asset has no replay payload stored", async () => {
    const sourceId = seedSourceAsset({
      id: "asset_r_nopl",
      replayPayload: null,
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("501 when mode='edit' (v1 surface guard)", async () => {
    const sourceId = seedSourceAsset({ id: "asset_r_edit" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "edit" }),
    })
    expect(res.status).toBe(501)
    const err = (await res.json()) as { error: string }
    expect(err.error).toBe("NOT_IMPLEMENTED")
  })
})

describe("GET /api/assets/:id/replay-class", () => {
  it("returns probe JSON when asset is replayable", async () => {
    const sourceId = seedSourceAsset({ id: "asset_r_probe" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay-class`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      assetId: string
      replayClass: string
      providerId: string
      modelId: string
      estimatedCostUsd: number
      workflowId: string
    }
    expect(body.assetId).toBe(sourceId)
    expect(body.replayClass).toBe("deterministic")
    expect(body.providerId).toBe("mock")
    expect(body.modelId).toBe(MOCK_MODEL_ID)
    expect(typeof body.estimatedCostUsd).toBe("number")
    expect(body.workflowId).toBe("artwork-batch")
  })

  it("404 when asset does not exist", async () => {
    const res = await fetchApp("/api/assets/nonexistent/replay-class")
    expect(res.status).toBe(404)
  })

  // Session #26 fold-in: not_replayable is a displayable state, not an error.
  // Route returns 200 with a discriminated payload carrying `reason` so the
  // UI can render the disabled-button tooltip copy ("watermark applied" vs
  // "seed missing" vs "provider doesn't support seed"). POST /replay still
  // hard-fails 400 on not_replayable because there's nothing to execute.
  it("200 with reason=seed_missing when asset has no seed", async () => {
    const sourceId = seedSourceAsset({
      id: "asset_r_nrp_seed",
      replayClass: "not_replayable",
      seed: null,
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay-class`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      replayClass: string
      reason: string
      estimatedCostUsd?: number
    }
    expect(body.replayClass).toBe("not_replayable")
    expect(body.reason).toBe("seed_missing")
    expect(body.estimatedCostUsd).toBeUndefined()
  })

  it("200 with reason=provider_no_seed_support when model lacks deterministic seed", async () => {
    // gemini-3-pro-image-preview has supportsDeterministicSeed=false (capabilities.ts:18)
    const sourceId = seedSourceAsset({
      id: "asset_r_nrp_prov",
      replayClass: "not_replayable",
      providerId: "gemini",
      modelId: "gemini-3-pro-image-preview",
      seed: 42,
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay-class`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { replayClass: string; reason: string }
    expect(body.replayClass).toBe("not_replayable")
    expect(body.reason).toBe("provider_no_seed_support")
  })

  it("200 with reason=watermark_applied when seed present + model supports seed", async () => {
    const sourceId = seedSourceAsset({
      id: "asset_r_nrp_wm",
      replayClass: "not_replayable",
      modelId: MOCK_MODEL_ID,
      seed: 42,
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay-class`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { replayClass: string; reason: string }
    expect(body.replayClass).toBe("not_replayable")
    expect(body.reason).toBe("watermark_applied")
  })
})
