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

  /**
   * Check provider health for a specific model.
   *
   * Optional `context` enables end-to-end key verification via
   * `POST /api/keys/:id/test` — caller passes decrypted credentials so the
   * probe targets the slot-under-test instead of the provider's default
   * (active-slot) credentials. When omitted, providers use whatever active
   * credentials they were constructed with (ambient `GET /providers/health`).
   *
   * Phase 3 (Mock) ignores `context` and always returns "ok". Phase 4
   * providers use `apiKey` (Gemini) / `serviceAccount` (Vertex) to
   * authenticate without touching the active-slot registry.
   */
  health(modelId: string, context?: HealthCheckContext): Promise<HealthStatus>
  generate(params: GenerateParams): Promise<GenerateResult>
}

/**
 * Parsed GCP service-account JSON for Vertex auth. Core fields are typed;
 * extras (token_uri, cert URLs, etc.) round-trip via the index signature
 * so provider impls don't lose anything when the upstream shape extends.
 */
export interface VertexServiceAccount {
  type: string
  project_id: string
  client_email: string
  private_key: string
  [key: string]: unknown
}

export interface HealthCheckContext {
  /** Plaintext Gemini API key — test a specific slot without activating it. */
  apiKey?: string
  /** Parsed Vertex service-account JSON. */
  serviceAccount?: VertexServiceAccount
  /** Bypass any provider-internal health-result cache (Phase 4+). */
  skipCache?: boolean
  /** Cancel the probe (e.g. client disconnect on POST /keys/:id/test). */
  abortSignal?: AbortSignal
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
  /**
   * Actual USD cost for this generation. Adapter-reported so future
   * resolution-tiered pricing (e.g. Imagen 1K vs 2K) lands here without
   * leaking into ModelInfo. Mock returns 0. Defaults to ModelInfo's
   * `costPerImageUsd` when adapter has no per-call variance.
   */
  costUsd: number
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
