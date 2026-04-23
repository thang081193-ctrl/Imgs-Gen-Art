// Session #26 (Phase 5 Step 2) — map errors + not-replayable reasons to the
// UI copy approved in bro's Q3/Q5 refinements.
//
// Error category taxonomy:
//   auth           → NoActiveKeyError (401 NO_ACTIVE_KEY)
//   safety         → SafetyFilterError (422 SAFETY_FILTER)
//   provider_error → ProviderError (502 PROVIDER_ERROR)
//   network        → fetch rejection / no HTTP response (client-only)
//   unknown        → catch-all
//
// Note: `rate_limit` is a reserved future category. The backend does not
// currently emit a RATE_LIMIT code — when provider adapters grow rate-limit
// detection (e.g. Vertex 429 with Retry-After), we add the code and extend
// this mapper. Until then, rate-limit errors fall into `provider_error`.

import type { NotReplayableReason } from "@/core/dto/asset-dto"

import { ApiError } from "@/client/api/client"

export type ReplayErrorCategory =
  | "auth"
  | "safety"
  | "provider_error"
  | "network"
  | "unknown"

export interface ReplayErrorInfo {
  category: ReplayErrorCategory
  message: string
  retryable: boolean
}

export function classifyReplayError(err: unknown): ReplayErrorInfo {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "NO_ACTIVE_KEY":
        return {
          category: "auth",
          message: "API key invalid or missing. Check Settings → Keys.",
          retryable: false,
        }
      case "SAFETY_FILTER":
        return {
          category: "safety",
          message: "Content blocked by the provider safety filter.",
          retryable: false,
        }
      case "PROVIDER_ERROR":
      case "PROVIDER_UNAVAILABLE":
        return {
          category: "provider_error",
          message: "Provider returned an error. Usually transient.",
          retryable: true,
        }
      default:
        return {
          category: "unknown",
          message: err.message || "Replay failed. Check console for details.",
          retryable: true,
        }
    }
  }
  if (err instanceof Error) {
    // Fetch rejection (DNS / offline / CORS) surfaces as TypeError without a
    // response. The SSE hook wraps this as `SSE HTTP 0` or raises the raw
    // error — string-match on common network failure shapes.
    const msg = err.message.toLowerCase()
    if (msg.includes("network") || msg.includes("failed to fetch")) {
      return {
        category: "network",
        message: "Connection failed. Check network and try again.",
        retryable: true,
      }
    }
    return {
      category: "unknown",
      message: err.message || "Replay failed.",
      retryable: true,
    }
  }
  return {
    category: "unknown",
    message: "Replay failed. Check console for details.",
    retryable: true,
  }
}

// Tooltip copy for the disabled Replay button in AssetDetailModal when
// /replay-class returned `not_replayable`. Q3 approved copy.
const REASON_COPY: Record<NotReplayableReason, string> = {
  watermark_applied:
    "Replay unavailable — watermark prevents byte-identical reproduction",
  seed_missing:
    "Replay unavailable — generation seed not saved for this asset",
  provider_no_seed_support:
    "Replay unavailable — provider does not support deterministic seeds",
}

export function notReplayableTooltip(reason: NotReplayableReason): string {
  return REASON_COPY[reason]
}
