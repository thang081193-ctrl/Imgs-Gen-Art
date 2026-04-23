// Session #27b — unit tests for the extracted applyOverride pure function
// (carry-forward #4 from Session #27a — replay-service LOC soft-cap creep).
// Exercises the 3 reject paths + 4 happy-path edge cases bro listed in
// alignment:
//   - override.addWatermark === false (falsy explicit, distinct from undefined)
//   - override.negativePrompt === "" (empty string explicit)
//   - override empty ({}) → canonical payload round-trips unchanged
//   - providerSpecificParams merge preserves existing keys
//
// Integration wiring (executeReplay → applyOverride → throw surfaces through
// the async generator) stays in replay-service.test.ts "mode=edit capability
// gate" block — a single integration smoke there guards against the call
// site being accidentally removed.

import { describe, expect, it } from "vitest"

import type { ModelInfo } from "@/core/model-registry/types"
import { getModel } from "@/core/model-registry/models"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
import {
  CapabilityNotSupportedError,
  LegacyPayloadNotEditableError,
} from "@/core/shared/errors"
import type { ReplayExecuteFields } from "@/server/workflows-runtime/replay-execute-fields"
import {
  applyOverride,
  type ApplyOverrideInput,
} from "@/server/workflows-runtime/replay-override"

const MOCK_MODEL_ID = "mock-fast"

const baseProfile: AppProfile = {
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
    doList: ["a"],
    dontList: ["b"],
  },
  positioning: { usp: "x", targetPersona: "y", marketTier: "global" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}

function baseExecute(): ReplayExecuteFields {
  return {
    prompt: "a serene mountain lake",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    aspectRatio: "1:1",
    seed: 42,
    addWatermark: true,
  }
}

function baseCanonical(): ReplayPayload {
  return {
    version: 1,
    prompt: "a serene mountain lake",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    aspectRatio: "1:1",
    seed: 42,
    providerSpecificParams: { addWatermark: true },
    promptTemplateId: "artwork-batch",
    promptTemplateVersion: "1",
    contextSnapshot: {
      profileId: baseProfile.id,
      profileVersion: baseProfile.version,
      profileSnapshot: baseProfile,
    },
  }
}

function mockModel(): ModelInfo {
  const m = getModel(MOCK_MODEL_ID)
  if (!m) throw new Error("mock-fast missing from registry")
  return m
}

function cappedNoNegative(): ModelInfo {
  const m = mockModel()
  return {
    ...m,
    capability: { ...m.capability, supportsNegativePrompt: false },
  }
}

function baseInput(overrides: Partial<ApplyOverrideInput> = {}): ApplyOverrideInput {
  return {
    sourceAsset: { id: "asset_src001" },
    model: mockModel(),
    execute: baseExecute(),
    kind: "canonical",
    canonical: baseCanonical(),
    ...overrides,
  }
}

describe("applyOverride — reject paths", () => {
  it("throws LegacyPayloadNotEditableError when kind === 'legacy'", () => {
    const input = baseInput({ kind: "legacy", canonical: null })
    expect(() => applyOverride(input, { prompt: "new prompt" })).toThrow(
      LegacyPayloadNotEditableError,
    )
  })

  it("throws LegacyPayloadNotEditableError when canonical === null even on kind canonical (defense-in-depth)", () => {
    const input = baseInput({ kind: "canonical", canonical: null })
    expect(() => applyOverride(input, { prompt: "new" })).toThrow(
      LegacyPayloadNotEditableError,
    )
  })

  it("throws CapabilityNotSupportedError when negativePrompt targets model without supportsNegativePrompt", () => {
    const input = baseInput({ model: cappedNoNegative() })
    expect(() => applyOverride(input, { negativePrompt: "no text please" })).toThrow(
      CapabilityNotSupportedError,
    )
  })
})

describe("applyOverride — happy path + edge cases", () => {
  it("empty override → execute unchanged + payload round-trips to same canonical", () => {
    const input = baseInput()
    const { execute, newPayloadJson } = applyOverride(input, {})
    expect(execute).toEqual(input.execute)
    expect(JSON.parse(newPayloadJson)).toEqual(input.canonical)
  })

  it("prompt override → new prompt lands in both execute and canonical", () => {
    const input = baseInput()
    const { execute, newPayloadJson } = applyOverride(input, { prompt: "a neon city" })
    expect(execute.prompt).toBe("a neon city")
    const parsed = JSON.parse(newPayloadJson) as ReplayPayload
    expect(parsed.prompt).toBe("a neon city")
  })

  it("addWatermark === false (explicit falsy) → lands as false, not swallowed as undefined", () => {
    const input = baseInput()
    expect(input.execute.addWatermark).toBe(true)
    const { execute, newPayloadJson } = applyOverride(input, { addWatermark: false })
    expect(execute.addWatermark).toBe(false)
    const parsed = JSON.parse(newPayloadJson) as ReplayPayload
    expect(parsed.providerSpecificParams.addWatermark).toBe(false)
  })

  it("negativePrompt === '' (empty string explicit) → lands as empty string (distinct from undefined)", () => {
    const input = baseInput()
    const { execute, newPayloadJson } = applyOverride(input, { negativePrompt: "" })
    expect(execute.negativePrompt).toBe("")
    const parsed = JSON.parse(newPayloadJson) as ReplayPayload
    expect(parsed.providerSpecificParams.negativePrompt).toBe("")
  })

  it("providerSpecificParams merge preserves existing passthrough keys from original canonical", () => {
    const canonical = baseCanonical()
    canonical.providerSpecificParams = {
      addWatermark: true,
      customPassthrough: "sentinel",
      nestedFoo: { deep: 123 },
    }
    const input = baseInput({ canonical })
    const { newPayloadJson } = applyOverride(input, { addWatermark: false })
    const parsed = JSON.parse(newPayloadJson) as ReplayPayload
    expect(parsed.providerSpecificParams.addWatermark).toBe(false)
    expect(parsed.providerSpecificParams.customPassthrough).toBe("sentinel")
    expect(parsed.providerSpecificParams.nestedFoo).toEqual({ deep: 123 })
  })

  it("does not mutate the input context (returns fresh execute + payload)", () => {
    const input = baseInput()
    const snapshotExecute = { ...input.execute }
    const snapshotCanonical = JSON.parse(JSON.stringify(input.canonical))
    applyOverride(input, { prompt: "mutated", addWatermark: false })
    expect(input.execute).toEqual(snapshotExecute)
    expect(input.canonical).toEqual(snapshotCanonical)
  })
})
