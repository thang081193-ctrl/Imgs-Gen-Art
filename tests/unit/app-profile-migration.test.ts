// DECISIONS §F.1/§F.2 — union + transform migration pattern test cases.
// Covers the 5 union-schema contracts Q-31.C locked; a 6th case
// ("migration fn sets defaults for v2-only required fields") is
// reserved as a comment placeholder until v3 adds a required field
// that v1/v2 files lack.

import { describe, expect, it } from "vitest"
import {
  AppProfileSchema,
  AppProfileV1Schema,
  AppProfileV2Schema,
} from "@/core/schemas/app-profile"

// Minimal valid AppProfile body — every required field populated.
// Test cases override `version` or mutate shape on top of this base.
function baseBody(): Record<string, unknown> {
  return {
    id: "ai-chatbot",
    name: "AI Chatbot",
    tagline: "Chat, transcribed.",
    category: "productivity",
    assets: {
      appLogoAssetId: null,
      storeBadgeAssetId: null,
      screenshotAssetIds: [],
    },
    visual: {
      primaryColor: "#3b82f6",
      secondaryColor: "#6366f1",
      accentColor: "#f59e0b",
      tone: "minimal",
      doList: ["clean"],
      dontList: ["noisy"],
    },
    positioning: {
      usp: "fast replies",
      targetPersona: "knowledge worker",
      marketTier: "global",
    },
    context: {
      features: ["voice"],
      keyScenarios: ["meeting notes"],
      forbiddenContent: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("AppProfileSchema — union + transform migration", () => {
  it("case 1 — v1 valid input parses + migrates to v2 output shape", () => {
    const input = { ...baseBody(), version: 1 }
    const output = AppProfileSchema.parse(input)
    // v2a: transform is identity; version stays 1 (v2 accepts numeric 1).
    expect(output.version).toBe(1)
    expect(output.id).toBe("ai-chatbot")
    // Output type is v2 — number(), not literal(1). Assert by widening:
    // any positive int is accepted when we construct at runtime.
    const bumped = { ...output, version: 2 }
    expect(() => AppProfileV2Schema.parse(bumped)).not.toThrow()
  })

  it("case 2 — v2 valid input (version > 1) parses unchanged", () => {
    const input = { ...baseBody(), version: 42 }
    const output = AppProfileSchema.parse(input)
    expect(output.version).toBe(42)
  })

  it("case 3 — v1 invalid shape rejected (bad hex color)", () => {
    const input = {
      ...baseBody(),
      version: 1,
      visual: { ...baseBody().visual as Record<string, unknown>, primaryColor: "not-hex" },
    }
    expect(() => AppProfileSchema.parse(input)).toThrow()
  })

  it("case 4 — v2 invalid rejected (version < 1)", () => {
    const input = { ...baseBody(), version: 0 }
    // Neither branch matches: V1 requires literal 1, V2 requires >= 1.
    expect(() => AppProfileSchema.parse(input)).toThrow()
    // Assert against each branch individually for clarity.
    expect(() => AppProfileV1Schema.parse(input)).toThrow()
    expect(() => AppProfileV2Schema.parse(input)).toThrow()
  })

  it("case 5 — unknown version type rejected (string, bigint, missing)", () => {
    const inputs: Array<Record<string, unknown>> = [
      { ...baseBody(), version: "1" },
      { ...baseBody(), version: 1.5 },
      { ...baseBody() }, // version missing
    ]
    for (const input of inputs) {
      expect(() => AppProfileSchema.parse(input)).toThrow()
    }
  })

  // Case 6 placeholder — activates when v3 lands. Pattern:
  //   it("case 6 — migration fn fills v3-only required field default", () => {
  //     const v2Input = { ...baseBody(), version: 5 } // no v3 field
  //     const output = AppProfileSchema.parse(v2Input)
  //     expect(output.newRequiredField).toBe(DEFAULT_V3_VALUE)
  //   })
  // Until then, v2a is a pure identity transform; no defaults needed.
})
