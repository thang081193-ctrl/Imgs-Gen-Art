// Mock ImageProvider. Deterministic 1024×1024 solid-color PNG from a SHA-256 prompt hash.
// Respects abortSignal (pre-aborted + mid-flight). Used by tests + dev/offline.
// Node crypto is fine here — server-only module.

import { createHash } from "node:crypto"
import { modelsByProvider } from "@/core/model-registry/models"
import { PROVIDER_IDS } from "@/core/model-registry/providers"
import type {
  GenerateParams,
  GenerateResult,
  HealthCheckContext,
  HealthStatus,
  ImageProvider,
} from "@/core/providers/types"
import { encodeSolidPng } from "./mock-png-encoder"

const MOCK_IMAGE_SIZE = 1024

// Session #17 Q1 — env-configurable so manual browser cancel-tests can
// slow Mock down. Default 0 (integration tests finish instantly); set
// MOCK_DELAY_MS=1500 in .env.local to simulate real provider latency.
// Read per-call so tests can toggle between cases in the same process.
// Invalid/negative values clamp to 0.
function resolveMockDelayMs(): number {
  const raw = process.env["MOCK_DELAY_MS"]
  if (raw === undefined) return 0
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function colorFromPrompt(prompt: string): [number, number, number] {
  const hash = createHash("sha256").update(prompt, "utf8").digest()
  return [hash[0]!, hash[1]!, hash[2]!]
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error("aborted"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export const mockProvider: ImageProvider = {
  id: PROVIDER_IDS.MOCK,
  displayName: "Mock",
  supportedModels: modelsByProvider(PROVIDER_IDS.MOCK),

  async health(
    _modelId: string,
    _context?: HealthCheckContext,
  ): Promise<HealthStatus> {
    return {
      status: "ok",
      latencyMs: 1,
      checkedAt: new Date().toISOString(),
      message: "Mock provider — always healthy",
    }
  },

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now()
    await sleep(resolveMockDelayMs(), params.abortSignal)
    const [r, g, b] = colorFromPrompt(params.prompt)
    const imageBytes = encodeSolidPng(MOCK_IMAGE_SIZE, MOCK_IMAGE_SIZE, r, g, b)
    const result: GenerateResult = {
      imageBytes,
      mimeType: "image/png",
      width: MOCK_IMAGE_SIZE,
      height: MOCK_IMAGE_SIZE,
      generationTimeMs: Date.now() - start,
      costUsd: 0, // Mock is always free.
    }
    if (params.seed !== undefined) result.seedUsed = params.seed
    return result
  },
}
