// Session #39 Phase B1 — retry policy for Grok calls.
//
// HANDOFF §1 deliverable: 1-retry-on-429-or-5xx. Split out so the policy is
// adjustable (and unit-testable) independently of the fetch + parse logic.
// Timeout is NOT retried — burning a second 30s wait on a stuck server is
// worse than the fallback path.

import type { LLMChatRequest, LLMChatResponse } from "./types"
import { LLMTimeoutError, LLMUnavailableError } from "./errors"
import { callGrokOnce } from "./grok-fetch"
import type { GrokConfig } from "./grok-config"

export interface GrokAttemptResult {
  response: LLMChatResponse
  attempts: number
  retried: boolean
}

function isRetriable(err: unknown): boolean {
  if (!(err instanceof LLMUnavailableError)) return false
  if (err.reason !== "http-error") return false
  const status = err.httpStatus
  return status === 429 || (status !== undefined && status >= 500)
}

export async function callGrokWithRetry(
  config: GrokConfig,
  req: LLMChatRequest,
): Promise<GrokAttemptResult> {
  try {
    const { response } = await callGrokOnce(config, req)
    return { response, attempts: 1, retried: false }
  } catch (err) {
    if (err instanceof LLMTimeoutError) throw err
    if (!isRetriable(err)) throw err
    const { response } = await callGrokOnce(config, req)
    return { response, attempts: 2, retried: true }
  }
}
