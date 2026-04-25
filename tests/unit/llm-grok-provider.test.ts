// Session #39 Phase B1 — LLM Grok provider unit tests.
//
// Covers: config reader, fetch wrapper, retry policy, provider chat() flow.
// Mocks global fetch — the provider has no other external dependency.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LLMTimeoutError, LLMUnavailableError } from "@/server/services/llm/errors"
import { readGrokConfig, GROK_DEFAULTS } from "@/server/services/llm/grok-config"
import { callGrokOnce } from "@/server/services/llm/grok-fetch"
import { callGrokWithRetry } from "@/server/services/llm/grok-retry"
import { createGrokProvider } from "@/server/services/llm/grok-provider"
import type { LLMChatRequest } from "@/server/services/llm/types"

const ORIGINAL_FETCH = globalThis.fetch

function mockFetchResponse(body: unknown, init: Partial<Response> = {}): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: init.status ?? 200, ...init }),
  ) as typeof globalThis.fetch
}

function mockFetchSequence(...responses: Array<{ body: unknown; status?: number }>): void {
  let i = 0
  globalThis.fetch = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]!
    i++
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as typeof globalThis.fetch
}

const HAPPY_BODY = {
  choices: [{ message: { content: "a moody portrait" } }],
  usage: { prompt_tokens: 12, completion_tokens: 7 },
}

beforeEach(() => {
  process.env["XAI_API_KEY"] = "xai-test-key"
})

afterEach(() => {
  delete process.env["XAI_API_KEY"]
  delete process.env["XAI_BASE_URL"]
  delete process.env["XAI_MODEL"]
  delete process.env["XAI_TIMEOUT_MS"]
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe("readGrokConfig", () => {
  it("returns null when XAI_API_KEY is missing", () => {
    delete process.env["XAI_API_KEY"]
    expect(readGrokConfig()).toBeNull()
  })

  it("returns null when XAI_API_KEY is whitespace", () => {
    process.env["XAI_API_KEY"] = "   "
    expect(readGrokConfig()).toBeNull()
  })

  it("returns config with defaults when only key is set", () => {
    const cfg = readGrokConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.apiKey).toBe("xai-test-key")
    expect(cfg!.baseUrl).toBe(GROK_DEFAULTS.baseUrl)
    expect(cfg!.model).toBe(GROK_DEFAULTS.model)
    expect(cfg!.timeoutMs).toBe(GROK_DEFAULTS.timeoutMs)
  })

  it("respects env overrides", () => {
    process.env["XAI_BASE_URL"] = "https://custom.x.ai/v1"
    process.env["XAI_MODEL"] = "grok-future"
    process.env["XAI_TIMEOUT_MS"] = "12345"
    const cfg = readGrokConfig()!
    expect(cfg.baseUrl).toBe("https://custom.x.ai/v1")
    expect(cfg.model).toBe("grok-future")
    expect(cfg.timeoutMs).toBe(12345)
  })

  it("falls back to default timeout on bad value", () => {
    process.env["XAI_TIMEOUT_MS"] = "bogus"
    expect(readGrokConfig()!.timeoutMs).toBe(GROK_DEFAULTS.timeoutMs)
  })
})

describe("callGrokOnce", () => {
  const cfg = {
    apiKey: "xai-test-key",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-2-vision-1212",
    timeoutMs: 5000,
  }
  const req: LLMChatRequest = { messages: [{ role: "user", content: "hi" }] }

  it("posts to /chat/completions with bearer auth + parses response", async () => {
    mockFetchResponse(HAPPY_BODY)
    const out = await callGrokOnce(cfg, req)
    expect(out.httpStatus).toBe(200)
    expect(out.response.text).toBe("a moody portrait")
    expect(out.response.tokens).toEqual({ in: 12, out: 7 })

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://api.x.ai/v1/chat/completions")
    expect((init as RequestInit).method).toBe("POST")
    expect(((init as RequestInit).headers as Record<string, string>)["authorization"]).toBe("Bearer xai-test-key")
  })

  it("throws LLMUnavailableError with httpStatus on 4xx/5xx", async () => {
    mockFetchResponse({ error: "bad" }, { status: 429 })
    await expect(callGrokOnce(cfg, req)).rejects.toMatchObject({
      name: "LLMUnavailableError",
      reason: "http-error",
      httpStatus: 429,
    })
  })

  it("omits tokens when usage is missing", async () => {
    mockFetchResponse({ choices: [{ message: { content: "no usage" } }] })
    const out = await callGrokOnce(cfg, req)
    expect(out.response.tokens).toBeUndefined()
  })

  it("emits LLMTimeoutError when fetch aborts via internal timeout", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const signal = (init as RequestInit).signal as AbortSignal
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted") as Error & { name: string }
          err.name = "AbortError"
          reject(err)
        })
      })
    }) as typeof globalThis.fetch
    const fastCfg = { ...cfg, timeoutMs: 5 }
    await expect(callGrokOnce(fastCfg, req)).rejects.toBeInstanceOf(LLMTimeoutError)
  })
})

describe("callGrokWithRetry", () => {
  const cfg = {
    apiKey: "xai-test-key",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-2-vision-1212",
    timeoutMs: 5000,
  }
  const req: LLMChatRequest = { messages: [{ role: "user", content: "hi" }] }

  it("succeeds on first try when 200", async () => {
    mockFetchResponse(HAPPY_BODY)
    const r = await callGrokWithRetry(cfg, req)
    expect(r.attempts).toBe(1)
    expect(r.retried).toBe(false)
  })

  it("retries once on 429 then succeeds", async () => {
    mockFetchSequence({ body: { error: "rate" }, status: 429 }, { body: HAPPY_BODY })
    const r = await callGrokWithRetry(cfg, req)
    expect(r.attempts).toBe(2)
    expect(r.retried).toBe(true)
    expect(r.response.text).toBe("a moody portrait")
  })

  it("retries once on 500 then succeeds", async () => {
    mockFetchSequence({ body: { error: "500" }, status: 502 }, { body: HAPPY_BODY })
    const r = await callGrokWithRetry(cfg, req)
    expect(r.retried).toBe(true)
  })

  it("does NOT retry on 400", async () => {
    mockFetchResponse({ error: "bad" }, { status: 400 })
    await expect(callGrokWithRetry(cfg, req)).rejects.toMatchObject({
      httpStatus: 400,
    })
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it("propagates exhausted retry as LLMUnavailableError", async () => {
    mockFetchSequence(
      { body: { error: "rate" }, status: 429 },
      { body: { error: "still rate" }, status: 429 },
    )
    await expect(callGrokWithRetry(cfg, req)).rejects.toBeInstanceOf(LLMUnavailableError)
  })
})

describe("createGrokProvider", () => {
  it("throws LLMUnavailableError when XAI_API_KEY is missing", () => {
    delete process.env["XAI_API_KEY"]
    expect(() => createGrokProvider()).toThrow(LLMUnavailableError)
  })

  it("returns a working provider that calls chat() through the retry policy", async () => {
    mockFetchResponse(HAPPY_BODY)
    const provider = createGrokProvider()
    expect(provider.name).toBe("grok")
    expect(provider.model).toBe(GROK_DEFAULTS.model)
    const res = await provider.chat({ messages: [{ role: "user", content: "hi" }] })
    expect(res.text).toBe("a moody portrait")
    expect(res.tokens).toEqual({ in: 12, out: 7 })
  })
})
