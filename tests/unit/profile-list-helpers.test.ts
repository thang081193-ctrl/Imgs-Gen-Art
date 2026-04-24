// Session #30 Step 4 — profile-list helper coverage. formatRelative +
// initialsFor + hueFor are pure and drive the logo-fallback + updated-
// column rendering in Profiles.tsx (which itself can't mount without jsdom
// — handoff carry-forward #5).

import { describe, expect, it } from "vitest"
import {
  formatRelative,
  hueFor,
  initialsFor,
} from "@/client/utils/profile-list"

describe("profile-list — initialsFor", () => {
  it("returns first letter of each of the first two words, uppercased", () => {
    expect(initialsFor("Chart Lens")).toBe("CL")
    expect(initialsFor("photo lab pro")).toBe("PL")
  })

  it("pads single-word names with '?' so the badge is always 2 chars", () => {
    expect(initialsFor("Lens")).toBe("L?")
  })

  it("handles empty or whitespace-only input with the sentinel '??'", () => {
    expect(initialsFor("")).toBe("??")
    expect(initialsFor("   ")).toBe("??")
  })

  it("trims surrounding whitespace before segmenting", () => {
    expect(initialsFor("  chart lens  ")).toBe("CL")
  })
})

describe("profile-list — hueFor", () => {
  it("returns the same hue for the same input (deterministic)", () => {
    expect(hueFor("ChartLens")).toBe(hueFor("ChartLens"))
  })

  it("returns a value in the [0, 360) hue range", () => {
    const samples = ["", "A", "abc", "photo lab pro", "Lens"]
    for (const s of samples) {
      const h = hueFor(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it("differs for meaningfully different inputs (weak spread check)", () => {
    const hues = new Set<number>()
    for (const s of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]) {
      hues.add(hueFor(s))
    }
    expect(hues.size).toBeGreaterThanOrEqual(4)
  })
})

describe("profile-list — formatRelative", () => {
  const NOW = new Date("2026-04-24T12:00:00.000Z")

  it("returns 'just now' within the first 45 seconds", () => {
    expect(formatRelative("2026-04-24T11:59:30.000Z", NOW)).toBe("just now")
  })

  it("returns minutes-ago under an hour", () => {
    expect(formatRelative("2026-04-24T11:55:00.000Z", NOW)).toBe("5m ago")
  })

  it("returns hours-ago under a day", () => {
    expect(formatRelative("2026-04-24T09:00:00.000Z", NOW)).toBe("3h ago")
  })

  it("returns days-ago under 30 days", () => {
    expect(formatRelative("2026-04-22T12:00:00.000Z", NOW)).toBe("2d ago")
  })

  it("returns absolute ISO date beyond 30 days", () => {
    expect(formatRelative("2026-03-01T12:00:00.000Z", NOW)).toBe("2026-03-01")
  })

  it("returns '—' for invalid date input", () => {
    expect(formatRelative("not-a-date", NOW)).toBe("—")
  })
})
