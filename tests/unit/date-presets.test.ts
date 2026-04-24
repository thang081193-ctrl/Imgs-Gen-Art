// Phase 5 Step 3b (Session #29) — unit tests for the client date-preset
// deriver. Mirrors the server's `datePresetBoundary` semantics; cross-checks
// one case against the server impl to catch accidental drift early.

import { describe, expect, it } from "vitest"

import { datePresetBoundary } from "@/server/asset-store/asset-list-query"

import { datePresetToRange } from "@/client/utils/date-presets"

// Fixed reference: Fri 2026-04-24T15:30:00 local — "today" midnight is
// 2026-04-24T00:00 local. We assert via Date math instead of a hard-coded ISO
// so the test stays TZ-agnostic across CI runners.
const FIXED_NOW = new Date(2026, 3, 24, 15, 30, 0) // month is 0-indexed

describe("datePresetToRange — all", () => {
  it("returns null (no restriction)", () => {
    expect(datePresetToRange("all", FIXED_NOW)).toBeNull()
  })
})

describe("datePresetToRange — today", () => {
  it("returns local midnight of the reference day", () => {
    const range = datePresetToRange("today", FIXED_NOW)
    const expected = new Date(2026, 3, 24, 0, 0, 0).toISOString()
    expect(range).toEqual({ after: expected })
  })

  it("still returns local midnight when invoked at 23:59", () => {
    const lateNight = new Date(2026, 3, 24, 23, 59, 59)
    const range = datePresetToRange("today", lateNight)
    const expected = new Date(2026, 3, 24, 0, 0, 0).toISOString()
    expect(range).toEqual({ after: expected })
  })
})

describe("datePresetToRange — rolling windows", () => {
  it("7d returns now − 7 days", () => {
    const range = datePresetToRange("7d", FIXED_NOW)
    const expected = new Date(FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(range).toEqual({ after: expected })
  })

  it("30d returns now − 30 days", () => {
    const range = datePresetToRange("30d", FIXED_NOW)
    const expected = new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    expect(range).toEqual({ after: expected })
  })
})

describe("datePresetToRange — uses current time by default", () => {
  it("returns a boundary within a few seconds of now for 7d", () => {
    const before = Date.now()
    const range = datePresetToRange("7d")
    const after = Date.now()
    expect(range).not.toBeNull()
    const boundaryMs = new Date(range!.after).getTime()
    const expectedLow = before - 7 * 24 * 60 * 60 * 1000
    const expectedHigh = after - 7 * 24 * 60 * 60 * 1000
    expect(boundaryMs).toBeGreaterThanOrEqual(expectedLow)
    expect(boundaryMs).toBeLessThanOrEqual(expectedHigh)
  })
})

// Parity guard — if the server boundary semantics ever change, this test fails
// and forces an intentional update on both sides.
describe("datePresetToRange — parity with server datePresetBoundary", () => {
  it("produces the same ISO as the server for each non-null preset", () => {
    const nowIso = FIXED_NOW.toISOString()
    for (const preset of ["today", "7d", "30d"] as const) {
      const clientRange = datePresetToRange(preset, FIXED_NOW)
      const serverBoundary = datePresetBoundary(preset, nowIso)
      expect(clientRange?.after).toBe(serverBoundary)
    }
  })
})
