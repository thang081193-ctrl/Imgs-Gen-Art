// Universal model-registry types. Zod schemas for aspect ratio + language source-of-truth.
// Plan §5.6.

import { z } from "zod"

export const AspectRatioSchema = z.enum([
  "1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9",
])
export type AspectRatio = z.infer<typeof AspectRatioSchema>

export const LanguageCodeSchema = z.enum([
  "en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh",
  "zh-CN", "zh-TW",
])
export type LanguageCode = z.infer<typeof LanguageCodeSchema>

// ProviderCapability — canonical universal shape. Single source of truth for client + server.
// (Server provider impls re-export from here; do not redefine elsewhere.)
export interface ProviderCapability {
  supportsTextToImage: boolean
  supportsImageEditing: boolean
  supportsStyleReference: boolean
  supportsMultiImageFusion: boolean
  supportsCharacterConsistency: boolean
  supportsTextInImage: "none" | "basic" | "precision"
  maxResolution: "1K" | "2K" | "4K"
  supportedAspectRatios: AspectRatio[]
  supportedLanguages: LanguageCode[]
  supportsDeterministicSeed: boolean
  supportsNegativePrompt: boolean
  sourceUrl: string
  verifiedAt: string  // ISO date
}

export interface ProviderInfo {
  id: string
  displayName: string
}

export interface ModelInfo {
  id: string
  providerId: string
  displayName: string
  capability: ProviderCapability
  costPerImageUsd: number
  avgLatencyMs: number
}
