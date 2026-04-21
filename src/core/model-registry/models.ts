// Static model catalog. Universal (client + server safe).
// 4 ModelInfo entries matching PLAN §3 Providers v1 table.

import { CAPABILITIES, capabilityKey } from "./capabilities"
import { PROVIDER_IDS } from "./providers"
import type { ModelInfo } from "./types"

export const MODEL_IDS = {
  GEMINI_NB_PRO: "gemini-3-pro-image-preview",
  GEMINI_NB_2:   "gemini-3.1-flash-image-preview",
  IMAGEN_4:      "imagen-4.0-generate-001",
  MOCK_FAST:     "mock-fast",
} as const

export const DEFAULT_MODEL_ID = MODEL_IDS.GEMINI_NB_2

function build(providerId: string, modelId: string, displayName: string, costPerImageUsd: number, avgLatencyMs: number): ModelInfo {
  const capability = CAPABILITIES[capabilityKey(providerId, modelId)]
  if (!capability) throw new Error(`Missing capability entry for ${providerId}:${modelId}`)
  return { id: modelId, providerId, displayName, capability, costPerImageUsd, avgLatencyMs }
}

export const ALL_MODELS: readonly ModelInfo[] = [
  build(PROVIDER_IDS.GEMINI, MODEL_IDS.GEMINI_NB_PRO, "Nano Banana Pro", 0.134, 12000),
  build(PROVIDER_IDS.GEMINI, MODEL_IDS.GEMINI_NB_2,   "Nano Banana 2",   0.067, 6000),
  build(PROVIDER_IDS.VERTEX, MODEL_IDS.IMAGEN_4,      "Imagen 4",        0.04,  8000),
  build(PROVIDER_IDS.MOCK,   MODEL_IDS.MOCK_FAST,    "Mock",             0,     50),
]

export function getModel(modelId: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === modelId)
}

export function modelsByProvider(providerId: string): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.providerId === providerId)
}
