// Session #39 Phase B1 — image MIME sniff unit tests.

import { describe, expect, it } from "vitest"

import {
  bufferToDataUrl,
  sniffImageMime,
} from "@/server/services/llm/mime-sniff"

describe("sniffImageMime", () => {
  it("detects PNG", () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]))).toBe(
      "image/png",
    )
  })

  it("detects JPEG", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
  })

  it("detects WEBP via RIFF + WEBP tag at offset 8", () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size (ignored)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ])
    expect(sniffImageMime(webp)).toBe("image/webp")
  })

  it("detects GIF", () => {
    expect(sniffImageMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(
      "image/gif",
    )
  })

  it("falls back to image/png on unknown signatures", () => {
    expect(sniffImageMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe("image/png")
  })
})

describe("bufferToDataUrl", () => {
  it("emits data:image/png;base64 form", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xab, 0xcd])
    expect(bufferToDataUrl(buf)).toBe(`data:image/png;base64,${buf.toString("base64")}`)
  })

  it("uses sniffed MIME for JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0x01])
    expect(bufferToDataUrl(buf).startsWith("data:image/jpeg;base64,")).toBe(true)
  })
})
