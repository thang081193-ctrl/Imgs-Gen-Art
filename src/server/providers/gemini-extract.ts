// Pure image-extraction from a Gemini generateContent response.
// Three failure modes mapped to typed errors so callers (the adapter + UI)
// can surface distinct UX: safety-block vs. empty-candidate vs. generic SDK
// shape violation. Zero SDK runtime coupling — typed against a structural
// subset of the response so tests can hand-craft fixtures without importing
// the SDK class.

import { ProviderError, SafetyFilterError } from "@/core/shared/errors"

export interface GeminiResponseShape {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string }
        text?: string
      }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
    blockReasonMessage?: string
  }
}

export interface ExtractedImage {
  bytes: Buffer
  mimeType: "image/png" | "image/jpeg"
  width: number
  height: number
}

// PNG IHDR chunk is fixed: signature (8B) + length (4B) + "IHDR" (4B) + width
// (4B BE) + height (4B BE) = widths at byte 16, height at byte 20. Returns
// {0,0} for JPEG or malformed PNG so callers never see a crash — dimensions
// are a convenience, not a correctness requirement.
export function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24) return { width: 0, height: 0 }
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return { width: 0, height: 0 }
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

export interface ExtractionContext {
  modelId: string
  // Truncated prompt for error-surface — caller controls length/redaction.
  // Omit entirely when the prompt may be sensitive.
  promptHint?: string
}

// Safety-check BEFORE extraction so block reasons surface as the typed error
// even when the response also lacks candidates. Mime-allowlist guards against
// the SDK returning a format Images Gen Art doesn't support (e.g. "image/webp"
// without a decoder path). If that happens we throw — the alternative of
// silently coercing is worse than a loud failure.
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"])

export function extractImageFromResponse(
  response: GeminiResponseShape,
  context: ExtractionContext,
): ExtractedImage {
  const blockReason = response.promptFeedback?.blockReason
  if (blockReason) {
    const message = response.promptFeedback?.blockReasonMessage
      ? `Gemini safety filter: ${blockReason} — ${response.promptFeedback.blockReasonMessage}`
      : `Gemini safety filter: ${blockReason}`
    throw new SafetyFilterError(message, {
      providerId: "gemini",
      modelId: context.modelId,
      reason: blockReason,
      ...(context.promptHint !== undefined ? { prompt: context.promptHint } : {}),
    })
  }

  const candidates = response.candidates ?? []
  if (candidates.length === 0) {
    throw new ProviderError("Gemini response contained no candidates", {
      providerId: "gemini",
      modelId: context.modelId,
    })
  }

  const parts = candidates[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new ProviderError("Gemini response contained no inline image data", {
      providerId: "gemini",
      modelId: context.modelId,
      sdkCode: candidates[0]?.finishReason ?? "NO_INLINE_DATA",
    })
  }

  const mimeType = imagePart.inlineData.mimeType ?? "image/png"
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ProviderError(`Gemini returned unsupported mime type: ${mimeType}`, {
      providerId: "gemini",
      modelId: context.modelId,
      sdkCode: "UNSUPPORTED_MIME",
    })
  }

  const bytes = Buffer.from(imagePart.inlineData.data, "base64")
  const { width, height } = mimeType === "image/png"
    ? readPngDimensions(bytes)
    : { width: 0, height: 0 }
  return {
    bytes,
    mimeType: mimeType as "image/png" | "image/jpeg",
    width,
    height,
  }
}
