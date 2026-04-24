// Session #35 F3 — retryOn429 covers the Vertex quota-burst case.
// Uses an injected sleepFn so tests don't block on real backoff.

import { describe, expect, it, vi } from "vitest"
import {
  isRetryableRateLimit,
  retryOn429,
} from "@/server/providers/vertex-retry"

function err429(): { status: number; message: string } {
  return { status: 429, message: "Too Many Requests" }
}
function errRpcResourceExhausted(): { error: { status: string; message: string } } {
  return { error: { status: "RESOURCE_EXHAUSTED", message: "quota exceeded" } }
}
function err500(): { status: number; message: string } {
  return { status: 500, message: "Internal" }
}

describe("isRetryableRateLimit", () => {
  it("matches HTTP 429", () => {
    expect(isRetryableRateLimit(err429())).toBe(true)
  })

  it("matches google.rpc RESOURCE_EXHAUSTED", () => {
    expect(isRetryableRateLimit(errRpcResourceExhausted())).toBe(true)
  })

  it("rejects non-rate-limit errors", () => {
    expect(isRetryableRateLimit(err500())).toBe(false)
    expect(isRetryableRateLimit(new Error("boom"))).toBe(false)
    expect(isRetryableRateLimit(null)).toBe(false)
  })
})

describe("retryOn429", () => {
  it("returns immediately when fn succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    const result = await retryOn429(fn, { modelId: "imagen-4", sleepFn })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleepFn).not.toHaveBeenCalled()
  })

  it("retries on 429 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err429())
      .mockResolvedValueOnce("ok")
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    const result = await retryOn429(fn, {
      modelId: "imagen-4",
      sleepFn,
      backoff: [10, 20, 30],
    })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledTimes(1)
  })

  it("exhausts retries and re-throws last 429", async () => {
    const fn = vi.fn().mockRejectedValue(err429())
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(
      retryOn429(fn, { modelId: "imagen-4", sleepFn, backoff: [1, 1, 1] }),
    ).rejects.toMatchObject({ status: 429 })
    // backoff.length + 1 attempts total (3 retries + 1 initial)
    expect(fn).toHaveBeenCalledTimes(4)
    expect(sleepFn).toHaveBeenCalledTimes(3)
  })

  it("does NOT retry non-429 errors — throws immediately", async () => {
    const fn = vi.fn().mockRejectedValue(err500())
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    await expect(
      retryOn429(fn, { modelId: "imagen-4", sleepFn }),
    ).rejects.toMatchObject({ status: 500 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleepFn).not.toHaveBeenCalled()
  })

  it("respects the injected backoff schedule (each attempt uses the right delay)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err429())
      .mockRejectedValueOnce(err429())
      .mockResolvedValueOnce("ok")
    const sleepFn = vi.fn().mockResolvedValue(undefined)
    await retryOn429(fn, {
      modelId: "imagen-4",
      sleepFn,
      backoff: [100, 200, 400],
    })
    expect(sleepFn).toHaveBeenCalledTimes(2)
    const firstDelay = (sleepFn.mock.calls[0] as [number, AbortSignal?])[0]
    const secondDelay = (sleepFn.mock.calls[1] as [number, AbortSignal?])[0]
    // Base delay + up to 500ms jitter; assert base is respected without
    // pinning to the exact random value.
    expect(firstDelay).toBeGreaterThanOrEqual(100)
    expect(firstDelay).toBeLessThan(100 + 500)
    expect(secondDelay).toBeGreaterThanOrEqual(200)
    expect(secondDelay).toBeLessThan(200 + 500)
  })
})
