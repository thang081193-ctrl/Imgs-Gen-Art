// Gemini adapter — Nano Banana Pro + Nano Banana 2 (Phase 4 Step 1, Session #18).
// Single adapter, two models: the call site differs only in `modelId`. Shared:
// auth (via slot-manager), client-per-key cache, error-map, image extract,
// AbortSignal pass-through, safety-filter typed error.
//
// Rule 4: this is the ONLY legal site for `@google/genai` imports. ESLint
// enforces via per-folder no-restricted-imports; do not re-export the SDK
// class from anywhere in this module.

// Type-only import keeps TSC happy without triggering module resolution at
// load time. The @google/genai 1.5.0 entrypoint unconditionally imports
// `@modelcontextprotocol/sdk/types.js` (an optional peer dep we intentionally
// don't install). Evaluating the module at app start would ENOENT on boot for
// every test / route — even those that don't touch Gemini. Lazy dynamic
// import below isolates the cost to the first Gemini call AND keeps vi.mock
// hijacking intact (vitest intercepts dynamic imports too).
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
import { decrypt } from "@/server/keys/crypto"
import { loadStoredKeys } from "@/server/keys/store"
import { extractImageFromResponse } from "./gemini-extract"
import { mapSdkErrorToHealthStatus, mapSdkErrorToThrown } from "./gemini-errors"

const GEMINI_MODEL_IDS: readonly string[] = [
  MODEL_IDS.GEMINI_NB_PRO,
  MODEL_IDS.GEMINI_NB_2,
]

// Phase 4 Step 5 — per-model USD cost. Source: PLAN §3 Providers table.
// Gemini has no resolution tier (4K default), so a flat model-keyed table
// is correct. Kept adapter-local (not in ModelInfo) so future tier-splits
// can land without ModelInfo shape churn.
const GEMINI_COST: Readonly<Record<string, number>> = {
  [MODEL_IDS.GEMINI_NB_PRO]: 0.134,
  [MODEL_IDS.GEMINI_NB_2]:   0.067,
}

// Q2 (Session #18) — boot-time observability log. Once per module load; the
// LOG_LEVEL=warn env gates it out of test output. If bro rotates SDK or
// re-verifies capability provenance, bump SDK_VERSION + VERIFIED_AT here and
// the capability-provenance.test.ts assertion picks up the latter.
const SDK_VERSION = "1.5.0"
const VERIFIED_AT = "2026-04-20"

const logger = createLogger()

let adapterInitLogged = false
function logAdapterInit(): void {
  if (adapterInitLogged) return
  adapterInitLogged = true
  logger.info("Gemini adapter initialized", {
    models: GEMINI_MODEL_IDS,
    sdkVersion: SDK_VERSION,
    verifiedAt: VERIFIED_AT,
  })
}

// Per-apiKey client cache. Constructing GoogleGenAI is not free (TLS pool,
// auth header setup), so reuse across calls. Keyed by plaintext apiKey so
// rotation (new slot activated, new plaintext) lazily produces a new client
// on first call; stale clients eventually GC when no caller holds the key.
// Exported _resetClientCacheForTests so mocked-SDK tests can reset between
// cases — same pattern as Phase 1's other test affordances.
const clientCache = new Map<string, GoogleGenAIClass>()

// Memoized dynamic import. The first call (health or generate) eagerly loads
// the SDK module; subsequent calls reuse the cached module namespace.
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

async function getClient(apiKey: string): Promise<GoogleGenAIClass> {
  const cached = clientCache.get(apiKey)
  if (cached) return cached
  const { GoogleGenAI } = await loadSdk()
  const client = new GoogleGenAI({ apiKey })
  clientCache.set(apiKey, client)
  return client
}

// Resolve the API key to use for this call. Priority:
//   1. context.apiKey (key-slot test path bypasses active-slot).
//   2. Active Gemini slot from encrypted store (decrypted here — never leaves
//      the server; redactor catches any accidental log leakage).
// Returns null on any failure — caller decides whether to throw or degrade.
function resolveApiKey(context?: HealthCheckContext): string | null {
  if (context?.apiKey) return context.apiKey
  try {
    const store = loadStoredKeys()
    const activeId = store.gemini.activeSlotId
    if (!activeId) return null
    const slot = store.gemini.slots.find((s) => s.id === activeId)
    if (!slot) return null
    return decrypt(slot.keyEncrypted)
  } catch {
    return null
  }
}

// Strip the "models/" resource-name prefix the Gemini API returns so the
// comparison with our short IDs (e.g. "gemini-3.1-flash-image-preview") works.
// Guards against future SDK changes that return either form.
function normalizeModelName(name: string | undefined): string {
  if (!name) return ""
  return name.startsWith("models/") ? name.slice("models/".length) : name
}

// Cap on pages walked in health(). For a 2-model assertion against the ~30
// models Gemini exposes, one page is plenty. Hard-cap prevents a runaway
// iterator from hanging the health probe.
const HEALTH_PAGE_SCAN_CAP = 5

async function healthCheckModelAvailability(
  client: GoogleGenAIClass,
  modelId: string,
  abortSignal: AbortSignal | undefined,
): Promise<{ found: boolean; scanned: number }> {
  const config = abortSignal ? { abortSignal } : undefined
  const pager = await client.models.list(config ? { config } : undefined)
  let scanned = 0
  for await (const model of pager) {
    scanned++
    if (normalizeModelName(model.name) === modelId) {
      return { found: true, scanned }
    }
    if (scanned >= HEALTH_PAGE_SCAN_CAP * 50) break
  }
  return { found: false, scanned }
}

async function health(
  modelId: string,
  context?: HealthCheckContext,
): Promise<HealthStatus> {
  const start = performance.now()
  const checkedAt = () => new Date().toISOString()
  const apiKey = resolveApiKey(context)
  if (!apiKey) {
    return {
      status: "auth_error",
      latencyMs: 0,
      message: "No active Gemini key slot configured",
      checkedAt: checkedAt(),
    }
  }
  try {
    const client = await getClient(apiKey)
    const { found } = await healthCheckModelAvailability(
      client,
      modelId,
      context?.abortSignal,
    )
    const latencyMs = Math.max(0, Math.round(performance.now() - start))
    if (!found) {
      return {
        status: "down",
        latencyMs,
        message: `Model ${modelId} not in account's available model list`,
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
  const apiKey = resolveApiKey()
  if (!apiKey) {
    throw new NoActiveKeyError(
      "No active Gemini key slot configured — add a key via Settings.",
      { providerId: PROVIDER_IDS.GEMINI },
    )
  }
  const client = await getClient(apiKey)
  const config: Record<string, unknown> = {
    responseModalities: ["image"],
  }
  if (params.abortSignal) config["abortSignal"] = params.abortSignal
  if (params.seed !== undefined) config["seed"] = params.seed

  let response
  try {
    response = await client.models.generateContent({
      model: params.modelId,
      contents: params.prompt,
      config,
    })
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
    costUsd: GEMINI_COST[params.modelId] ?? 0,
  }
  if (params.seed !== undefined) result.seedUsed = params.seed
  return result
}

logAdapterInit()

export const geminiProvider: ImageProvider = {
  id: PROVIDER_IDS.GEMINI,
  displayName: "Google Gemini",
  supportedModels: modelsByProvider(PROVIDER_IDS.GEMINI),
  health,
  generate,
}
