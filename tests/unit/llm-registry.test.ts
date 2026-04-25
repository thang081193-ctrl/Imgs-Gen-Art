// Session #39 Phase B1 — LLM registry unit tests.
//
// Verifies env-driven provider selection + null-on-missing-key contract.
// Adding a new provider = extend KNOWN_PROVIDERS + add a case here.

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  activeProviderName,
  getActiveLLMProvider,
} from "@/server/services/llm/registry"

beforeEach(() => {
  delete process.env["XAI_API_KEY"]
  delete process.env["PROMPT_LLM_PROVIDER"]
})

afterEach(() => {
  delete process.env["XAI_API_KEY"]
  delete process.env["PROMPT_LLM_PROVIDER"]
})

describe("activeProviderName", () => {
  it("defaults to 'grok' when env is unset", () => {
    expect(activeProviderName()).toBe("grok")
  })

  it("returns 'grok' for explicit env value (case-insensitive)", () => {
    process.env["PROMPT_LLM_PROVIDER"] = "GROK"
    expect(activeProviderName()).toBe("grok")
  })

  it("falls back to 'grok' for unknown values", () => {
    process.env["PROMPT_LLM_PROVIDER"] = "openai"
    expect(activeProviderName()).toBe("grok")
  })

  it("falls back to 'grok' for whitespace-only", () => {
    process.env["PROMPT_LLM_PROVIDER"] = "   "
    expect(activeProviderName()).toBe("grok")
  })
})

describe("getActiveLLMProvider", () => {
  it("returns null when grok provider is selected but key is missing", () => {
    expect(getActiveLLMProvider()).toBeNull()
  })

  it("returns a provider when key is set", () => {
    process.env["XAI_API_KEY"] = "xai-test"
    const provider = getActiveLLMProvider()
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe("grok")
  })
})
