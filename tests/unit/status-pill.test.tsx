// @vitest-environment jsdom
//
// S#38 — StatusPill polling behavior. We inject a `fetchHealth` so the
// 30s real interval is irrelevant; vi.useFakeTimers + a custom 1s
// intervalMs make state transitions assertable in <50ms wall time.

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

import { StatusPill } from "@/client/components/StatusPill"
import type { HealthData } from "@/client/api/hooks"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function makeHealth(over: Partial<HealthData> = {}): HealthData {
  return {
    status: "ok",
    version: "0.0.0-test",
    uptimeMs: 1234,
    lastGenAt: null,
    ...over,
  }
}

describe("StatusPill", () => {
  it("renders loading state on first paint and flips to ready after the first tick", async () => {
    vi.useFakeTimers()
    const fetchHealth = vi.fn().mockResolvedValue(makeHealth())
    render(<StatusPill fetchHealth={fetchHealth} intervalMs={1000} />)

    // Initial state — synchronous mount.
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-state", "loading")

    // First tick fires synchronously inside the effect; flushing
    // microtasks lets the resolved promise settle.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-state", "ready")
    expect(fetchHealth).toHaveBeenCalledTimes(1)
  })

  it("flips to error when fetch rejects", async () => {
    const fetchHealth = vi.fn().mockRejectedValue(new Error("boom"))
    render(<StatusPill fetchHealth={fetchHealth} intervalMs={5_000} />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-state", "error")
  })

  it("re-polls on the configured cadence", async () => {
    vi.useFakeTimers()
    const fetchHealth = vi.fn().mockResolvedValue(makeHealth())
    render(<StatusPill fetchHealth={fetchHealth} intervalMs={1000} />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(fetchHealth).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(fetchHealth).toHaveBeenCalledTimes(3)
  })

  it("invokes onHealth with the resolved payload (success) and null (error)", async () => {
    const okHealth = makeHealth({ lastGenAt: "2026-04-25T10:00:00.000Z" })
    const fetchHealth = vi.fn().mockResolvedValueOnce(okHealth)
    const onHealth = vi.fn()
    render(<StatusPill fetchHealth={fetchHealth} intervalMs={5_000} onHealth={onHealth} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(onHealth).toHaveBeenLastCalledWith(okHealth)

    cleanup()

    const fetchHealthErr = vi.fn().mockRejectedValue(new Error("offline"))
    const onHealthErr = vi.fn()
    render(<StatusPill fetchHealth={fetchHealthErr} intervalMs={5_000} onHealth={onHealthErr} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onHealthErr).toHaveBeenLastCalledWith(null)
  })
})
