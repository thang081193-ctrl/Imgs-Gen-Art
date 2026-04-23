// SDK-error → typed-error translation for the Gemini adapter.
// Split out of gemini.ts to keep the adapter under the 300 LOC cap + allow
// the mapping table to be unit-tested in isolation against hand-crafted
// shapes (no need to mock the real SDK classes).
//
// Upstream SDK wraps transport errors in `ApiError` (class) or plain objects
// with `status: number` + `message: string`. Status-code mapping mirrors
// google-cloud-platform conventions documented in the genai README.

import type { HealthStatus, HealthStatusCode } from "@/core/providers/types"
import { ProviderError, SafetyFilterError } from "@/core/shared/errors"

interface ErrorShape {
  message?: string
  status?: number | string
  code?: number | string
  name?: string
  error?: { code?: number; status?: string; message?: string }
}

function coerceStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined
  const e = err as ErrorShape
  if (typeof e.status === "number") return e.status
  if (typeof e.code === "number") return e.code
  if (typeof e.error?.code === "number") return e.error.code
  // Some SDK errors stash status inside message: "got status: 429"
  if (typeof e.message === "string") {
    const match = e.message.match(/\b(4\d\d|5\d\d)\b/)
    if (match) return Number.parseInt(match[1]!, 10)
  }
  return undefined
}

function coerceMessage(err: unknown): string {
  if (!err) return "Unknown Gemini SDK error"
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "Unknown Gemini SDK error")
  }
  return "Unknown Gemini SDK error"
}

// HTTP-status → HealthStatusCode. Covers the 5 canonical branches in the
// HealthStatus contract (§6.1). Anything we can't classify falls through to
// "down" with the raw SDK message — never "ok" by accident.
export function mapSdkErrorToHealthStatus(
  err: unknown,
  startedAtMs: number,
): HealthStatus {
  const status = coerceStatusCode(err)
  const message = coerceMessage(err)
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAtMs))
  const checkedAt = new Date().toISOString()

  let code: HealthStatusCode = "down"
  if (status === 401 || status === 403) code = "auth_error"
  else if (status === 429) code = "rate_limited"
  else if (status === 402) code = "quota_exceeded"
  else if (status !== undefined && status >= 500) code = "down"
  else if (/quota|rate/i.test(message) && /limit|exceed/i.test(message)) {
    code = "quota_exceeded"
  } else if (/unauthenticated|unauthorized|permission/i.test(message)) {
    code = "auth_error"
  }

  return { status: code, latencyMs, message, checkedAt }
}

// For the generate() path, translate SDK errors into AppError subtypes
// that the route layer maps to HTTP status. SafetyFilterError pre-thrown by
// gemini-extract.ts bubbles through unchanged; only SDK/transport errors
// flow through here.
export interface MapThrownContext {
  modelId: string
}

export function mapSdkErrorToThrown(err: unknown, context: MapThrownContext): never {
  // Preserve abort reason so callers distinguish cancel vs. real failure.
  if (err instanceof DOMException && err.name === "AbortError") {
    throw err
  }
  if (err instanceof Error && err.name === "AbortError") {
    throw err
  }
  // SafetyFilterError / ProviderError already typed — re-throw untouched.
  if (err instanceof SafetyFilterError || err instanceof ProviderError) {
    throw err
  }

  const status = coerceStatusCode(err)
  const message = coerceMessage(err)
  throw new ProviderError(`Gemini SDK error: ${message}`, {
    providerId: "gemini",
    modelId: context.modelId,
    ...(status !== undefined ? { sdkCode: String(status) } : {}),
  })
}
