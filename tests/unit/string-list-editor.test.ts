// Session #30 Step 4 (Q-30.G) — StringListEditor pure-helper coverage.
// Mount tests deferred until jsdom lands (handoff carry-forward #5). These
// exercise the reducer-shaped helpers that encapsulate all behavior props:
// normalize, maxItems, maxItemLength, allowDuplicates, delimiter.

import { describe, expect, it } from "vitest"
import {
  normalizeItem,
  shouldCommitOnKey,
  tryAddItem,
} from "@/client/components/profile-editor/StringListEditor"

describe("StringListEditor — normalizeItem", () => {
  it("mode 'trim' trims and collapses internal whitespace", () => {
    expect(normalizeItem("  hello   world  ", "trim")).toBe("hello world")
  })

  it("mode 'trimLowercase' trims, collapses, and lowercases", () => {
    expect(normalizeItem("  Hello   WORLD  ", "trimLowercase")).toBe("hello world")
  })

  it("mode 'none' preserves literal input including whitespace and case", () => {
    expect(normalizeItem("  Keep   Me  ", "none")).toBe("  Keep   Me  ")
  })

  it("rejects whitespace-only input as null across all modes", () => {
    expect(normalizeItem("   ", "trim")).toBeNull()
    expect(normalizeItem("   ", "trimLowercase")).toBeNull()
    expect(normalizeItem("   ", "none")).toBeNull()
  })

  it("defaults to 'trim' when mode omitted", () => {
    expect(normalizeItem("  x  ")).toBe("x")
  })
})

describe("StringListEditor — tryAddItem", () => {
  it("accepts a new item and returns the next array immutably", () => {
    const current = ["alpha"]
    const result = tryAddItem({ current, raw: "beta" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.next).toEqual(["alpha", "beta"])
      expect(current).toEqual(["alpha"])
      expect(result.added).toBe("beta")
    }
  })

  it("rejects empty input with reason 'empty'", () => {
    const result = tryAddItem({ current: [], raw: "   " })
    expect(result).toEqual({ ok: false, reason: "empty" })
  })

  it("rejects duplicate when allowDuplicates=false (default)", () => {
    const result = tryAddItem({ current: ["foo"], raw: "foo" })
    expect(result).toEqual({ ok: false, reason: "duplicate" })
  })

  it("accepts duplicate when allowDuplicates=true", () => {
    const result = tryAddItem({
      current: ["foo"],
      raw: "foo",
      allowDuplicates: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.next).toEqual(["foo", "foo"])
  })

  it("applies normalization before dedupe check ('  Foo  ' === 'foo' under trimLowercase)", () => {
    const result = tryAddItem({
      current: ["foo"],
      raw: "  Foo  ",
      normalize: "trimLowercase",
    })
    expect(result).toEqual({ ok: false, reason: "duplicate" })
  })

  it("rejects item exceeding maxItemLength with reason 'too_long'", () => {
    const result = tryAddItem({
      current: [],
      raw: "abcdef",
      maxItemLength: 5,
    })
    expect(result).toEqual({ ok: false, reason: "too_long" })
  })

  it("rejects when maxItems capacity reached with reason 'too_many'", () => {
    const result = tryAddItem({
      current: ["a", "b", "c"],
      raw: "d",
      maxItems: 3,
    })
    expect(result).toEqual({ ok: false, reason: "too_many" })
  })

  it("accepts when list is under maxItems", () => {
    const result = tryAddItem({
      current: ["a", "b"],
      raw: "c",
      maxItems: 3,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.next).toEqual(["a", "b", "c"])
  })

  it("preserves case under default 'trim' normalization", () => {
    const result = tryAddItem({ current: [], raw: "CamelCase Value" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.added).toBe("CamelCase Value")
  })
})

describe("StringListEditor — shouldCommitOnKey", () => {
  it("commits on Enter when delimiter='both' or 'enter'", () => {
    expect(shouldCommitOnKey("Enter", "both", true)).toBe(true)
    expect(shouldCommitOnKey("Enter", "enter", true)).toBe(true)
    expect(shouldCommitOnKey("Enter", "comma", true)).toBe(false)
  })

  it("commits on comma when delimiter='both' or 'comma'", () => {
    expect(shouldCommitOnKey(",", "both", true)).toBe(true)
    expect(shouldCommitOnKey(",", "comma", true)).toBe(true)
    expect(shouldCommitOnKey(",", "enter", true)).toBe(false)
  })

  it("commits on Tab only when draft is non-empty", () => {
    expect(shouldCommitOnKey("Tab", "both", true)).toBe(true)
    expect(shouldCommitOnKey("Tab", "both", false)).toBe(false)
  })

  it("does not commit on unrelated keys", () => {
    expect(shouldCommitOnKey("a", "both", true)).toBe(false)
    expect(shouldCommitOnKey("Escape", "both", true)).toBe(false)
  })
})
