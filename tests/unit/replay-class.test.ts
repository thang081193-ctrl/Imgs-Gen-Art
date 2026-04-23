// Session #15 Q5 — unit tests for the shared replay-class helper.
//
// computeReplayClass classifies an asset as "deterministic" only when
// ALL three conditions hold:
//   1. capability.supportsDeterministicSeed === true
//   2. seed !== undefined
//   3. providerSpecificParams.addWatermark === false (explicit)

import { describe, expect, it } from "vitest"

import {
  computeNotReplayableReason,
  computeReplayClass,
} from "@/core/shared/replay-class"
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

// Session #26 (Phase 5 Step 2 fold-in) — reason helper drives the disabled
// Replay button tooltip copy in AssetDetailModal. Priority order: seed_missing
// > provider_no_seed_support > watermark_applied (catch-all).
describe("computeNotReplayableReason", () => {
  it("returns 'seed_missing' when asset.seed is null (highest priority)", () => {
    const reason = computeNotReplayableReason({
      seed: null,
      capability: deterministic,
    })
    expect(reason).toBe("seed_missing")
  })

  it("returns 'seed_missing' even if capability is undefined (seed check wins)", () => {
    const reason = computeNotReplayableReason({ seed: null, capability: undefined })
    expect(reason).toBe("seed_missing")
  })

  it("returns 'provider_no_seed_support' when capability is undefined (model dropped from registry)", () => {
    const reason = computeNotReplayableReason({ seed: 42, capability: undefined })
    expect(reason).toBe("provider_no_seed_support")
  })

  it("returns 'provider_no_seed_support' when capability.supportsDeterministicSeed is false", () => {
    const reason = computeNotReplayableReason({
      seed: 42,
      capability: nondeterministic,
    })
    expect(reason).toBe("provider_no_seed_support")
  })

  it("returns 'watermark_applied' catch-all when seed present + provider supports seed", () => {
    const reason = computeNotReplayableReason({
      seed: 42,
      capability: deterministic,
    })
    expect(reason).toBe("watermark_applied")
  })
})
