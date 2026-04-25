// Session #39 Phase B1 — prompt-assist use-case I/O contracts.
//
// Use cases share a single output shape so the wizard layer (B2 = S#40)
// renders a uniform "fallback notice" pill regardless of which use case
// produced the prompt.

export type PromptAssistLane =
  | "ads.meta"
  | "ads.google-ads"
  | "aso.play"
  | "artwork-batch"

export interface PromptAssistResult {
  prompt: string
  notes?: string[]
  tokens?: { in: number; out: number }
  fromFallback?: true
}

export interface ReverseFromImageInput {
  image: Buffer
  lane?: PromptAssistLane
  platform?: string
  profileId?: string
}

export interface IdeaToPromptInput {
  idea: string
  lane: PromptAssistLane
  platform?: string
  profileId?: string
}

export interface TextOverlayBrainstormInput {
  image?: Buffer
  description?: string
  headline?: string
  profileId?: string
}

export type UseCaseName =
  | "reverse-from-image"
  | "idea-to-prompt"
  | "text-overlay-brainstorm"
