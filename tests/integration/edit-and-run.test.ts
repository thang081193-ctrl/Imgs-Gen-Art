// Session #27a — Phase 5 Step 5a. Integration coverage for POST
// /api/assets/:id/replay mode="edit" + canonical/legacy dual-reader paths.
//
// Scope (per Session #27 pre-align Q7 + bro's refinements):
//   Core (6):
//     1. Happy — {prompt: "edited"} on canonical source → SSE 200 + new
//        asset has edited prompt; source row unchanged.
//     2. Happy — {prompt: "edited", addWatermark: true} → new asset
//        carries merged providerSpecificParams in its replayPayload.
//     3. Reject — {seed: 999} → 400 EDIT_FIELD_NOT_ALLOWED field="seed".
//     4. Reject — {providerSpecificParams: {...}} → 400
//        EDIT_FIELD_NOT_ALLOWED field="providerSpecificParams".
//     5. Reject — {fictional: "x"} → 400 EDIT_FIELD_NOT_ALLOWED
//        field="fictional".
//     6. Happy — {negativePrompt: "..."} on mock (supportsNegativePrompt:
//        true) → SSE 200. (Capability gate exercised on mock since real
//        providers are all supportsNegativePrompt: false — a dedicated
//        negative case would need a mock adapter with supportsSeed=true
//        AND supportsNegativePrompt=false, which is off-registry.)
//   Legacy (3):
//     7. Legacy source + mode=edit → 400 LEGACY_PAYLOAD_NOT_EDITABLE.
//     8. Legacy source + mode=replay (no override) → SSE 200 (dual-reader
//        path preserved for pre-Session-#27 rows).
//     9. Synthesis correctness — legacy replay produces a new asset whose
//        promptRaw matches the legacy promptRaw (prompt field rename is
//        transparent).
//   inputParams audit (1):
//     10. Replayed asset copies source's inputParams verbatim — covers
//         the canonical-migration decision to drop workflow-specific
//         fields from replayPayload (they live in inputParams).

import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
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

const testProfile: AppProfile = {
  version: 1,
  id: "chartlens",
  name: "ChartLens",
  tagline: "Instant chart reader",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#111111",
    secondaryColor: "#ff66cc",
    accentColor: "#00ccff",
    tone: "minimal",
    doList: ["clean grid"],
    dontList: ["clutter"],
  },
  positioning: { usp: "Snap charts", targetPersona: "traders", marketTier: "global" },
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

function ensureBatch(batchId: string): void {
  if (!getBatchRepo().findById(batchId)) {
    getBatchRepo().create({
      id: batchId,
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 1,
      successfulAssets: 1,
      status: "completed",
    })
  }
}

function seedCanonicalSource(overrides: Partial<AssetInsertInput> = {}): string {
  const id = overrides.id ?? "asset_edit_src"
  const batchId = overrides.batchId ?? "batch_edit_src"
  ensureBatch(batchId)
  const canonical: ReplayPayload = {
    version: 1,
    prompt: "the original prompt — mountains at dawn",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    aspectRatio: "1:1",
    seed: 77,
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
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId,
    promptRaw: canonical.prompt,
    promptTemplateId: canonical.promptTemplateId,
    promptTemplateVersion: canonical.promptTemplateVersion,
    inputParams: JSON.stringify({ conceptTitle: "Mountains", tagGroup: "nature" }),
    replayPayload: JSON.stringify(canonical),
    replayClass: "deterministic",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 77,
    aspectRatio: "1:1",
    filePath: `./data/assets/${id}.png`,
    status: "completed",
    tags: ["integration", "edit-test"],
    ...overrides,
  })
  return id
}

function seedLegacySource(overrides: Partial<AssetInsertInput> = {}): string {
  const id = overrides.id ?? "asset_legacy_src"
  const batchId = overrides.batchId ?? "batch_legacy_src"
  ensureBatch(batchId)
  const legacyPayload = {
    version: 1,
    promptRaw: "legacy prompt — sunset city skyline",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 88,
    aspectRatio: "1:1" as const,
    language: null,
    profileVersion: 1,
  }
  getAssetRepo().insert({
    id,
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId,
    promptRaw: legacyPayload.promptRaw,
    inputParams: JSON.stringify({ conceptTitle: "Cityscape", tagGroup: "urban" }),
    replayPayload: JSON.stringify(legacyPayload),
    replayClass: "deterministic",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 88,
    aspectRatio: "1:1",
    filePath: `./data/assets/${id}.png`,
    status: "completed",
    tags: ["integration", "legacy"],
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
    rmSync(ASSET_CLEANUP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

describe("POST /replay mode=edit — core happy paths", () => {
  it("1. {prompt: edited} → SSE 200 + new asset carries edited prompt; source unchanged", async () => {
    const sourceId = seedCanonicalSource()
    const sourcePromptBefore = getAssetRepo().findById(sourceId)?.promptRaw
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { prompt: "edited — deep space nebula" },
      }),
    })
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await readSSE(res))
    expect(events.map((e) => e.event)).toEqual(["started", "image_generated", "complete"])
    const imageEv = events.find((e) => e.event === "image_generated")
    const newAssetId = (imageEv?.data as { asset: { id: string } }).asset.id
    const newAsset = getAssetRepo().findById(newAssetId)
    expect(newAsset?.promptRaw).toBe("edited — deep space nebula")
    // Source row must be untouched.
    expect(getAssetRepo().findById(sourceId)?.promptRaw).toBe(sourcePromptBefore)
  })

  it("2. {prompt + addWatermark: true} → merged payload persisted on new asset", async () => {
    const sourceId = seedCanonicalSource({ id: "asset_edit_wm" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { prompt: "watermarked variant", addWatermark: true },
      }),
    })
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await readSSE(res))
    const imageEv = events.find((e) => e.event === "image_generated")
    const newAssetId = (imageEv?.data as { asset: { id: string } }).asset.id
    const newAsset = getAssetRepo().findById(newAssetId)
    const storedPayload = JSON.parse(newAsset?.replayPayload ?? "{}") as ReplayPayload
    expect(storedPayload.prompt).toBe("watermarked variant")
    expect(storedPayload.providerSpecificParams.addWatermark).toBe(true)
  })

  it("6. {negativePrompt} on mock (supportsNegativePrompt: true) → SSE 200 + payload carries negativePrompt", async () => {
    const sourceId = seedCanonicalSource({ id: "asset_edit_np" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { negativePrompt: "no humans, no text" },
      }),
    })
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await readSSE(res))
    const imageEv = events.find((e) => e.event === "image_generated")
    const newAssetId = (imageEv?.data as { asset: { id: string } }).asset.id
    const stored = JSON.parse(
      getAssetRepo().findById(newAssetId)?.replayPayload ?? "{}",
    ) as ReplayPayload
    expect(stored.providerSpecificParams.negativePrompt).toBe("no humans, no text")
  })
})

describe("POST /replay mode=edit — allowlist rejections (400 EDIT_FIELD_NOT_ALLOWED)", () => {
  it("3. {seed: 999} → 400 with field=seed", async () => {
    const sourceId = seedCanonicalSource({ id: "asset_rej_seed" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { seed: 999 },
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; details?: { field?: string } }
    expect(body.code).toBe("EDIT_FIELD_NOT_ALLOWED")
    expect(body.details?.field).toBe("seed")
  })

  it("4. {providerSpecificParams: {...}} → 400 with field=providerSpecificParams", async () => {
    const sourceId = seedCanonicalSource({ id: "asset_rej_psp" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { providerSpecificParams: { addWatermark: true } },
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; details?: { field?: string } }
    expect(body.code).toBe("EDIT_FIELD_NOT_ALLOWED")
    expect(body.details?.field).toBe("providerSpecificParams")
  })

  it("5. {fictional: 'x'} → 400 with field=fictional", async () => {
    const sourceId = seedCanonicalSource({ id: "asset_rej_unknown" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { fictional: "x" },
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; details?: { field?: string } }
    expect(body.code).toBe("EDIT_FIELD_NOT_ALLOWED")
    expect(body.details?.field).toBe("fictional")
  })
})

describe("POST /replay mode=edit — capability gate", () => {
  // Swap the source model to Imagen 4 (supportsNegativePrompt: false) by
  // editing the seeded row after insert. The in-registry Imagen 4 row exists
  // via `vertex:imagen-4.0-generate-001` — but spinning up a Vertex adapter
  // in a unit-ish integration test needs a stored key. For a 400 gate that
  // fails BEFORE provider.generate(), we can seed with modelId on a known
  // non-supporting path; but the simpler shortcut: assert that the gate
  // fires by mutating the registered model's capability via monkey-patch
  // would cross a test boundary. Pragmatic: seed a real Imagen 4 source
  // but skip the hasActiveKey gate is not available at HTTP layer — any
  // 401 would precede the capability check. Sidestep: use the probe path
  // separately. This case is deferred to a unit test against applyOverride
  // directly in a follow-up; the HTTP happy+reject coverage above exercises
  // both error codes via the strict allowlist path.
  it.todo(
    "6b. negativePrompt on Imagen 4 → 400 CAPABILITY_NOT_SUPPORTED (defer to applyOverride unit — HTTP path needs active Vertex key)",
  )
})

describe("POST /replay — legacy payload dual-reader", () => {
  it("7. mode=edit on legacy source → 400 LEGACY_PAYLOAD_NOT_EDITABLE", async () => {
    const sourceId = seedLegacySource()
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "edit",
        overridePayload: { prompt: "attempt to edit legacy" },
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("LEGACY_PAYLOAD_NOT_EDITABLE")
  })

  it("8. mode=replay on legacy source → SSE 200 (dual-reader preserves pre-Session-#27 rows)", async () => {
    const sourceId = seedLegacySource({ id: "asset_legacy_replay" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await readSSE(res))
    expect(events.map((e) => e.event)).toEqual(["started", "image_generated", "complete"])
  })

  it("9. legacy replay produces new asset whose promptRaw matches legacy promptRaw (synthesis correctness)", async () => {
    const sourceId = seedLegacySource({ id: "asset_legacy_synth" })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const events = parseSSEEvents(await readSSE(res))
    const imageEv = events.find((e) => e.event === "image_generated")
    const newAssetId = (imageEv?.data as { asset: { id: string } }).asset.id
    const newAsset = getAssetRepo().findById(newAssetId)
    expect(newAsset?.promptRaw).toBe("legacy prompt — sunset city skyline")
  })
})

describe("POST /replay — inputParams workflow-specific fields preserved on replay", () => {
  it("10. replayed asset inherits source inputParams verbatim (covers Q-C canonical drop)", async () => {
    const sourceId = seedCanonicalSource({
      id: "asset_input_params_audit",
      inputParams: JSON.stringify({
        conceptTitle: "Deep space",
        tagGroup: "cosmos",
        // Workflow-specific fields that used to live in replayPayload are
        // now inputParams-only. Replay must copy them through unchanged.
        layoutId: "hero_wide_01",
        variantIndex: 3,
      }),
    })
    const res = await fetchApp(`/api/assets/${sourceId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await readSSE(res))
    const imageEv = events.find((e) => e.event === "image_generated")
    const newAssetId = (imageEv?.data as { asset: { id: string } }).asset.id
    const newAsset = getAssetRepo().findById(newAssetId)
    expect(newAsset?.inputParams).toBe(
      JSON.stringify({
        conceptTitle: "Deep space",
        tagGroup: "cosmos",
        layoutId: "hero_wide_01",
        variantIndex: 3,
      }),
    )
  })
})
