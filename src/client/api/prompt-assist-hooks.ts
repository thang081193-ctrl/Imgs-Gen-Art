// Session #40 Phase B2 — client hooks for /api/prompt-assist/*.
//
// Three state-machine hooks mirroring the useReplay shape (Q-40.I):
// `submit(input)` returns a Promise<Result> AND drives a state slot
// (`idle | submitting | done | error`) the consumer renders spinner +
// inline error UI from. `reset()` clears local state. Errors are typed
// PromptAssistError — the page layer decides toast vs inline.
//
// `profileId` is read from localStorage via the active-profile util on
// every submit (Q-40.C). When unset, the request omits it and the
// backend serves its no-profile fallback.

import { useCallback, useState } from "react"

import { ApiError, apiPost, apiPostMultipart } from "@/client/api/client"
import { getActiveProfileId } from "@/client/utils/active-profile"

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

export type PromptAssistState = "idle" | "submitting" | "done" | "error"

export type PromptAssistErrorKind = "network" | "validation" | "unknown"

export class PromptAssistError extends Error {
  readonly kind: PromptAssistErrorKind
  readonly status: number | null
  constructor(kind: PromptAssistErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = "PromptAssistError"
    this.kind = kind
    this.status = status
  }
}

function classify(err: unknown): PromptAssistError {
  if (err instanceof PromptAssistError) return err
  if (err instanceof ApiError) {
    const kind: PromptAssistErrorKind = err.status >= 400 && err.status < 500 ? "validation" : "network"
    return new PromptAssistError(kind, err.message, err.status)
  }
  if (err instanceof TypeError) {
    return new PromptAssistError("network", err.message)
  }
  return new PromptAssistError("unknown", err instanceof Error ? err.message : String(err))
}

export interface PromptAssistHandle<I> {
  state: PromptAssistState
  result: PromptAssistResult | null
  error: PromptAssistError | null
  submit: (input: I) => Promise<PromptAssistResult>
  reset: () => void
}

interface MakeHookArgs<I> {
  send: (input: I, profileId: string | null) => Promise<PromptAssistResult>
}

function makeHook<I>({ send }: MakeHookArgs<I>): () => PromptAssistHandle<I> {
  return function useHook(): PromptAssistHandle<I> {
    const [state, setState] = useState<PromptAssistState>("idle")
    const [result, setResult] = useState<PromptAssistResult | null>(null)
    const [error, setError] = useState<PromptAssistError | null>(null)

    const submit = useCallback(async (input: I): Promise<PromptAssistResult> => {
      setState("submitting")
      setResult(null)
      setError(null)
      try {
        const profileId = getActiveProfileId()
        const out = await send(input, profileId)
        setResult(out)
        setState("done")
        return out
      } catch (err) {
        const e = classify(err)
        setError(e)
        setState("error")
        throw e
      }
    }, [])

    const reset = useCallback((): void => {
      setState("idle")
      setResult(null)
      setError(null)
    }, [])

    return { state, result, error, submit, reset }
  }
}

// ---- Reverse from image -----------------------------------------------------

export interface ReverseFromImageInput {
  image: File
  lane?: PromptAssistLane
  platform?: string
}

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function isAllowedImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)
}

export const useReverseFromImage = makeHook<ReverseFromImageInput>({
  send: async (input, profileId) => {
    if (!isAllowedImageMime(input.image.type)) {
      throw new PromptAssistError("validation", `Unsupported image type: ${input.image.type || "unknown"}`)
    }
    if (input.image.size > MAX_IMAGE_BYTES) {
      throw new PromptAssistError(
        "validation",
        `Image too large (${(input.image.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
      )
    }
    const fd = new FormData()
    fd.append("image", input.image)
    if (input.lane) fd.append("lane", input.lane)
    if (input.platform) fd.append("platform", input.platform)
    if (profileId) fd.append("profileId", profileId)
    return apiPostMultipart<PromptAssistResult>("/api/prompt-assist/reverse-from-image", fd)
  },
})

// ---- Idea to prompt ---------------------------------------------------------

export interface IdeaToPromptInput {
  idea: string
  lane: PromptAssistLane
  platform?: string
}

export const useIdeaToPrompt = makeHook<IdeaToPromptInput>({
  send: async (input, profileId) => {
    const trimmed = input.idea.trim()
    if (trimmed.length < 3) {
      throw new PromptAssistError("validation", "Idea must be at least 3 characters.")
    }
    if (trimmed.length > 2000) {
      throw new PromptAssistError("validation", "Idea must be at most 2000 characters.")
    }
    const body: Record<string, string> = { idea: trimmed, lane: input.lane }
    if (input.platform) body.platform = input.platform.trim()
    if (profileId) body.profileId = profileId
    return apiPost<PromptAssistResult>("/api/prompt-assist/idea-to-prompt", body)
  },
})

// ---- Text overlay brainstorm ------------------------------------------------

export interface TextOverlayBrainstormInput {
  headline?: string
  description?: string
  imageDataUrl?: string
}

export const useTextOverlayBrainstorm = makeHook<TextOverlayBrainstormInput>({
  send: async (input, profileId) => {
    const headline = input.headline?.trim()
    const description = input.description?.trim()
    if (!headline && !description && !input.imageDataUrl) {
      throw new PromptAssistError(
        "validation",
        "Provide a headline, description, or image to brainstorm overlays.",
      )
    }
    const body: Record<string, string> = {}
    if (headline) body.headline = headline
    if (description) body.description = description
    if (input.imageDataUrl) body.image = input.imageDataUrl
    if (profileId) body.profileId = profileId
    return apiPost<PromptAssistResult>("/api/prompt-assist/text-overlay-brainstorm", body)
  },
})

// ---- Overlay parser (consumed by OverlayPickerModal) ------------------------

export interface OverlayLine {
  tone: string
  text: string
}

const OVERLAY_LINE_RE = /^\s*\[([^\]]+)\]\s*(.+?)\s*$/

export function parseOverlayLines(prompt: string): OverlayLine[] {
  return prompt
    .split("\n")
    .map((raw) => {
      const m = OVERLAY_LINE_RE.exec(raw)
      if (m && m[1] && m[2]) return { tone: m[1].trim(), text: m[2].trim() }
      const trimmed = raw.trim()
      return trimmed.length > 0 ? { tone: "freeform", text: trimmed } : null
    })
    .filter((x): x is OverlayLine => x !== null)
}
