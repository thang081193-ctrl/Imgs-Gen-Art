// Pure image-extraction from an Imagen `generateImages` response.
// Mirrors gemini-extract.ts structure (safety-block → empty → shape guards)
// but against a different response shape: Imagen returns `generatedImages[]`
// each with `image.imageBytes` (base64) + optional `raiFilteredReason`, NOT
// Gemini's `candidates[].content.parts[].inlineData`.
//
// Zero SDK runtime coupling — typed against a structural subset so tests can
// hand-craft fixtures without importing the SDK class. Import
// `readPngDimensions` from gemini-extract rather than duplicate the IHDR
// parsing logic (that module has no SDK imports either).

import { ProviderError, SafetyFilterError } from "@/core/shared/errors"
import { readPngDimensions } from "./gemini-extract"

export interface VertexImagenResponseShape {
  generatedImages?: Array<{
    image?: {
      imageBytes?: string
      mimeType?: string
      gcsUri?: string
    }
    raiFilteredReason?: string
    enhancedPrompt?: string
  }>
  positivePromptSafetyAttributes?: unknown
}

export interface ExtractedImage {
  bytes: Buffer
  mimeType: "image/png" | "image/jpeg"
  width: number
  height: number
}

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"])

export interface ExtractionContext {
  modelId: string
  promptHint?: string
}

export function extractImageFromResponse(
  response: VertexImagenResponseShape,
  context: ExtractionContext,
): ExtractedImage {
  const images = response.generatedImages ?? []
  if (images.length === 0) {
    throw new ProviderError("Vertex Imagen response contained no images", {
      providerId: "vertex",
      modelId: context.modelId,
      sdkCode: "NO_IMAGES",
    })
  }

  const first = images[0]!

  // Imagen's RAI filter populates `raiFilteredReason` INSTEAD of returning
  // bytes — i.e. a safety block produces an entry with no imageBytes + a
  // reason string. Guard this before checking for bytes so users see the
  // safety message, not a generic "missing data" error.
  if (first.raiFilteredReason) {
    throw new SafetyFilterError(
      `Imagen RAI filter: ${first.raiFilteredReason}`,
      {
        providerId: "vertex",
        modelId: context.modelId,
        reason: first.raiFilteredReason,
        ...(context.promptHint !== undefined ? { prompt: context.promptHint } : {}),
      },
    )
  }

  const b64 = first.image?.imageBytes
  if (!b64) {
    throw new ProviderError("Vertex Imagen response missing imageBytes", {
      providerId: "vertex",
      modelId: context.modelId,
      sdkCode: first.image?.gcsUri ? "GCS_URI_ONLY" : "NO_IMAGE_BYTES",
    })
  }

  const mimeType = first.image?.mimeType ?? "image/png"
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ProviderError(
      `Vertex Imagen returned unsupported mime type: ${mimeType}`,
      {
        providerId: "vertex",
        modelId: context.modelId,
        sdkCode: "UNSUPPORTED_MIME",
      },
    )
  }

  const bytes = Buffer.from(b64, "base64")
  const { width, height } =
    mimeType === "image/png" ? readPngDimensions(bytes) : { width: 0, height: 0 }
  return {
    bytes,
    mimeType: mimeType as "image/png" | "image/jpeg",
    width,
    height,
  }
}
