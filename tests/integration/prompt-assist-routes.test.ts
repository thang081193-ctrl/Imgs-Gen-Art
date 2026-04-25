// Session #39 Phase B1 — /api/prompt-assist HTTP integration tests.
//
// Mounts the real Hono app + fires multipart and JSON requests. The active
// LLM provider is mocked at module level so we exercise the full path
// (route → use case → fallback) without a live API key. Log writer is
// redirected to a tmp file per test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { LLMChatRequest, LLMChatResponse, LLMProvider } from "@/server/services/llm/types"

let providerImpl: LLMProvider | null = null

vi.mock("@/server/services/llm/registry", () => ({
  activeProviderName: () => "grok",
  getActiveLLMProvider: () => providerImpl,
}))

vi.mock("@/server/profile-repo", () => ({
  tryLoadProfile: vi.fn(() => null),
}))

import { createApp } from "@/server/app"
import {
  resetLogPathForTests,
  setLogPath,
} from "@/server/services/prompt-assist"

function mkProvider(impl: (req: LLMChatRequest) => Promise<LLMChatResponse>): LLMProvider {
  return { name: "grok", model: "grok-2-vision-1212", chat: impl }
}

function freshApp() {
  return createApp({ version: "0.0.0-test" })
}

let logDir: string

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), "prompt-assist-int-"))
  setLogPath(join(logDir, "prompt-assist.jsonl"))
  providerImpl = null
})

afterEach(() => {
  resetLogPathForTests()
  rmSync(logDir, { recursive: true, force: true })
  providerImpl = null
})

describe("POST /api/prompt-assist/idea-to-prompt", () => {
  it("200 happy path — proxies LLM result", async () => {
    providerImpl = mkProvider(async () => ({ text: "expanded prompt", tokens: { in: 5, out: 7 } }))
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/idea-to-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: "winter sale", lane: "ads.meta", platform: "feed" }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { prompt: string; tokens?: { in: number; out: number } }
    expect(body.prompt).toBe("expanded prompt")
    expect(body.tokens).toEqual({ in: 5, out: 7 })
  })

  it("200 fallback when no LLM provider — fromFallback:true", async () => {
    providerImpl = null
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/idea-to-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: "abc", lane: "ads.meta" }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { prompt: string; fromFallback: boolean }
    expect(body.fromFallback).toBe(true)
    expect(body.prompt).toContain("abc")
  })

  it("400 on missing idea field", async () => {
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/idea-to-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lane: "ads.meta" }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("400 on unknown lane", async () => {
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/idea-to-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: "x", lane: "bogus" }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("POST /api/prompt-assist/text-overlay-brainstorm", () => {
  it("200 happy path with headline only", async () => {
    providerImpl = mkProvider(async () => ({ text: "[bold] x" }))
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/text-overlay-brainstorm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline: "Ship faster" }),
      }),
    )
    expect(res.status).toBe(200)
  })

  it("200 fallback returns 5 tone-labelled lines when LLM offline", async () => {
    providerImpl = null
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/text-overlay-brainstorm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline: "Ship faster" }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { prompt: string; fromFallback: boolean }
    expect(body.fromFallback).toBe(true)
    expect(body.prompt.split("\n")).toHaveLength(5)
  })

  it("400 when neither image, description, nor headline is provided", async () => {
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/text-overlay-brainstorm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("400 when image is not a data URL", async () => {
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/text-overlay-brainstorm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: "https://example.com/x.png" }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("POST /api/prompt-assist/reverse-from-image", () => {
  it("200 fallback when no provider + no key (multipart upload)", async () => {
    providerImpl = null
    const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    const form = new FormData()
    form.append("image", new Blob([tinyPng], { type: "image/png" }), "img.png")
    form.append("lane", "ads.meta")
    form.append("platform", "feed")

    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/reverse-from-image", {
        method: "POST",
        body: form,
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fromFallback: boolean; prompt: string }
    expect(body.fromFallback).toBe(true)
    expect(body.prompt).toContain("ads.meta")
  })

  it("200 happy path — providers reaches the use case", async () => {
    providerImpl = mkProvider(async () => ({ text: "reversed prompt" }))
    const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    const form = new FormData()
    form.append("image", new Blob([tinyPng], { type: "image/png" }), "img.png")

    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/reverse-from-image", {
        method: "POST",
        body: form,
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { prompt: string }
    expect(body.prompt).toBe("reversed prompt")
  })

  it("400 when image field is missing", async () => {
    const form = new FormData()
    form.append("lane", "ads.meta")
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/reverse-from-image", {
        method: "POST",
        body: form,
      }),
    )
    expect(res.status).toBe(400)
  })

  it("400 when body is not multipart", async () => {
    const res = await freshApp().fetch(
      new Request("http://127.0.0.1/api/prompt-assist/reverse-from-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    )
    expect(res.status).toBe(400)
  })
})
