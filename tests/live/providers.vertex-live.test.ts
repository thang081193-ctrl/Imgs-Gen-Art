// Live smoke tests for the Vertex Imagen adapter — gated by BOTH
// VERTEX_PROJECT_ID and VERTEX_SA_PATH. Skipped entirely when either is
// missing so `npm run regression:full` stays hermetic.
//
// Budget per full run:
//   • health() probe (free — models.list)
//   • 1× happy-path generate  → $0.04
//   • 1× pre-abort reject    → free (no billable call)
//   • deterministic-seed pair → 2×$0.04 = $0.08
//   • counter-check (diff seed) pair → 2×$0.04 = $0.08 (shares slot with deterministic)
//   Total ≈ $0.20. DO NOT run in CI on every commit. `npm run test:live` on demand.
//
// Uses `context.serviceAccount` to bypass active-slot lookup — no slot-manager
// state is touched, so tests are independent of data/keys.enc.

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MODEL_IDS } from "@/core/model-registry/models"
import type { VertexServiceAccount } from "@/core/providers/types"
import { vertexImagenProvider } from "@/server/providers/vertex-imagen"

const PROJECT_ID = process.env["VERTEX_PROJECT_ID"] ?? ""
const SA_PATH = process.env["VERTEX_SA_PATH"] ?? ""
const LOCATION = process.env["VERTEX_LOCATION"] ?? "us-central1"
const HAS_ENV = PROJECT_ID.length > 0 && SA_PATH.length > 0

function loadServiceAccount(): VertexServiceAccount {
  const raw = readFileSync(SA_PATH, "utf8")
  return JSON.parse(raw) as VertexServiceAccount
}

describe.skipIf(!HAS_ENV)("Vertex Imagen — live", () => {
  it(
    "health() returns ok against a real project with valid SA",
    async () => {
      const serviceAccount = loadServiceAccount()
      const status = await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4, {
        serviceAccount,
      })
      expect(status.status).toBe("ok")
      expect(status.latencyMs).toBeGreaterThan(0)
    },
    30000,
  )

  it(
    "generate() returns real PNG bytes for a minimal prompt",
    async () => {
      // Temporarily inject the resolved SA as the active slot by using the
      // context path — mirror the key-test-endpoint flow. But generate()
      // doesn't accept a HealthCheckContext; we need an active slot for this
      // one. Fall-through to the slot-manager flow via a temporary env setup:
      // the user's `keys.enc` already has an active Vertex slot in practice
      // when running this suite manually. If bro wants to re-run from a
      // clean workspace, set VERTEX_PROJECT_ID + VERTEX_SA_PATH via the
      // POST /keys flow first or run scripts/seed-vertex-slot.ts (future).
      const result = await vertexImagenProvider.generate({
        prompt: "A simple red circle on white background.",
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
        providerSpecificParams: { addWatermark: false },
      })
      expect(result.imageBytes.length).toBeGreaterThan(1000)
      expect(result.mimeType).toMatch(/^image\/(png|jpeg)$/)
      expect(result.generationTimeMs).toBeGreaterThan(0)
    },
    60000,
  )

  it(
    "generate() respects a pre-aborted signal (no billable call)",
    async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(
        vertexImagenProvider.generate({
          prompt: "aborted",
          modelId: MODEL_IDS.IMAGEN_4,
          aspectRatio: "1:1",
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow()
    },
    5000,
  )
})

// Deterministic seed + watermark:false is a pre-condition for PLAN §7.4
// replayClass === "deterministic". Session #15 encoded this in
// computeReplayClass; here we verify the provider actually produces
// byte-identical output under the same inputs.
describe.skipIf(!HAS_ENV)("Vertex Imagen — deterministic seed", () => {
  const basePrompt = "A simple red square centered on white background, flat solid colors."

  it(
    "same seed + same prompt + watermark:false → identical bytes",
    async () => {
      const a = await vertexImagenProvider.generate({
        prompt: basePrompt,
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
        seed: 42,
        providerSpecificParams: { addWatermark: false },
      })
      const b = await vertexImagenProvider.generate({
        prompt: basePrompt,
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
        seed: 42,
        providerSpecificParams: { addWatermark: false },
      })
      expect(Buffer.compare(Buffer.from(a.imageBytes), Buffer.from(b.imageBytes))).toBe(0)
      expect(a.seedUsed).toBe(42)
      expect(b.seedUsed).toBe(42)
    },
    90000,
  )

  it(
    "different seed produces different bytes (counter-check)",
    async () => {
      const a = await vertexImagenProvider.generate({
        prompt: basePrompt,
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
        seed: 42,
        providerSpecificParams: { addWatermark: false },
      })
      const b = await vertexImagenProvider.generate({
        prompt: basePrompt,
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
        seed: 100,
        providerSpecificParams: { addWatermark: false },
      })
      expect(Buffer.compare(Buffer.from(a.imageBytes), Buffer.from(b.imageBytes))).not.toBe(0)
    },
    90000,
  )
})
