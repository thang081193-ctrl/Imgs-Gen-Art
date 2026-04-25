// @vitest-environment jsdom
//
// S#38 — AppHeader smoke. Verifies the version-strip formatLastGen
// helper edge cases (pure function, no DOM). The mounted-render
// assertions for the header are covered by home-page.test.tsx
// since AppHeader is composed there.

import { describe, expect, it } from "vitest"
import { formatLastGen } from "@/client/components/AppHeader"

describe("formatLastGen", () => {
  const NOW = new Date("2026-04-25T12:00:00.000Z")

  it("returns em-dash for null / unparseable input", () => {
    expect(formatLastGen(null, NOW)).toBe("—")
    expect(formatLastGen("not-a-date", NOW)).toBe("—")
  })

  it("formats sub-minute deltas in seconds", () => {
    const iso = new Date(NOW.getTime() - 30_000).toISOString()
    expect(formatLastGen(iso, NOW)).toBe("30s ago")
  })

  it("formats sub-hour deltas in minutes", () => {
    const iso = new Date(NOW.getTime() - 5 * 60_000).toISOString()
    expect(formatLastGen(iso, NOW)).toBe("5m ago")
  })

  it("formats sub-day deltas in hours", () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString()
    expect(formatLastGen(iso, NOW)).toBe("3h ago")
  })

  it("formats multi-day deltas in days", () => {
    const iso = new Date(NOW.getTime() - 5 * 24 * 60 * 60_000).toISOString()
    expect(formatLastGen(iso, NOW)).toBe("5d ago")
  })

  it("returns 'just now' when the timestamp is in the future (clock skew)", () => {
    const iso = new Date(NOW.getTime() + 60_000).toISOString()
    expect(formatLastGen(iso, NOW)).toBe("just now")
  })
})
