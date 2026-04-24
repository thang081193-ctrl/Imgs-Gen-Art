// Session #35 F3 — Vertex 429 retry-with-backoff.
//
// Imagen 4 on Vertex enforces per-region per-minute quotas that a tight batch
// (S#34 dogfood: 4 concepts back-to-back) can burst through. Before F3 the
// adapter surfaced 429 as a ProviderError + the workflow runner marked that
// variant as failed — 1 bad minute could kill a 1/3 of a batch.
//
// Fix: wrap the `generateImages` call in an attempt loop that retries only on
// 429 / RESOURCE_EXHAUSTED. Exponential-ish backoff with a small jitter keeps
// parallel callers from re-synchronizing on the next minute boundary. All
// non-rate-limit errors short-circuit immediately — callers should not retry
// safety filters, auth errors, or malformed prompts.

import { createLogger } from "@/core/shared/logger"
import { coerceRpcStatus, coerceStatusCode } from "./vertex-errors"

const logger = createLogger()

// Backoff schedule for retries. Index = attempt number AFTER the first
// failure (0-indexed). Terminal giving up happens at RETRY_BACKOFF_MS.length
// retries exhausted.
const RETRY_BACKOFF_MS: readonly number[] = [2000, 5000, 10000]
const RETRY_JITTER_MS = 500

export function isRetryableRateLimit(err: unknown): boolean {
  return coerceStatusCode(err) === 429 || coerceRpcStatus(err) === "RESOURCE_EXHAUSTED"
}

export interface RetryOn429Options {
  abortSignal?: AbortSignal
  modelId: string
  backoff?: readonly number[]
  /** Inject for tests so backoff doesn't actually sleep. */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export async function retryOn429<T>(
  fn: () => Promise<T>,
  opts: RetryOn429Options,
): Promise<T> {
  const schedule = opts.backoff ?? RETRY_BACKOFF_MS
  const sleepFn = opts.sleepFn ?? defaultSleep
  const maxAttempts = schedule.length + 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isLast = attempt === maxAttempts - 1
      if (!isRetryableRateLimit(err) || isLast) throw err
      const base = schedule[attempt]!
      const jitter = Math.floor(Math.random() * RETRY_JITTER_MS)
      const delayMs = base + jitter
      logger.warn("Vertex 429 — retrying after backoff", {
        modelId: opts.modelId,
        attempt: attempt + 1,
        delayMs,
      })
      await sleepFn(delayMs, opts.abortSignal)
    }
  }
  // Unreachable — loop either returns or throws at isLast.
  throw new Error("retryOn429: exhausted loop without return (unreachable)")
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
