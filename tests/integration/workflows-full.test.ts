// Session #17 Step 9 — full E2E smoke across all 4 workflows.
//
// One happy-path test per workflow: POST /:id/run → consume SSE to
// completion → assert event sequence (started → concept_generated →
// image_generated → complete) → DB persistence (batch status
// "completed") + file on disk. Plus ONE compat-reject test that trips
// precondition #5 via style-transform × vertex:imagen-4 (declaratively
// incompatible — no supportsImageEditing on Imagen 4).
//
// Asset store = in-memory per test; asset files written to a tmpdir
// scope under data/assets/<profile>/ and scrubbed in afterEach.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getBatchRepo,
  getProfileAssetsRepo,
  initAssetStore,
} from "@/server/asset-store/context"
import { addVertexSlot } from "@/server/keys/slot-manager"
import { loadStoredKeys, saveStoredKeys } from "@/server/keys/store"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

const TEST_VERSION = "0.0.0-test"
const ASSETS_CLEANUP = resolve(process.cwd(), "data", "assets", "chartlens")

let tmpRoot: string
let keysPath: string
let vertexDir: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
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
    const lines = block.split(/\n/)
    let ev = ""
    const dataLines: string[] = []
    for (const line of lines) {
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

async function runWorkflow(workflowId: string, input: unknown): Promise<{
  status: number
  events: { event: string; data: unknown }[]
}> {
  const res = await fetchApp(`/api/workflows/${workflowId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId: "chartlens",
      providerId: "mock",
      modelId: "mock-fast",
      aspectRatio: "1:1",
      input,
    }),
  })
  if (res.status !== 200) return { status: res.status, events: [] }
  const raw = await readSSE(res)
  return { status: 200, events: parseSSEEvents(raw) }
}

beforeAll(() => {
  preloadAllTemplates()
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-workflows-full-"))
  keysPath = join(tmpRoot, "keys.enc")
  vertexDir = join(tmpRoot, "vertex-files")
  process.env.IMAGES_GEN_ART_KEYS_PATH = keysPath
  process.env.IMAGES_GEN_ART_VERTEX_DIR = vertexDir
})

afterAll(() => {
  delete process.env.IMAGES_GEN_ART_KEYS_PATH
  delete process.env.IMAGES_GEN_ART_VERTEX_DIR
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
  if (existsSync(keysPath)) rmSync(keysPath, { force: true })
})

afterEach(() => {
  if (existsSync(ASSETS_CLEANUP)) rmSync(ASSETS_CLEANUP, { recursive: true, force: true })
})

describe("4 workflows — happy-path E2E", () => {
  it("artwork-batch: emits started → concept × 2 → image × 2 → complete + persists batch", async () => {
    const { status, events } = await runWorkflow("artwork-batch", {
      group: "memory",
      subjectDescription: "family portrait",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 42,
    })
    expect(status).toBe(200)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe("started")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "concept_generated")).toHaveLength(2)
    expect(types.filter((t) => t === "image_generated")).toHaveLength(2)
    const started = events[0]!.data as { batchId: string; total: number }
    expect(started.total).toBe(2)
    const batch = getBatchRepo().findById(started.batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.successfulAssets).toBe(2)
    expect(getAssetRepo().list({ batchId: started.batchId, limit: 100 })).toHaveLength(2)
  }, 10000)

  it("ad-production: emits full sequence for featureFocus=restore × 2 concepts", async () => {
    const { status, events } = await runWorkflow("ad-production", {
      featureFocus: "restore",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 100,
    })
    expect(status).toBe(200)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe("started")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "image_generated")).toHaveLength(2)
    const batchId = (events[0]!.data as { batchId: string }).batchId
    expect(getBatchRepo().findById(batchId)?.status).toBe("completed")
  }, 10000)

  it("style-transform: resolves seeded sourceImageAssetId → full sequence", async () => {
    // Q2 precondition requires a profile_asset row with kind="screenshot".
    // In-memory DB is fresh per test — seed it directly via the repo.
    const screenshotId = "pa_test_screenshot"
    const fakePath = join(tmpRoot, "fake-screenshot.png")
    writeFileSync(fakePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    getProfileAssetsRepo().insert({
      id: screenshotId,
      profileId: "chartlens",
      kind: "screenshot",
      filePath: fakePath,
      mimeType: "image/png",
      fileSizeBytes: 4,
    })

    const { status, events } = await runWorkflow("style-transform", {
      sourceImageAssetId: screenshotId,
      styleDnaKey: "ANIME",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 7,
    })
    expect(status).toBe(200)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe("started")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "image_generated")).toHaveLength(2)
    const batchId = (events[0]!.data as { batchId: string }).batchId
    expect(getBatchRepo().findById(batchId)?.status).toBe("completed")
  }, 10000)

  it("aso-screenshots: 1 concept × 1 lang × 1 variant = 1 asset", async () => {
    const { status, events } = await runWorkflow("aso-screenshots", {
      conceptCount: 1,
      variantsPerConcept: 1,
      targetLangs: ["en"],
      seed: 13,
    })
    expect(status).toBe(200)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe("started")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "image_generated")).toHaveLength(1)
  }, 10000)
})

describe("compat-reject (precondition #5)", () => {
  it("style-transform × vertex:imagen-4 → 409 INCOMPATIBLE_WORKFLOW_PROVIDER", async () => {
    // Seed an active vertex slot so precondition #4 (active key) passes;
    // the stub service-account path never gets dereferenced because #5
    // (compat) throws first — style-transform requires supportsImageEditing
    // which imagen-4.0-generate-001 does not declare.
    const fakeSaPath = join(tmpRoot, "vertex-slot1.json")
    writeFileSync(fakeSaPath, JSON.stringify({
      project_id: "test-project",
      client_email: "t@t.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
      type: "service_account",
    }))
    const store = loadStoredKeys()
    const { next } = addVertexSlot(store, {
      label: "test-vertex",
      projectId: "test-project",
      location: "us-central1",
      serviceAccountPath: fakeSaPath,
    })
    saveStoredKeys(next)

    const res = await fetchApp("/api/workflows/style-transform/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "chartlens",
        providerId: "vertex",
        modelId: "imagen-4.0-generate-001",
        aspectRatio: "1:1",
        input: {
          sourceImageAssetId: "pa_irrelevant",
          styleDnaKey: "ANIME",
          conceptCount: 1,
          variantsPerConcept: 1,
          seed: 1,
        },
      }),
    })
    expect(res.status).toBe(409)
    const err = await res.json() as { code: string }
    expect(err.code).toBe("INCOMPATIBLE_WORKFLOW_PROVIDER")
  })
})
