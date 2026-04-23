// SDK-error → typed-error translation for the Vertex Imagen adapter.
// Shape-compatible with gemini-errors.ts but branded providerId="vertex" and
// with two extra branches for SA-specific failures:
//   1. ServiceAccountFileMissingError — thrown by resolveServiceAccount BEFORE
//      any SDK call. Bubbles through both map functions untouched.
//   2. GCP permission-denied / quota messages that differ in shape from
//      Gemini's (Vertex returns google.rpc.Status with code-as-string).
//
// Split from vertex-imagen.ts to keep adapter under the 300 LOC cap + enable
// isolated unit-testing of the mapping table against hand-crafted shapes.

import type { HealthStatus, HealthStatusCode } from "@/core/providers/types"
import {
  ProviderError,
  SafetyFilterError,
  ServiceAccountFileMissingError,
} from "@/core/shared/errors"

interface ErrorShape {
  message?: string
  status?: number | string
  code?: number | string
  name?: string
  // google-auth-library / Vertex-style nested error: `{error: {code, status, message}}`
  error?: { code?: number | string; status?: string; message?: string }
}

function coerceStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined
  const e = err as ErrorShape
  if (typeof e.status === "number") return e.status
  if (typeof e.code === "number") return e.code
  if (typeof e.error?.code === "number") return e.error.code
  // google.rpc.Status serializes code as string constant ("UNAUTHENTICATED",
  // "PERMISSION_DENIED", etc.); look at e.error.status for that form.
  if (typeof e.message === "string") {
    const match = e.message.match(/\b(4\d\d|5\d\d)\b/)
    if (match) return Number.parseInt(match[1]!, 10)
  }
  return undefined
}

function coerceRpcStatus(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined
  const e = err as ErrorShape
  if (typeof e.error?.status === "string") return e.error.status
  if (typeof e.status === "string") return e.status
  return undefined
}

function coerceMessage(err: unknown): string {
  if (!err) return "Unknown Vertex SDK error"
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "Unknown Vertex SDK error")
  }
  return "Unknown Vertex SDK error"
}

// HTTP-status / google.rpc.Status → HealthStatusCode. Mirrors gemini-errors
// but with two extra keywords ("permission_denied", "unauthenticated") that
// the Vertex API uses in lieu of numeric 401/403.
export function mapSdkErrorToHealthStatus(
  err: unknown,
  startedAtMs: number,
): HealthStatus {
  const status = coerceStatusCode(err)
  const rpcStatus = coerceRpcStatus(err)
  const message = coerceMessage(err)
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAtMs))
  const checkedAt = new Date().toISOString()

  // SA-file-missing short-circuit — surface as auth_error, don't hide behind
  // the generic "down" bucket.
  if (err instanceof ServiceAccountFileMissingError) {
    return {
      status: "auth_error",
      latencyMs,
      message: err.message,
      checkedAt,
    }
  }

  let code: HealthStatusCode = "down"
  if (status === 401 || status === 403) code = "auth_error"
  else if (status === 429) code = "rate_limited"
  else if (status === 402) code = "quota_exceeded"
  else if (status !== undefined && status >= 500) code = "down"
  else if (rpcStatus === "UNAUTHENTICATED" || rpcStatus === "PERMISSION_DENIED") {
    code = "auth_error"
  } else if (rpcStatus === "RESOURCE_EXHAUSTED") {
    code = "quota_exceeded"
  } else if (/quota|rate/i.test(message) && /limit|exceed/i.test(message)) {
    code = "quota_exceeded"
  } else if (/unauthenticated|unauthorized|permission/i.test(message)) {
    code = "auth_error"
  }

  return { status: code, latencyMs, message, checkedAt }
}

export interface MapThrownContext {
  modelId: string
}

export function mapSdkErrorToThrown(err: unknown, context: MapThrownContext): never {
  if (err instanceof DOMException && err.name === "AbortError") {
    throw err
  }
  if (err instanceof Error && err.name === "AbortError") {
    throw err
  }
  // Typed errors pre-thrown by extract / resolveServiceAccount — bubble.
  if (
    err instanceof SafetyFilterError ||
    err instanceof ProviderError ||
    err instanceof ServiceAccountFileMissingError
  ) {
    throw err
  }

  const status = coerceStatusCode(err)
  const rpcStatus = coerceRpcStatus(err)
  const message = coerceMessage(err)
  const sdkCode =
    status !== undefined
      ? String(status)
      : rpcStatus !== undefined
        ? rpcStatus
        : undefined
  throw new ProviderError(`Vertex SDK error: ${message}`, {
    providerId: "vertex",
    modelId: context.modelId,
    ...(sdkCode !== undefined ? { sdkCode } : {}),
  })
}
