// Session #39 Phase B1 — live smoke against xAI Grok.
//
// Gated by XAI_API_KEY so `npm run regression:full` stays hermetic. Budget:
// 3 calls × ~500 tokens each ≈ $0.0005 / run. Invoke explicitly via
// `npm run test:live:prompt-assist` when bro wants to verify a real Grok
// round-trip.

import { describe, expect, it } from "vitest"

import { ideaToPrompt, textOverlayBrainstorm, reverseFromImage } from "@/server/services/prompt-assist"

const HAS_KEY = typeof process.env["XAI_API_KEY"] === "string" && process.env["XAI_API_KEY"].length > 0

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

describe.skipIf(!HAS_KEY)("prompt-assist — live", () => {
  it(
    "ideaToPrompt returns non-empty text against real Grok",
    async () => {
      const r = await ideaToPrompt({ idea: "minimal teal hero", lane: "artwork-batch" })
      expect(r.fromFallback).toBeUndefined()
      expect(r.prompt.length).toBeGreaterThan(20)
    },
    20_000,
  )

  it(
    "textOverlayBrainstorm returns non-empty text",
    async () => {
      const r = await textOverlayBrainstorm({ headline: "Ship faster" })
      expect(r.fromFallback).toBeUndefined()
      expect(r.prompt.length).toBeGreaterThan(20)
    },
    20_000,
  )

  it(
    "reverseFromImage handles the vision message shape",
    async () => {
      const r = await reverseFromImage({ image: TINY_PNG, lane: "artwork-batch" })
      expect(r.fromFallback).toBeUndefined()
      expect(r.prompt.length).toBeGreaterThan(20)
    },
    25_000,
  )
})
