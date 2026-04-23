// Phase 5 Step 5b (Session #27b) — unit tests for the word-level diff util.
// Exercises the tokenizer + LCS walk + adjacent merge invariants so the
// DiffViewer stays predictable as the PromptLab textarea grows.

import { describe, expect, it } from "vitest"

import { diffWords, tokenize } from "@/client/utils/diff-words"

describe("tokenize — regex grouping", () => {
  it("splits on whitespace + punctuation + word runs", () => {
    expect(tokenize("hello, world!")).toEqual(["hello", ",", " ", "world", "!"])
  })

  it("preserves multi-word whitespace runs as a single token", () => {
    expect(tokenize("a    b")).toEqual(["a", "    ", "b"])
  })

  it("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([])
  })
})

describe("diffWords — equal path", () => {
  it("emits a single 'equal' part when inputs are identical", () => {
    const parts = diffWords("same prompt", "same prompt")
    expect(parts).toEqual([{ op: "equal", text: "same prompt" }])
  })

  it("emits all-insert when before is empty", () => {
    const parts = diffWords("", "new text")
    expect(parts).toEqual([{ op: "insert", text: "new text" }])
  })

  it("emits all-delete when after is empty", () => {
    const parts = diffWords("old text", "")
    expect(parts).toEqual([{ op: "delete", text: "old text" }])
  })
})

describe("diffWords — edits with merge", () => {
  it("detects a single substitution and merges adjacent ops", () => {
    const parts = diffWords("mountain lake at sunrise", "mountain lake at sunset")
    const ops = parts.map((p) => p.op)
    expect(ops).toContain("delete")
    expect(ops).toContain("insert")
    // Common prefix stays as one equal part (merged).
    expect(parts[0]?.op).toBe("equal")
    expect(parts[0]?.text).toBe("mountain lake at ")
  })

  it("round-trips: applying delete+insert ops produces the 'after' string", () => {
    const before = "the quick brown fox jumps"
    const after = "a quick red fox runs"
    const parts = diffWords(before, after)
    const reconstructed = parts
      .filter((p) => p.op !== "delete")
      .map((p) => p.text)
      .join("")
    expect(reconstructed).toBe(after)
    const originalReconstructed = parts
      .filter((p) => p.op !== "insert")
      .map((p) => p.text)
      .join("")
    expect(originalReconstructed).toBe(before)
  })

  it("does not produce adjacent same-op parts (merge invariant)", () => {
    const parts = diffWords("a b c d", "a x b y c z d")
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i]?.op).not.toBe(parts[i - 1]?.op)
    }
  })
})
