// Plan §7 — resolver + runtime-validator tests covering both happy paths and key fail cases.

import { describe, expect, it } from "vitest"
import { resolveCompatibility, validateRuntime } from "@/core/compatibility"
import type { WorkflowCompatInput } from "@/core/compatibility/types"
import { ALL_MODELS, getModel } from "@/core/model-registry/models"
import { capabilityKey, getCapability } from "@/core/model-registry/capabilities"

const artworkBatch: WorkflowCompatInput = {
  id: "artwork-batch",
  requirement: {
    required: ["supportsTextToImage"],
    preferred: ["supportsTextInImage"],
  },
  compatibilityOverrides: [],
}

const styleTransform: WorkflowCompatInput = {
  id: "style-transform",
  requirement: {
    required: ["supportsTextToImage", "supportsImageEditing"],
    preferred: ["supportsStyleReference"],
  },
  compatibilityOverrides: [],
}

const adProduction: WorkflowCompatInput = {
  id: "ad-production",
  requirement: {
    required: ["supportsTextToImage"],
    preferred: ["supportsTextInImage", "supportsCharacterConsistency"],
  },
  compatibilityOverrides: [],
}

describe("resolver: happy path (artwork-batch accepts all 4 models)", () => {
  const matrix = resolveCompatibility({
    workflows: [artworkBatch],
    models: ALL_MODELS,
  })

  it("all 4 models compatible with artwork-batch", () => {
    const row = matrix["artwork-batch"]
    for (const m of ALL_MODELS) {
      const key = `${m.providerId}:${m.id}`
      expect(row[key]?.status, key).toBe("compatible")
    }
  })

  it("recommendedForWorkflow flag set on highest-scoring models", () => {
    const row = matrix["artwork-batch"]
    const recommendedCount = Object.values(row).filter((r) => r.recommendedForWorkflow).length
    expect(recommendedCount).toBeGreaterThanOrEqual(1)
  })
})

describe("resolver: style-transform — Imagen 4 incompatible (no imageEditing)", () => {
  const matrix = resolveCompatibility({
    workflows: [styleTransform],
    models: ALL_MODELS,
  })

  it("Imagen 4 marked incompatible with reason", () => {
    const r = matrix["style-transform"]["vertex:imagen-4.0-generate-001"]
    expect(r?.status).toBe("incompatible")
    expect(r?.reason).toMatch(/supportsImageEditing/)
  })

  it("Gemini NB 2 + NB Pro compatible", () => {
    expect(matrix["style-transform"]["gemini:gemini-3.1-flash-image-preview"]?.status).toBe("compatible")
    expect(matrix["style-transform"]["gemini:gemini-3-pro-image-preview"]?.status).toBe("compatible")
  })
})

describe("resolver: override trumps declarative", () => {
  const withOverride: WorkflowCompatInput = {
    ...adProduction,
    compatibilityOverrides: [
      {
        providerId: "vertex",
        modelId: "imagen-4.0-generate-001",
        forceStatus: "incompatible",
        reason: "manual override for testing",
      },
    ],
  }

  const matrix = resolveCompatibility({
    workflows: [withOverride],
    models: ALL_MODELS,
  })

  it("override flips compatibility + reports source=override", () => {
    const r = matrix["ad-production"]["vertex:imagen-4.0-generate-001"]
    expect(r?.status).toBe("incompatible")
    expect(r?.source).toBe("override")
    expect(r?.reason).toBe("manual override for testing")
  })
})

describe("runtime-validator", () => {
  it("passes for Imagen 4 + 1:1 + en", () => {
    const cap = getCapability("vertex", "imagen-4.0-generate-001")
    expect(cap).toBeDefined()
    if (!cap) return
    const r = validateRuntime({ capability: cap, aspectRatio: "1:1", language: "en" })
    expect(r.ok).toBe(true)
  })

  it("fails Imagen 4 + 4:5 (unsupported aspect)", () => {
    const cap = getCapability("vertex", "imagen-4.0-generate-001")
    expect(cap).toBeDefined()
    if (!cap) return
    const r = validateRuntime({ capability: cap, aspectRatio: "4:5" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("ASPECT_RATIO_UNSUPPORTED")
  })

  it("fails Imagen 4 + vi (unsupported language)", () => {
    const cap = getCapability("vertex", "imagen-4.0-generate-001")
    expect(cap).toBeDefined()
    if (!cap) return
    const r = validateRuntime({ capability: cap, aspectRatio: "1:1", language: "vi" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("LANGUAGE_UNSUPPORTED")
  })

  it("passes NB 2 + 4:5 + vi", () => {
    const cap = getCapability("gemini", "gemini-3.1-flash-image-preview")
    expect(cap).toBeDefined()
    if (!cap) return
    const r = validateRuntime({ capability: cap, aspectRatio: "4:5", language: "vi" })
    expect(r.ok).toBe(true)
  })
})

describe("model registry wiring (sanity)", () => {
  it("getModel resolves all 4 IDs", () => {
    expect(getModel("gemini-3-pro-image-preview")).toBeDefined()
    expect(getModel("gemini-3.1-flash-image-preview")).toBeDefined()
    expect(getModel("imagen-4.0-generate-001")).toBeDefined()
    expect(getModel("mock-fast")).toBeDefined()
  })

  it("capabilityKey format is providerId:modelId", () => {
    expect(capabilityKey("gemini", "x")).toBe("gemini:x")
  })
})
