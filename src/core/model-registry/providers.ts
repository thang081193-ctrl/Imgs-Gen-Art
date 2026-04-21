// Static provider catalog. Universal (client + server safe).

import type { ProviderInfo } from "./types"

export const PROVIDER_IDS = {
  GEMINI: "gemini",
  VERTEX: "vertex",
  MOCK: "mock",
} as const

export type ProviderId = typeof PROVIDER_IDS[keyof typeof PROVIDER_IDS]

export const ALL_PROVIDERS: readonly ProviderInfo[] = [
  { id: PROVIDER_IDS.GEMINI, displayName: "Google Gemini" },
  { id: PROVIDER_IDS.VERTEX, displayName: "Google Vertex AI" },
  { id: PROVIDER_IDS.MOCK,   displayName: "Mock (tests only)" },
]
