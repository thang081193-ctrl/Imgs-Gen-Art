// Session #15 Q5 — unit tests for the shared replay-class helper.
//
// computeReplayClass classifies an asset as "deterministic" only when
// ALL three conditions hold:
//   1. capability.supportsDeterministicSeed === true
//   2. seed !== undefined
//   3. providerSpecificParams.addWatermark === false (explicit)

import { describe, expect, it } from "vitest"

import { computeReplayClass } from "@/core/shared/replay-class"
import type { ProviderCapability } from "@/core/model-registry/types"

const deterministic: ProviderCapability = {
  supportsTextToImage: true,
  supportsImageEditing: false,
  supportsStyleReference: false,
  supportsMultiImageFusion: false,
  supportsCharacterConsistency: false,
  supportsTextInImage: "precision",
  maxResolution: "4K",
  supportedAspectRatios: ["1:1"],
  supportedLanguages: ["en"],
  supportsDeterministicSeed: true,
  supportsNegativePrompt: false,
  sourceUrl: "test",
  verifiedAt: "2026-04-22",
}

const nondeterministic: ProviderCapability = {
  ...deterministic,
  supportsDeterministicSeed: false,
}

describe("computeReplayClass", () => {
  it("returns 'deterministic' when all 3 conditions hold", () => {
    const result = computeReplayClass(deterministic, {
      seed: 42,
      providerSpecificParams: { addWatermark: false },
    })
    expect(result).toBe("deterministic")
  })

  it("returns 'best_effort' when capability.supportsDeterministicSeed is false", () => {
    const result = computeReplayClass(nondeterministic, {
      seed: 42,
      providerSpecificParams: { addWatermark: false },
    })
    expect(result).toBe("best_effort")
  })

  it("returns 'best_effort' when seed is undefined", () => {
    const result = computeReplayClass(deterministic, {
      providerSpecificParams: { addWatermark: false },
    })
    expect(result).toBe("best_effort")
  })

  it("returns 'best_effort' when addWatermark is undefined (helper treats absence as ambiguous)", () => {
    const result = computeReplayClass(deterministic, {
      seed: 42,
    })
    expect(result).toBe("best_effort")
  })

  it("returns 'best_effort' when addWatermark is true", () => {
    const result = computeReplayClass(deterministic, {
      seed: 42,
      providerSpecificParams: { addWatermark: true },
    })
    expect(result).toBe("best_effort")
  })

  it("returns 'best_effort' when providerSpecificParams is undefined", () => {
    const result = computeReplayClass(deterministic, { seed: 42 })
    expect(result).toBe("best_effort")
  })
})
