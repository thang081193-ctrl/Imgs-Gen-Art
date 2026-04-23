// Session #26 (Phase 5 Step 2) — taxonomy mapper + tooltip copy for the
// Replay UI. Pure functions, no DOM needed. Hook + component tests deferred
// until jsdom is set up (tracked in Session #26 carry-forward).

import { describe, expect, it } from "vitest"

import { ApiError } from "@/client/api/client"
import {
  classifyReplayError,
  notReplayableTooltip,
} from "@/client/lib/replay-errors"

describe("classifyReplayError", () => {
  it("maps NO_ACTIVE_KEY → auth (non-retryable)", () => {
    const err = new ApiError(401, {
      code: "NO_ACTIVE_KEY",
      message: "no active key",
    })
    const info = classifyReplayError(err)
    expect(info.category).toBe("auth")
    expect(info.retryable).toBe(false)
    expect(info.message).toMatch(/Settings/)
  })

  it("maps SAFETY_FILTER → safety (non-retryable)", () => {
    const err = new ApiError(422, {
      code: "SAFETY_FILTER",
      message: "blocked",
    })
    const info = classifyReplayError(err)
    expect(info.category).toBe("safety")
    expect(info.retryable).toBe(false)
  })

  it("maps PROVIDER_ERROR → provider_error (retryable)", () => {
    const err = new ApiError(502, {
      code: "PROVIDER_ERROR",
      message: "sdk error",
    })
    const info = classifyReplayError(err)
    expect(info.category).toBe("provider_error")
    expect(info.retryable).toBe(true)
  })

  it("maps PROVIDER_UNAVAILABLE → provider_error", () => {
    const err = new ApiError(410, {
      code: "PROVIDER_UNAVAILABLE",
      message: "dropped",
    })
    expect(classifyReplayError(err).category).toBe("provider_error")
  })

  it("falls through unknown ApiError codes to 'unknown'", () => {
    const err = new ApiError(500, {
      code: "MIGRATION_DRIFT",
      message: "drift detected",
    })
    const info = classifyReplayError(err)
    expect(info.category).toBe("unknown")
    expect(info.message).toBe("drift detected")
  })

  it("detects network failure from fetch TypeError", () => {
    const err = new TypeError("Failed to fetch")
    const info = classifyReplayError(err)
    expect(info.category).toBe("network")
    expect(info.retryable).toBe(true)
  })

  it("maps generic Error to 'unknown' with preserved message", () => {
    const info = classifyReplayError(new Error("something broke"))
    expect(info.category).toBe("unknown")
    expect(info.message).toBe("something broke")
  })

  it("handles non-Error throws without crashing", () => {
    const info = classifyReplayError("string error")
    expect(info.category).toBe("unknown")
  })
})

describe("notReplayableTooltip", () => {
  it("returns the watermark copy for watermark_applied", () => {
    expect(notReplayableTooltip("watermark_applied")).toMatch(/watermark/i)
  })

  it("returns the seed-missing copy for seed_missing", () => {
    expect(notReplayableTooltip("seed_missing")).toMatch(/seed not saved/i)
  })

  it("returns the provider copy for provider_no_seed_support", () => {
    expect(notReplayableTooltip("provider_no_seed_support")).toMatch(
      /deterministic seeds/i,
    )
  })
})
