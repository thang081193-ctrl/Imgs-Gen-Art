// Session #39 Phase B1 (PLAN-v3 §3.1) — provider-agnostic LLM contracts.
//
// LLMProvider is the single seam every prompt-assist use case calls. Adding
// a new vendor (OpenAI, Anthropic, Gemini-text) = ship one file implementing
// this interface + register in registry.ts. Use cases never import a vendor
// SDK or fetch directly — keeps the swap surface tiny.
//
// Message shape mirrors OpenAI chat-completions (role/content/parts). All
// the LLMs we plan to wire (xAI Grok, OpenAI, Anthropic via OpenAI-compat)
// already speak this dialect, so the interface stays vendor-neutral by
// construction.

export type LLMRole = "system" | "user" | "assistant"

export interface LLMTextPart {
  type: "text"
  text: string
}

export interface LLMImagePart {
  type: "image_url"
  image_url: { url: string }
}

export type LLMContentPart = LLMTextPart | LLMImagePart

export interface LLMMessage {
  role: LLMRole
  content: string | LLMContentPart[]
}

export interface LLMChatRequest {
  messages: LLMMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface LLMChatResponse {
  text: string
  tokens?: { in: number; out: number }
}

export interface LLMProvider {
  readonly name: string
  readonly model: string
  chat(req: LLMChatRequest): Promise<LLMChatResponse>
}
