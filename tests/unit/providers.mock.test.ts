// Mock provider — satisfies ImageProvider contract + mock-specific determinism +
// registry behavior (including ProviderNotFoundError structured context).

import { describe, expect, it } from "vitest"
import { MODEL_IDS } from "@/core/model-registry/models"
import { runProviderContract } from "@/core/providers/contract"
import { ProviderNotFoundError } from "@/core/shared/errors"
import { mockProvider } from "@/server/providers/mock"
import { getProvider, hasProvider, listProviders } from "@/server/providers/registry"

runProviderContract("mock", () => mockProvider, {
  validModelId: MODEL_IDS.MOCK_FAST,
})

describe("mock provider — specifics", () => {
  const baseParams = { modelId: MODEL_IDS.MOCK_FAST, aspectRatio: "1:1" as const }

  it("produces deterministic bytes for the same prompt", async () => {
    const r1 = await mockProvider.generate({ prompt: "banh-mi", ...baseParams })
    const r2 = await mockProvider.generate({ prompt: "banh-mi", ...baseParams })
    expect(r1.imageBytes.length).toBe(r2.imageBytes.length)
    expect(Buffer.from(r1.imageBytes).equals(Buffer.from(r2.imageBytes))).toBe(true)
  })

  it("produces different bytes for different prompts", async () => {
    const a = await mockProvider.generate({ prompt: "alpha", ...baseParams })
    const b = await mockProvider.generate({ prompt: "beta", ...baseParams })
    expect(Buffer.from(a.imageBytes).equals(Buffer.from(b.imageBytes))).toBe(false)
  })

  it("returns 1024×1024 by default", async () => {
    const r = await mockProvider.generate({ prompt: "dims", ...baseParams })
    expect(r.width).toBe(1024)
    expect(r.height).toBe(1024)
  })

  it("echoes seedUsed when seed is passed", async () => {
    const r = await mockProvider.generate({ prompt: "s", ...baseParams, seed: 42 })
    expect(r.seedUsed).toBe(42)
  })

  it("omits seedUsed when no seed is passed", async () => {
    const r = await mockProvider.generate({ prompt: "s", ...baseParams })
    expect(r.seedUsed).toBeUndefined()
  })

  it("supportedModels contains mock-fast", () => {
    const ids = mockProvider.supportedModels.map((m) => m.id)
    expect(ids).toContain(MODEL_IDS.MOCK_FAST)
  })
})

describe("provider registry", () => {
  it("listProviders includes mock", () => {
    const ids = listProviders().map((p) => p.id)
    expect(ids).toContain("mock")
  })

  it("hasProvider returns true for 'mock' and false for unknown", () => {
    expect(hasProvider("mock")).toBe(true)
    expect(hasProvider("nope")).toBe(false)
  })

  it("getProvider('mock') returns the mockProvider instance", () => {
    expect(getProvider("mock")).toBe(mockProvider)
  })

  it("getProvider(unknown) throws ProviderNotFoundError with structured context", () => {
    let caught: unknown
    try {
      getProvider("xyz")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderNotFoundError)
    const err = caught as ProviderNotFoundError
    expect(err.code).toBe("PROVIDER_NOT_FOUND")
    expect(err.status).toBe(404)
    expect(err.message).toContain("'xyz'")
    expect(err.message).toContain("'mock'")
    expect(err.details).toMatchObject({
      providerId: "xyz",
      availableProviders: expect.arrayContaining(["mock"]),
    })
  })
})
