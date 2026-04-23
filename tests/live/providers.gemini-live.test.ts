// Live smoke tests for the Gemini adapter — gated by GEMINI_API_KEY.
// Skipped entirely when the env is missing so `npm run regression:full` stays
// hermetic. Budget per full run: ~$0.20 (1×NB Pro $0.13 + 1×NB 2 $0.067).
// DO NOT run in CI on every commit. `npm run test:live` on demand.
//
// Each test constructs a minimal prompt so the billable call stays small.
// health() probes are free (models.list call).

import { describe, expect, it } from "vitest"
import { MODEL_IDS } from "@/core/model-registry/models"
import { geminiProvider } from "@/server/providers/gemini"

const HAS_KEY = typeof process.env["GEMINI_API_KEY"] === "string" && process.env["GEMINI_API_KEY"].length > 0
const apiKey = process.env["GEMINI_API_KEY"] ?? ""

describe.skipIf(!HAS_KEY)("Gemini NB Pro — live", () => {
  it(
    "health() returns ok for a valid key + model present in account",
    async () => {
      const status = await geminiProvider.health(MODEL_IDS.GEMINI_NB_PRO, { apiKey })
      expect(status.status).toBe("ok")
      expect(status.latencyMs).toBeGreaterThan(0)
    },
    15000,
  )

  it(
    "generate() returns real PNG bytes for a minimal prompt",
    async () => {
      const result = await geminiProvider.generate({
        prompt: "A simple red circle on white background.",
        modelId: MODEL_IDS.GEMINI_NB_PRO,
        aspectRatio: "1:1",
      })
      expect(result.imageBytes.length).toBeGreaterThan(1000)
      expect(result.mimeType).toMatch(/^image\/(png|jpeg)$/)
      expect(result.generationTimeMs).toBeGreaterThan(0)
    },
    45000,
  )
})

describe.skipIf(!HAS_KEY)("Gemini NB 2 — live", () => {
  it(
    "health() returns ok for a valid key + model present in account",
    async () => {
      const status = await geminiProvider.health(MODEL_IDS.GEMINI_NB_2, { apiKey })
      expect(status.status).toBe("ok")
      expect(status.latencyMs).toBeGreaterThan(0)
    },
    15000,
  )

  it(
    "generate() returns real PNG bytes for a minimal prompt",
    async () => {
      const result = await geminiProvider.generate({
        prompt: "A simple blue square.",
        modelId: MODEL_IDS.GEMINI_NB_2,
        aspectRatio: "1:1",
      })
      expect(result.imageBytes.length).toBeGreaterThan(1000)
      expect(result.mimeType).toMatch(/^image\/(png|jpeg)$/)
      expect(result.generationTimeMs).toBeGreaterThan(0)
    },
    30000,
  )

  it(
    "generate() respects a pre-aborted signal (no billable call)",
    async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(
        geminiProvider.generate({
          prompt: "aborted",
          modelId: MODEL_IDS.GEMINI_NB_2,
          aspectRatio: "1:1",
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow()
    },
    5000,
  )
})
