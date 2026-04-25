// Session #39 Phase B1 — use-case orchestration unit tests.
//
// Verifies the LLM-call → fallback handoff for all 3 use cases. The LLM
// registry is mocked at module level so we can swap in a stub provider that
// resolves / throws / aborts on demand. Log output goes to a tmp file the
// test asserts against to confirm the JSONL shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { LLMChatRequest, LLMChatResponse, LLMProvider } from "@/server/services/llm/types"
import { LLMTimeoutError, LLMUnavailableError } from "@/server/services/llm/errors"

let providerImpl: LLMProvider | null = null

vi.mock("@/server/services/llm/registry", () => ({
  activeProviderName: () => "grok",
  getActiveLLMProvider: () => providerImpl,
}))

vi.mock("@/server/profile-repo", () => ({
  tryLoadProfile: vi.fn(() => null),
}))

import {
  ideaToPrompt,
  resetLogPathForTests,
  reverseFromImage,
  setLogPath,
  textOverlayBrainstorm,
  type PromptAssistLogEntry,
} from "@/server/services/prompt-assist"

let logDir: string
let logPath: string

function mkProvider(impl: (req: LLMChatRequest) => Promise<LLMChatResponse>): LLMProvider {
  return { name: "grok", model: "grok-2-vision-1212", chat: impl }
}

function readLog(): PromptAssistLogEntry[] {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as PromptAssistLogEntry)
}

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), "prompt-assist-test-"))
  logPath = join(logDir, "prompt-assist.jsonl")
  setLogPath(logPath)
  providerImpl = null
})

afterEach(() => {
  resetLogPathForTests()
  rmSync(logDir, { recursive: true, force: true })
  providerImpl = null
})

describe("reverseFromImage", () => {
  const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])

  it("happy path → returns LLM text + logs outcome=ok with tokens", async () => {
    providerImpl = mkProvider(async () => ({
      text: "a foggy mountain at dawn",
      tokens: { in: 50, out: 12 },
    }))
    const result = await reverseFromImage({ image: tinyPng, lane: "ads.meta" })
    expect(result.prompt).toBe("a foggy mountain at dawn")
    expect(result.fromFallback).toBeUndefined()
    const log = readLog()
    expect(log).toHaveLength(1)
    expect(log[0]!.outcome).toBe("ok")
    expect(log[0]!.useCase).toBe("reverse-from-image")
    expect(log[0]!.inputTokens).toBe(50)
    expect(log[0]!.outputTokens).toBe(12)
  })

  it("provider null → returns fallback + logs outcome=fallback with provider=none", async () => {
    providerImpl = null
    const result = await reverseFromImage({ image: tinyPng, lane: "ads.meta" })
    expect(result.fromFallback).toBe(true)
    const log = readLog()
    expect(log[0]!.outcome).toBe("fallback")
    expect(log[0]!.provider).toBe("none")
    expect(log[0]!.model).toBeNull()
  })

  it("LLM throws → returns fallback + logs outcome=fallback", async () => {
    providerImpl = mkProvider(async () => {
      throw new LLMUnavailableError("rate limit", "grok", "http-error", 429)
    })
    const result = await reverseFromImage({ image: tinyPng })
    expect(result.fromFallback).toBe(true)
    expect(readLog()[0]!.outcome).toBe("fallback")
    expect(readLog()[0]!.error).toBeDefined()
  })

  it("LLM timeout → returns fallback + logs outcome=timeout", async () => {
    providerImpl = mkProvider(async () => {
      throw new LLMTimeoutError("grok", 30_000)
    })
    const result = await reverseFromImage({ image: tinyPng })
    expect(result.fromFallback).toBe(true)
    expect(readLog()[0]!.outcome).toBe("timeout")
  })

  it("redacts no PII — log line never contains image bytes or prompt body", async () => {
    providerImpl = mkProvider(async () => ({ text: "secret prompt body XYZ", tokens: { in: 1, out: 1 } }))
    await reverseFromImage({ image: tinyPng })
    const raw = readFileSync(logPath, "utf8")
    expect(raw).not.toContain("secret prompt body XYZ")
    expect(raw).not.toContain(tinyPng.toString("base64"))
  })
})

describe("ideaToPrompt", () => {
  it("happy path → expands idea + logs ok", async () => {
    providerImpl = mkProvider(async () => ({
      text: "expanded prompt",
      tokens: { in: 30, out: 10 },
    }))
    const r = await ideaToPrompt({ idea: "winter campaign", lane: "ads.meta" })
    expect(r.prompt).toBe("expanded prompt")
    expect(readLog()[0]!.outcome).toBe("ok")
  })

  it("provider null → composer fallback (generic, no profile)", async () => {
    providerImpl = null
    const r = await ideaToPrompt({ idea: "winter", lane: "ads.meta" })
    expect(r.fromFallback).toBe(true)
    expect(r.prompt).toContain("winter")
    expect(readLog()[0]!.provider).toBe("none")
  })
})

describe("textOverlayBrainstorm", () => {
  it("happy path → returns 5-line LLM output + logs ok", async () => {
    providerImpl = mkProvider(async () => ({
      text: "[bold] x\n[playful] y\n[minimal] z\n[urgency] a\n[social-proof] b",
      tokens: { in: 20, out: 30 },
    }))
    const r = await textOverlayBrainstorm({ headline: "Ship it" })
    expect(r.prompt.split("\n")).toHaveLength(5)
    expect(readLog()[0]!.outcome).toBe("ok")
  })

  it("provider null → 5-template fallback", async () => {
    providerImpl = null
    const r = await textOverlayBrainstorm({ headline: "Ship it" })
    expect(r.fromFallback).toBe(true)
    expect(r.prompt.split("\n")).toHaveLength(5)
    expect(readLog()[0]!.provider).toBe("none")
  })

  it("error path → fallback + log captures error message", async () => {
    providerImpl = mkProvider(async () => {
      throw new Error("network down")
    })
    const r = await textOverlayBrainstorm({ headline: "Ship it" })
    expect(r.fromFallback).toBe(true)
    const log = readLog()[0]!
    expect(log.outcome).toBe("fallback")
    expect(log.error).toContain("network down")
  })
})
