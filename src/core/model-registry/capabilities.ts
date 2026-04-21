// src/core/model-registry/capabilities.ts
// Plan §6.2 — capability registry with provenance (sourceUrl + verifiedAt per entry).
// v2.2 CORRECTED: Imagen 4 supports 9 languages (not just "en"); negativePrompt is legacy (removed in 3.0-generate-002+).

import type { ProviderCapability } from "./types"

export const CAPABILITIES: Record<string, ProviderCapability> = {
  "gemini:gemini-3-pro-image-preview": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: false,
    supportsNegativePrompt: false,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    verifiedAt: "2026-04-20",
  },
  "gemini:gemini-3.1-flash-image-preview": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: false,
    supportsNegativePrompt: false,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    verifiedAt: "2026-04-20",
  },
  "vertex:imagen-4.0-generate-001": {
    supportsTextToImage: true,
    supportsImageEditing: false,
    supportsStyleReference: false,
    supportsMultiImageFusion: false,
    supportsCharacterConsistency: false,
    supportsTextInImage: "basic",
    maxResolution: "2K",
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    // v2.2 CORRECTED: 9 languages via translation (not just "en")
    supportedLanguages: ["en", "zh", "zh-CN", "zh-TW", "fr", "de", "hi", "ja", "ko", "pt", "es"],
    supportsDeterministicSeed: true,
    // v2.2 CORRECTED: negativePrompt legacy, removed in Imagen 3.0-generate-002+
    supportsNegativePrompt: false,
    sourceUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/4-0-generate",
    verifiedAt: "2026-04-20",
  },
  "mock:mock-fast": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: true,
    supportsNegativePrompt: true,
    sourceUrl: "internal",
    verifiedAt: "2026-04-20",
  },
}

export function capabilityKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`
}

export function getCapability(providerId: string, modelId: string): ProviderCapability | undefined {
  return CAPABILITIES[capabilityKey(providerId, modelId)]
}
