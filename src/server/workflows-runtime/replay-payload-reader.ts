// Session #27a — dual-reader helper for stored replay_payload rows.
//
// Replaces the old permissive `StoredReplayPayloadSchema` (deleted in the
// same session) with a normalized read path that accepts either:
//   1. Canonical ReplayPayloadSchema (new post-27a writers) — parsed and
//      forwarded as `kind: "canonical"` with the typed payload retained for
//      mode=edit payload rebuild in replay-service.
//   2. Legacy pre-Session-#27 shape (promptRaw + primitives) — parsed by
//      the inlined permissive schema, returned as `kind: "legacy"`. Legacy
//      sources cannot be edited (would require synthesizing a stale
//      profileSnapshot); replay-service rejects mode=edit on them via
//      LegacyPayloadNotEditableError.
//
// Throws `MalformedPayloadError` (500) when neither shape matches — this is
// a data-corruption signal, not a client mistake.

import { z } from "zod"

import {
  AspectRatioSchema,
  LanguageCodeSchema,
} from "@/core/model-registry/types"
import {
  ReplayPayloadSchema,
  type ReplayPayload,
} from "@/core/schemas/replay-payload"
import { MalformedPayloadError } from "@/core/shared/errors"

import type { ReplayExecuteFields } from "./replay-execute-fields"

const LegacyReplayPayloadSchema = z
  .object({
    version: z.literal(1),
    promptRaw: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    aspectRatio: AspectRatioSchema,
    seed: z.number().int().nullable().optional(),
    language: LanguageCodeSchema.nullable().optional(),
  })
  .passthrough()

export type ReplayPayloadKind = "canonical" | "legacy"

export interface NormalizedPayload {
  kind: ReplayPayloadKind
  canonical: ReplayPayload | null
  execute: ReplayExecuteFields
}

export function normalizePayload(raw: unknown, sourceAssetId: string): NormalizedPayload {
  const canonical = ReplayPayloadSchema.safeParse(raw)
  if (canonical.success) {
    const p = canonical.data
    const execute: ReplayExecuteFields = {
      prompt: p.prompt,
      providerId: p.providerId,
      modelId: p.modelId,
      aspectRatio: p.aspectRatio,
      addWatermark: p.providerSpecificParams.addWatermark ?? false,
      ...(p.seed !== undefined ? { seed: p.seed } : {}),
      ...(p.language !== undefined ? { language: p.language } : {}),
      ...(p.providerSpecificParams.negativePrompt !== undefined
        ? { negativePrompt: p.providerSpecificParams.negativePrompt }
        : {}),
    }
    return { kind: "canonical", canonical: p, execute }
  }

  // Legacy detection: require `promptRaw` before attempting the permissive
  // parse. Avoids an arbitrary malformed blob silently becoming a legacy
  // match.
  if (typeof raw === "object" && raw !== null && "promptRaw" in raw) {
    const legacy = LegacyReplayPayloadSchema.safeParse(raw)
    if (legacy.success) {
      const execute: ReplayExecuteFields = {
        prompt: legacy.data.promptRaw,
        providerId: legacy.data.providerId,
        modelId: legacy.data.modelId,
        aspectRatio: legacy.data.aspectRatio,
        addWatermark: false,
        ...(legacy.data.seed !== undefined && legacy.data.seed !== null
          ? { seed: legacy.data.seed }
          : {}),
        ...(legacy.data.language !== undefined && legacy.data.language !== null
          ? { language: legacy.data.language }
          : {}),
      }
      return { kind: "legacy", canonical: null, execute }
    }
  }

  throw new MalformedPayloadError(
    `Asset '${sourceAssetId}' replay payload matches neither canonical nor legacy schema`,
    { assetId: sourceAssetId, canonicalIssues: canonical.error.issues },
  )
}
