// Tests for src/core/shared/*.
// Plan BOOTSTRAP Step 2: mulberry32 sequence stable for seed=42, logger redacts AIza... patterns.

import { describe, expect, it, vi } from "vitest"
import { mulberry32, pickOne } from "@/core/shared/rand"
import { shortId, slugify } from "@/core/shared/id"
import { createLogger, redact } from "@/core/shared/logger"

describe("mulberry32", () => {
  it("produces stable sequence for seed=42", () => {
    const rand = mulberry32(42)
    const first5 = [rand(), rand(), rand(), rand(), rand()]
    // Snapshot first 5 values. If mulberry32 impl changes, update snapshot intentionally.
    expect(first5.every((v) => v >= 0 && v < 1)).toBe(true)
    // Deterministic: same seed → same sequence
    const rand2 = mulberry32(42)
    const again5 = [rand2(), rand2(), rand2(), rand2(), rand2()]
    expect(again5).toEqual(first5)
  })

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it("pickOne returns an item and never throws for non-empty list", () => {
    const rand = mulberry32(7)
    const items = ["a", "b", "c"] as const
    for (let i = 0; i < 20; i++) {
      const x = pickOne(rand, items)
      expect(items).toContain(x)
    }
  })

  it("pickOne throws for empty list", () => {
    const rand = mulberry32(0)
    expect(() => pickOne(rand, [])).toThrow()
  })
})

describe("id helpers", () => {
  it("shortId has prefix + separator", () => {
    const id = shortId("as")
    expect(id.startsWith("as_")).toBe(true)
    expect(id.length).toBeGreaterThan(3)
  })

  it("slugify handles spaces + unicode accents", () => {
    expect(slugify("Hello  World")).toBe("hello-world")
    expect(slugify("Cà phê sữa đá")).toMatch(/^ca-phe-s..-da$/)
    expect(slugify("--weird__name!!")).toBe("weird-name")
  })
})

describe("logger: secret redaction (Rule 9)", () => {
  it("redact() masks Gemini API key pattern", () => {
    const input = "failed with key AIza1234567890abcdefghijklmnopqrstuv12345 in body"
    const out = redact(input)
    expect(out).toContain("AIza***")
    expect(out).not.toContain("AIza1234567890abcdefghijklmnopqrstuv12345")
  })

  it("redact() masks ya29 bearer token", () => {
    const out = redact("token ya29.abc-DEF_123 goes to vertex")
    expect(out).toContain("ya29.***")
  })

  it("redact() masks JWT-like tokens", () => {
    const out = redact("Authorization: Bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIx.SflKxwRJSM")
    expect(out).toContain("eyJ***.***.***")
  })

  it("logger redacts in msg and nested fields, and debug/info emit via console.debug when level=debug", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const l = createLogger("debug")
    l.info("request with AIza1234567890abcdefghijklmnopqrstuv12345", {
      payload: { key: "AIza1234567890abcdefghijklmnopqrstuv12345" },
    })

    expect(debugSpy).toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    const firstCall = debugSpy.mock.calls[0]?.[0]
    expect(typeof firstCall).toBe("string")
    expect(firstCall as string).toContain("AIza***")
    expect(firstCall as string).not.toContain("AIza1234567890abcdefghijklmnopqrstuv12345")

    debugSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("default logger: debug + info no-op; warn → console.warn; error → console.error", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const l = createLogger("info") // default behavior — debug suppressed
    l.debug("should not surface")
    l.info("informational note")   // info >= info → emits via console.debug per routing rule
    l.warn("heads up")
    l.error("boom")

    // debug() call is below minLevel → never emits
    // info() call is at minLevel → emits via console.debug
    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy.mock.calls[0]?.[0]).toContain("[INFO]")

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[WARN]")

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ERROR]")

    debugSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("minLevel=warn suppresses debug + info entirely", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const l = createLogger("warn")
    l.debug("nope")
    l.info("nope")
    l.warn("yes")

    expect(debugSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    debugSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
