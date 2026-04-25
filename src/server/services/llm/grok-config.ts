// Session #39 Phase B1 — Grok env reader.
//
// Q-39.C: env-var key (XAI_API_KEY) read lazily. Boot tests that don't touch
// the LLM stay hermetic — env is only consulted when getActiveLLMProvider()
// resolves to grok and a use case actually fires.
//
// Model + base URL are env-overridable for staging / future model bumps but
// default to the values verified against xAI docs at session start.

export interface GrokConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

export const GROK_DEFAULTS = {
  baseUrl: "https://api.x.ai/v1",
  model: "grok-2-vision-1212",
  timeoutMs: 30_000,
} as const

export function readGrokConfig(): GrokConfig | null {
  const apiKey = process.env["XAI_API_KEY"]
  if (!apiKey || apiKey.trim().length === 0) return null
  return {
    apiKey,
    baseUrl: process.env["XAI_BASE_URL"] ?? GROK_DEFAULTS.baseUrl,
    model: process.env["XAI_MODEL"] ?? GROK_DEFAULTS.model,
    timeoutMs: parseTimeout(process.env["XAI_TIMEOUT_MS"]) ?? GROK_DEFAULTS.timeoutMs,
  }
}

function parseTimeout(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
