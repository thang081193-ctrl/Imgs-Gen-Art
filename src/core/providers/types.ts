// Universal provider contracts per PLAN §6.1.
// Placed in src/core (not src/server) so the reusable contract suite in ./contract.ts
// can reference these types without crossing the core→server boundary (ESLint Rule 4).
// Server provider impls re-export from src/server/providers/types.ts for ergonomic imports.
//
// Note on imageBytes: PLAN §6.1 types this as Node Buffer. We use Uint8Array here —
// Node's Buffer extends Uint8Array so server impls satisfy the type, and core stays
// free of Node runtime assumptions (universal principle).

import type { AspectRatio, LanguageCode, ModelInfo } from "../model-registry/types"

export interface ImageProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]

  health(modelId: string): Promise<HealthStatus>
  generate(params: GenerateParams): Promise<GenerateResult>
}

export interface GenerateParams {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  language?: LanguageCode
  seed?: number
  providerSpecificParams?: Record<string, unknown>
  timeoutMs?: number
  abortSignal?: AbortSignal
}

export interface GenerateResult {
  imageBytes: Uint8Array
  mimeType: "image/png" | "image/jpeg"
  width: number
  height: number
  seedUsed?: number
  generationTimeMs: number
  providerResponseMeta?: Record<string, unknown>
}

export type HealthStatusCode =
  | "ok"
  | "quota_exceeded"
  | "auth_error"
  | "rate_limited"
  | "down"

export interface HealthStatus {
  status: HealthStatusCode
  latencyMs?: number
  message?: string
  checkedAt: string  // ISO timestamp
}
