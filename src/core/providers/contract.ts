// Reusable ImageProvider contract suite.
// Any provider implementation (mock, gemini, vertex) must satisfy this.
// Consumers call `runProviderContract(name, factory, fixtures)` from a test file.
//
// Lives in src/core so it has zero coupling to any concrete provider and can be
// imported by tests for every provider uniformly.

import { describe, expect, it } from "vitest"
import type { AspectRatio } from "../model-registry/types"
import type { GenerateParams, HealthStatusCode, ImageProvider } from "./types"

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const VALID_STATUSES: HealthStatusCode[] = [
  "ok", "quota_exceeded", "auth_error", "rate_limited", "down",
]

export interface ProviderContractFixtures {
  validModelId: string
  aspectRatio?: AspectRatio  // defaults to "1:1"
}

export function runProviderContract(
  name: string,
  factory: () => ImageProvider,
  fixtures: ProviderContractFixtures,
): void {
  const aspectRatio: AspectRatio = fixtures.aspectRatio ?? "1:1"
  const baseParams = (overrides: Partial<GenerateParams> = {}): GenerateParams => ({
    prompt: "contract probe",
    modelId: fixtures.validModelId,
    aspectRatio,
    ...overrides,
  })

  describe(`ImageProvider contract — ${name}`, () => {
    it("exposes id, displayName, supportedModels", () => {
      const p = factory()
      expect(p.id).toBeTruthy()
      expect(p.displayName).toBeTruthy()
      expect(Array.isArray(p.supportedModels)).toBe(true)
      expect(p.supportedModels.length).toBeGreaterThan(0)
    })

    it("health() returns a valid HealthStatus with ISO checkedAt", async () => {
      const p = factory()
      const h = await p.health(fixtures.validModelId)
      expect(VALID_STATUSES).toContain(h.status)
      expect(h.checkedAt).toEqual(new Date(h.checkedAt).toISOString())
    })

    it("generate() returns PNG with magic bytes and positive dimensions", async () => {
      const p = factory()
      const result = await p.generate(baseParams())
      expect(result.imageBytes).toBeInstanceOf(Uint8Array)
      expect(result.imageBytes.length).toBeGreaterThan(PNG_MAGIC.length)
      for (let i = 0; i < PNG_MAGIC.length; i++) {
        expect(result.imageBytes[i]).toBe(PNG_MAGIC[i])
      }
      expect(result.mimeType).toBe("image/png")
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("generate() rejects when abortSignal is already aborted", async () => {
      const p = factory()
      const controller = new AbortController()
      controller.abort()
      await expect(
        p.generate(baseParams({ abortSignal: controller.signal })),
      ).rejects.toThrow()
    })

    it("generate() rejects when abortSignal aborts mid-flight", async () => {
      const p = factory()
      const controller = new AbortController()
      const promise = p.generate(baseParams({ abortSignal: controller.signal }))
      controller.abort()
      await expect(promise).rejects.toThrow()
    })
  })
}
