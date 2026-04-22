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
const MOCK_DELAY_MS = 20

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
    await sleep(MOCK_DELAY_MS, params.abortSignal)
    const [r, g, b] = colorFromPrompt(params.prompt)
    const imageBytes = encodeSolidPng(MOCK_IMAGE_SIZE, MOCK_IMAGE_SIZE, r, g, b)
    const result: GenerateResult = {
      imageBytes,
      mimeType: "image/png",
      width: MOCK_IMAGE_SIZE,
      height: MOCK_IMAGE_SIZE,
      generationTimeMs: Date.now() - start,
    }
    if (params.seed !== undefined) result.seedUsed = params.seed
    return result
  },
}
