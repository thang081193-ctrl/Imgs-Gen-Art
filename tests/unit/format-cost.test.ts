// Phase 4 Step 5 (Session #21) — formatCost util.
//
// 3-decimal asset-level (distinguishes $0.134 NB Pro vs $0.067 NB 2 at a
// glance) + 2-decimal aggregate + $0.00 short-circuit + null/undefined
// fallback. Negative clamps to 0 defensively.

import { describe, expect, it } from "vitest"
import { formatCost } from "@/client/utils/format"

describe("formatCost", () => {
  it("asset precision (default) = 3 decimals", () => {
    expect(formatCost(0.134)).toBe("$0.134")
    expect(formatCost(0.067)).toBe("$0.067")
    expect(formatCost(0.04)).toBe("$0.040")
  })

  it("aggregate precision = 2 decimals", () => {
    expect(formatCost(1.25, "aggregate")).toBe("$1.25")
    expect(formatCost(0.134, "aggregate")).toBe("$0.13")
  })

  it("zero short-circuits to $0.00 regardless of precision", () => {
    expect(formatCost(0)).toBe("$0.00")
    expect(formatCost(0, "aggregate")).toBe("$0.00")
  })

  it("null / undefined → em-dash fallback", () => {
    expect(formatCost(null)).toBe("—")
    expect(formatCost(undefined)).toBe("—")
  })

  it("negative clamps to zero", () => {
    expect(formatCost(-0.5)).toBe("$0.00")
  })

  it("handles large numbers without scientific notation", () => {
    expect(formatCost(123.456, "aggregate")).toBe("$123.46")
    expect(formatCost(1234.5, "aggregate")).toBe("$1234.50")
  })
})
