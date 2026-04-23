// Phase 5 Step 1 (Session #25) — permissive Zod schema for the replay
// payload format currently persisted by all 4 workflow asset-writers.
//
// Context: Session #11 shipped a SIMPLIFIED payload shape (promptRaw +
// providerId + modelId + seed + aspectRatio + profileVersion + language)
// that predates the canonical `ReplayPayloadSchema` at
// src/core/schemas/replay-payload.ts. Aligning the stored shape to the
// canonical schema (adding providerSpecificParams, promptTemplateId/Version
// fields, contextSnapshot.profileSnapshot) is its own dedicated workstream
// (PHASE-STATUS Session #25 Phase 5 Step 1 "canonical payload migration"
// TODO). This permissive schema lets the Replay API ship today against
// existing stored data; when the canonical migration lands, this file
// shrinks to a re-export of ReplayPayloadSchema.

import { z } from "zod"
import {
  AspectRatioSchema,
  LanguageCodeSchema,
} from "@/core/model-registry/types"

export const StoredReplayPayloadSchema = z
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

export type StoredReplayPayload = z.infer<typeof StoredReplayPayloadSchema>
