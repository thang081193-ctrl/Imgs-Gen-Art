// Plan §6.2 + DECISIONS.md B2 — every capability entry must have non-empty sourceUrl + valid ISO verifiedAt.
// Also pins Imagen 4 correction (9 languages, negativePrompt false).

import { describe, expect, it } from "vitest"
import { CAPABILITIES, capabilityKey } from "@/core/model-registry/capabilities"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

describe("capability-provenance", () => {
  it("every entry has non-empty sourceUrl", () => {
    for (const [key, cap] of Object.entries(CAPABILITIES)) {
      expect(cap.sourceUrl, `${key}.sourceUrl`).toBeTruthy()
      expect(typeof cap.sourceUrl).toBe("string")
    }
  })

  it("every entry has ISO-date verifiedAt", () => {
    for (const [key, cap] of Object.entries(CAPABILITIES)) {
      expect(cap.verifiedAt, `${key}.verifiedAt`).toMatch(ISO_DATE)
    }
  })

  it("Imagen 4 supports 9+ languages incl. zh-CN + zh-TW (v2.2 correction)", () => {
    const cap = CAPABILITIES[capabilityKey("vertex", "imagen-4.0-generate-001")]
    expect(cap).toBeDefined()
    if (!cap) return
    expect(cap.supportedLanguages).toContain("en")
    expect(cap.supportedLanguages).toContain("zh-CN")
    expect(cap.supportedLanguages).toContain("zh-TW")
    expect(cap.supportedLanguages.length).toBeGreaterThanOrEqual(9)
    // v2.2 CORRECTED: negativePrompt is legacy
    expect(cap.supportsNegativePrompt).toBe(false)
    // Imagen is still deterministic seed
    expect(cap.supportsDeterministicSeed).toBe(true)
    // No image editing (style-transform incompatible)
    expect(cap.supportsImageEditing).toBe(false)
  })

  it("Imagen 4 does NOT support Vietnamese (runtime-validator fail case)", () => {
    const cap = CAPABILITIES[capabilityKey("vertex", "imagen-4.0-generate-001")]
    expect(cap?.supportedLanguages).not.toContain("vi")
  })

  it("Nano Banana 2 is the default-tier gemini model with full aspect + language set", () => {
    const cap = CAPABILITIES[capabilityKey("gemini", "gemini-3.1-flash-image-preview")]
    expect(cap).toBeDefined()
    if (!cap) return
    expect(cap.supportedAspectRatios).toContain("1:1")
    expect(cap.supportedAspectRatios).toContain("4:5")
    expect(cap.supportedLanguages).toContain("vi")
    expect(cap.maxResolution).toBe("4K")
  })
})
