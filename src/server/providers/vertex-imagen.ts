// Vertex Imagen adapter — Imagen 4 via @google/genai 1.5.0 in Vertex mode
// (Phase 4 Step 2, Session #19).
//
// SDK choice rationale (pivot from BOOTSTRAP-PHASE4.md draft):
//   @google-cloud/vertexai@1.10.0 is for Gemini-on-Vertex only; no Imagen
//   generation surface exists there. @google/genai 1.5.0 supports BOTH the
//   Gemini Developer API (apiKey flow, used by gemini.ts) and Vertex
//   (service-account flow, used here) via the `vertexai: true` option plus
//   `project` + `location` + `googleAuthOptions.credentials`. Same SDK means
//   same lazy-import workaround (MCP peer dep), same error-shape baseline,
//   one version to pin.
//
// Session #14 HealthCheckContext extension is honored: `context.serviceAccount`
// bypasses active-slot lookup for the `POST /keys/:id/test` path. SA resolution
// logic lives in vertex-auth.ts (Q1 helper, isolated for unit testing).

// Rule 4: this module + gemini.ts are the ONLY legal sites for `@google/genai`
// imports. ESLint enforces via per-folder no-restricted-imports.
import type { GoogleGenAI as GoogleGenAIClass } from "@google/genai"
import { MODEL_IDS, modelsByProvider } from "@/core/model-registry/models"
import { PROVIDER_IDS } from "@/core/model-registry/providers"
import type {
  GenerateParams,
  GenerateResult,
  HealthCheckContext,
  HealthStatus,
  ImageProvider,
} from "@/core/providers/types"
import { NoActiveKeyError } from "@/core/shared/errors"
import { createLogger } from "@/core/shared/logger"
import {
  resolveServiceAccount,
  type ResolvedServiceAccount,
} from "./vertex-auth"
import {
  mapSdkErrorToHealthStatus,
  mapSdkErrorToThrown,
} from "./vertex-errors"
import { extractImageFromResponse } from "./vertex-extract"
import { retryOn429 } from "./vertex-retry"

const VERTEX_MODEL_IDS: readonly string[] = [MODEL_IDS.IMAGEN_4]

// Phase 4 Step 5 — Imagen 4 pricing. PLAN §3 lists $0.04 flat (2K default).
// Resolution-tier split (1K=$0.02) deferred — not wired through aspect ratio yet.
const VERTEX_COST: Readonly<Record<string, number>> = {
  [MODEL_IDS.IMAGEN_4]: 0.04,
}

const SDK_VERSION = "1.5.0"
const VERIFIED_AT = "2026-04-23"

const logger = createLogger()

let adapterInitLogged = false
function logAdapterInit(): void {
  if (adapterInitLogged) return
  adapterInitLogged = true
  logger.info("Vertex Imagen adapter initialized", {
    models: VERTEX_MODEL_IDS,
    sdkVersion: SDK_VERSION,
    verifiedAt: VERIFIED_AT,
    sdkMode: "vertexai",
  })
}

// Cache key = fingerprint of the auth context so slot rotation + SA swaps
// produce fresh clients without leaking credentials between isolated calls.
// email alone is NOT enough (same SA, different project allowed); location
// is part of the key since @google/genai bakes it into the client at
// construction time.
function fingerprintKey(resolved: ResolvedServiceAccount): string {
  const email = String(resolved.credentials["client_email"] ?? "")
  return `${resolved.projectId}|${resolved.location}|${email}`
}
const clientCache = new Map<string, GoogleGenAIClass>()

let sdkModulePromise: Promise<typeof import("@google/genai")> | null = null
function loadSdk(): Promise<typeof import("@google/genai")> {
  if (!sdkModulePromise) sdkModulePromise = import("@google/genai")
  return sdkModulePromise
}

export function _resetClientCacheForTests(): void {
  clientCache.clear()
  sdkModulePromise = null
  adapterInitLogged = false
}

async function getClient(resolved: ResolvedServiceAccount): Promise<GoogleGenAIClass> {
  const cacheKey = fingerprintKey(resolved)
  const cached = clientCache.get(cacheKey)
  if (cached) return cached
  const { GoogleGenAI } = await loadSdk()
  const client = new GoogleGenAI({
    vertexai: true,
    project: resolved.projectId,
    location: resolved.location,
    googleAuthOptions: {
      credentials: resolved.credentials as unknown as Record<string, string>,
    },
  })
  clientCache.set(cacheKey, client)
  return client
}

// health() strategy: call `models.list()` as an auth probe. In Vertex mode
// this lists tuned models in the target project — permissions + project
// access surface as 401/403/404 at this call. The specific Imagen model is
// a publisher model (`publishers/google/models/imagen-4.0-generate-001`),
// NOT listed by `models.list()`, so we don't require presence — the fact
// that the list call itself succeeds is the auth signal. If bro later wants
// a stricter probe we can upgrade to a 1-image generate with numberOfImages=1
// at $0.04 per call, but that's too expensive for the default health poll.
const HEALTH_PAGE_SCAN_CAP = 5

async function healthProbe(
  client: GoogleGenAIClass,
  abortSignal: AbortSignal | undefined,
): Promise<void> {
  const config = abortSignal ? { abortSignal } : undefined
  const pager = await client.models.list(config ? { config } : undefined)
  let scanned = 0
  for await (const model of pager) {
    void model
    scanned++
    if (scanned >= HEALTH_PAGE_SCAN_CAP * 50) break
  }
}

async function health(
  modelId: string,
  context?: HealthCheckContext,
): Promise<HealthStatus> {
  const start = performance.now()
  const checkedAt = () => new Date().toISOString()
  let resolved: ResolvedServiceAccount
  try {
    resolved = resolveServiceAccount(context)
  } catch (err) {
    if (err instanceof NoActiveKeyError) {
      return {
        status: "auth_error",
        latencyMs: 0,
        message: err.message,
        checkedAt: checkedAt(),
      }
    }
    return mapSdkErrorToHealthStatus(err, start)
  }
  try {
    const client = await getClient(resolved)
    await healthProbe(client, context?.abortSignal)
    const latencyMs = Math.max(0, Math.round(performance.now() - start))
    if (!VERTEX_MODEL_IDS.includes(modelId)) {
      return {
        status: "down",
        latencyMs,
        message: `Model ${modelId} not recognized by Vertex adapter`,
        checkedAt: checkedAt(),
      }
    }
    return { status: "ok", latencyMs, checkedAt: checkedAt() }
  } catch (err) {
    return mapSdkErrorToHealthStatus(err, start)
  }
}

async function generate(params: GenerateParams): Promise<GenerateResult> {
  const start = Date.now()
  const resolved = resolveServiceAccount()
  const client = await getClient(resolved)

  // Q3 (Session #19) — pass-through language. Record<string, unknown> avoids
  // the SDK's narrow `ImagePromptLanguage` enum (5 values) rejecting langs
  // the model-registry declares as supported (11 values). Runtime: Vertex
  // accepts the full ISO-639 set the registry lists; precondition-check
  // already filters out-of-registry langs upstream.
  const addWatermark =
    (params.providerSpecificParams?.["addWatermark"] as boolean | undefined) ?? true
  const config: Record<string, unknown> = {
    numberOfImages: 1,
    aspectRatio: params.aspectRatio,
    addWatermark,
  }
  if (params.abortSignal) config["abortSignal"] = params.abortSignal
  if (params.seed !== undefined) config["seed"] = params.seed
  if (params.language) config["language"] = params.language

  // Session #35 F3 — retry-on-429 wraps the SDK call so Imagen's per-region
  // per-minute burst limit doesn't drop variants mid-batch. Non-429 errors
  // throw on the first attempt.
  let response
  try {
    response = await retryOn429(
      () =>
        client.models.generateImages({
          model: params.modelId,
          prompt: params.prompt,
          config: config as never,
        }),
      {
        modelId: params.modelId,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      },
    )
  } catch (err) {
    mapSdkErrorToThrown(err, { modelId: params.modelId })
  }

  const { bytes, mimeType, width, height } = extractImageFromResponse(response!, {
    modelId: params.modelId,
    promptHint: params.prompt.slice(0, 120),
  })

  const result: GenerateResult = {
    imageBytes: bytes,
    mimeType,
    width,
    height,
    generationTimeMs: Date.now() - start,
    costUsd: VERTEX_COST[params.modelId] ?? 0,
  }
  if (params.seed !== undefined) result.seedUsed = params.seed
  return result
}

logAdapterInit()

export const vertexImagenProvider: ImageProvider = {
  id: PROVIDER_IDS.VERTEX,
  displayName: "Google Vertex AI",
  supportedModels: modelsByProvider(PROVIDER_IDS.VERTEX),
  health,
  generate,
}
