// Phase 4 Step 7 (Session #23) — 11 live smoke tests across compatible
// (workflow, provider, model) triples per PLAN §7.4 compatibility matrix.
//
// Goal: exercise the full prod HTTP path — POST /api/workflows/:id/run →
// dispatcher → workflow.run() → real SDK provider → asset-writer → DB +
// disk. Catches regressions on SDK version bump or adapter rewire.
//
// Gating (Bonus H — partial-env support):
//   - AVAILABLE_COMBOS = SMOKE_COMBOS ∩ (whatever env creds are set).
//   - If neither GEMINI_API_KEY nor (VERTEX_PROJECT_ID + VERTEX_SA_PATH)
//     present → entire describe skipped. `regression:full` stays hermetic
//     via vitest.config.ts `exclude: [..., "tests/live/**"]`.
//
// Budget: ~$0.92 per full run (11 × avg $0.084). Interleaved provider
// ordering per Bonus G spreads rate-limit pressure across both SDKs.
//
// Cleanup: afterAll deletes the smoke profile + its asset dir. Set
// KEEP_SMOKE_ASSETS=1 to preserve PNGs for manual review.
//
// Invocation: `npm run test:live:smoke-all` (NOT regression:full).

import {
  existsSync,
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { WorkflowId } from "@/core/design/types"
import { MODEL_IDS } from "@/core/model-registry/models"
import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getBatchRepo,
  initAssetStore,
} from "@/server/asset-store/context"
import { addGeminiSlot, addVertexSlot } from "@/server/keys/slot-manager"
import { loadStoredKeys, saveStoredKeys } from "@/server/keys/store"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

// ---------- env gating ----------

const GEMINI_KEY = process.env["GEMINI_API_KEY"] ?? ""
const VERTEX_PROJECT = process.env["VERTEX_PROJECT_ID"] ?? ""
const VERTEX_SA = process.env["VERTEX_SA_PATH"] ?? ""
const VERTEX_LOCATION = process.env["VERTEX_LOCATION"] ?? "us-central1"
const HAS_GEMINI = GEMINI_KEY.length > 0
const HAS_VERTEX = VERTEX_PROJECT.length > 0 && VERTEX_SA.length > 0
const KEEP_ASSETS = process.env["KEEP_SMOKE_ASSETS"] === "1"

// ---------- smoke combos (Σ = 11, interleaved per Bonus G) ----------

type Combo = {
  workflowId: WorkflowId
  providerId: "gemini" | "vertex"
  modelId: string
}

const SMOKE_COMBOS: readonly Combo[] = [
  { workflowId: "artwork-batch",   providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_PRO },
  { workflowId: "ad-production",   providerId: "vertex", modelId: MODEL_IDS.IMAGEN_4 },
  { workflowId: "artwork-batch",   providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_2 },
  { workflowId: "style-transform", providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_PRO },
  { workflowId: "artwork-batch",   providerId: "vertex", modelId: MODEL_IDS.IMAGEN_4 },
  { workflowId: "ad-production",   providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_PRO },
  { workflowId: "style-transform", providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_2 },
  { workflowId: "ad-production",   providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_2 },
  { workflowId: "aso-screenshots", providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_PRO },
  { workflowId: "aso-screenshots", providerId: "vertex", modelId: MODEL_IDS.IMAGEN_4 },
  { workflowId: "aso-screenshots", providerId: "gemini", modelId: MODEL_IDS.GEMINI_NB_2 },
]

const AVAILABLE_COMBOS: readonly Combo[] = SMOKE_COMBOS.filter((c) =>
  c.providerId === "gemini" ? HAS_GEMINI : HAS_VERTEX,
)

// Bonus C — lock adapter COST_TABLE values. Session #21 shipped these.
const EXPECTED_COSTS: Record<string, number> = {
  "gemini:gemini-3-pro-image-preview": 0.134,
  "gemini:gemini-3.1-flash-image-preview": 0.067,
  "vertex:imagen-4.0-generate-001": 0.04,
}

// Smallest valid PNG (1×1 red pixel, 67 bytes) — for dummy screenshot upload.
const RED_PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
)

const TEST_VERSION = "0.0.0-smoke"
const PROFILE_ID = `smoke-${Date.now()}`
const PROFILE_ASSETS_ROOT = resolve(process.cwd(), "data", "profiles")
const WORKFLOW_ASSETS_ROOT = resolve(process.cwd(), "data", "assets")

// ---------- per-file state ----------

let tmpRoot: string
let screenshotAssetId = ""

// ---------- helpers ----------

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

// Manual IHDR parse — avoids pulling `sharp` for one dimension check.
// PNG layout: 8-byte magic + 4-byte length + "IHDR" + 4-byte width + 4-byte height (big-endian).
function readPngDimensions(filePath: string): { width: number; height: number } {
  const fd = openSync(filePath, "r")
  try {
    const buf = Buffer.alloc(24)
    readSync(fd, buf, 0, 24, 0)
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    }
  } finally {
    closeSync(fd)
  }
}

function assertValidPNG(filePath: string, expectedAspect: "1:1"): void {
  expect(existsSync(filePath)).toBe(true)
  const stats = statSync(filePath)
  expect(stats.size).toBeGreaterThan(1000)
  expect(stats.size).toBeLessThan(20_000_000)

  const fd = openSync(filePath, "r")
  let magic: Buffer
  try {
    magic = Buffer.alloc(8)
    readSync(fd, magic, 0, 8, 0)
  } finally {
    closeSync(fd)
  }
  expect(Array.from(magic)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const { width, height } = readPngDimensions(filePath)
  expect(width).toBeGreaterThan(0)
  expect(height).toBeGreaterThan(0)
  if (expectedAspect === "1:1") {
    expect(Math.abs(width / height - 1)).toBeLessThan(0.02)
  }
}

function buildInput(workflowId: WorkflowId): unknown {
  switch (workflowId) {
    case "artwork-batch":
      return {
        group: "memory",
        subjectDescription: "family portrait, simple composition",
        conceptCount: 1,
        variantsPerConcept: 1,
        seed: 42,
      }
    case "ad-production":
      return {
        featureFocus: "restore",
        conceptCount: 1,
        variantsPerConcept: 1,
        seed: 42,
      }
    case "style-transform":
      return {
        sourceImageAssetId: screenshotAssetId,
        styleDnaKey: "ANIME",
        conceptCount: 1,
        variantsPerConcept: 1,
        seed: 42,
      }
    case "aso-screenshots":
      return {
        targetLangs: ["en"],
        conceptCount: 1,
        variantsPerConcept: 1,
        seed: 42,
      }
  }
}

function smokeProfileBody(): Record<string, unknown> {
  return {
    id: PROFILE_ID,
    name: "Smoke Test Profile",
    tagline: "Phase 4 Step 7 live smoke",
    category: "utility" as const,
    assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
    visual: {
      primaryColor: "#112233",
      secondaryColor: "#445566",
      accentColor: "#778899",
      tone: "minimal" as const,
      doList: ["clean composition", "subtle gradients"],
      dontList: ["clutter"],
    },
    positioning: {
      usp: "smoke test fixture",
      targetPersona: "automated-smoke-test",
      marketTier: "global" as const,
    },
    context: {
      features: ["smoke"],
      keyScenarios: ["live-api-exercise"],
      forbiddenContent: ["pii"],
    },
  }
}

// ---------- suite ----------

describe.skipIf(AVAILABLE_COMBOS.length === 0)(
  "Phase 4 Step 7 — workflow × provider live smokes",
  () => {
    beforeAll(async () => {
      tmpRoot = mkdtempSync(join(tmpdir(), "iga-smoke-"))
      process.env["IMAGES_GEN_ART_KEYS_PATH"] = join(tmpRoot, "keys.enc")
      process.env["IMAGES_GEN_ART_VERTEX_DIR"] = join(tmpRoot, "vertex")
      process.env["IMAGES_GEN_ART_PROFILE_ASSETS_DIR"] = join(tmpRoot, "profile-assets")

      preloadAllTemplates()
      _resetAssetStoreForTests()
      initAssetStore({ path: ":memory:" })
      _resetAbortRegistryForTests()

      // Seed real slots based on env — store auto-activates first slot per provider.
      let store = loadStoredKeys()
      if (HAS_GEMINI) {
        const { next } = addGeminiSlot(store, {
          label: "smoke-gemini",
          plaintextKey: GEMINI_KEY,
        })
        store = next
      }
      if (HAS_VERTEX) {
        const { next } = addVertexSlot(store, {
          label: "smoke-vertex",
          projectId: VERTEX_PROJECT,
          location: VERTEX_LOCATION,
          serviceAccountPath: VERTEX_SA,
        })
        store = next
      }
      saveStoredKeys(store)

      // Create smoke profile via API (catches route regressions per Q2 rec).
      const profileRes = await fetchApp("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smokeProfileBody()),
      })
      if (profileRes.status !== 201) {
        throw new Error(`profile create failed: ${profileRes.status} ${await profileRes.text()}`)
      }

      // Upload dummy screenshot so style-transform has a valid sourceImageAssetId.
      const form = new FormData()
      form.append("kind", "screenshot")
      form.append("expectedVersion", "1")
      form.append("file", new Blob([RED_PNG_1X1], { type: "image/png" }), "smoke-ss.png")
      const uploadRes = await fetchApp(`/api/profiles/${PROFILE_ID}/upload-asset`, {
        method: "POST",
        body: form,
      })
      if (uploadRes.status !== 201) {
        throw new Error(`screenshot upload failed: ${uploadRes.status} ${await uploadRes.text()}`)
      }
      const uploaded = (await uploadRes.json()) as { assetId: string }
      screenshotAssetId = uploaded.assetId
    }, 60_000)

    afterAll(async () => {
      if (KEEP_ASSETS) {
        console.log(`[smoke] KEEP_SMOKE_ASSETS=1 — preserving ${WORKFLOW_ASSETS_ROOT}/${PROFILE_ID}`)
      } else {
        const assetDir = join(WORKFLOW_ASSETS_ROOT, PROFILE_ID)
        if (existsSync(assetDir)) rmSync(assetDir, { recursive: true, force: true })
        const profileJson = join(PROFILE_ASSETS_ROOT, `${PROFILE_ID}.json`)
        if (existsSync(profileJson)) rmSync(profileJson, { force: true })
      }

      if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
      delete process.env["IMAGES_GEN_ART_KEYS_PATH"]
      delete process.env["IMAGES_GEN_ART_VERTEX_DIR"]
      delete process.env["IMAGES_GEN_ART_PROFILE_ASSETS_DIR"]
    })

    it.each(AVAILABLE_COMBOS)(
      "$workflowId via $providerId:$modelId generates valid asset",
      async (combo) => {
        const input = buildInput(combo.workflowId)
        const body = {
          profileId: PROFILE_ID,
          providerId: combo.providerId,
          modelId: combo.modelId,
          aspectRatio: "1:1",
          language: "en",
          input,
        }

        let events: { event: string; data: unknown }[] = []

        try {
          const res = await fetchApp(`/api/workflows/${combo.workflowId}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          expect(res.status).toBe(200)

          const raw = await readSSE(res)
          events = parseSSEEvents(raw)

          const last = events.at(-1)
          expect(last?.event).toBe("complete")

          const startedEvent = events.find((e) => e.event === "started")
          expect(startedEvent).toBeDefined()
          const batchId = (startedEvent!.data as { batchId: string }).batchId

          const batch = getBatchRepo().findById(batchId)
          expect(batch).toBeDefined()
          expect(batch!.status).toBe("completed")
          expect(batch!.successfulAssets).toBe(1)

          const assets = getAssetRepo().list({ batchId, limit: 10 })
          expect(assets).toHaveLength(1)
          const asset = assets[0]!

          // Bonus C — cost assertion pins adapter COST_TABLE.
          const expectedCost = EXPECTED_COSTS[`${combo.providerId}:${combo.modelId}`]
          expect(asset.costUsd).toBe(expectedCost)
          expect(batch!.totalCostUsd).toBe(expectedCost)

          // File + magic bytes + 1:1 aspect (Q5 rec).
          assertValidPNG(asset.filePath, "1:1")
        } catch (err) {
          // Bonus B — full context dump for triage.
          console.error("[smoke failure]", {
            combo,
            input,
            eventCount: events.length,
            lastEvents: events.slice(-3),
            error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
          })
          throw err
        }
      },
      120_000,
    )
  },
)
