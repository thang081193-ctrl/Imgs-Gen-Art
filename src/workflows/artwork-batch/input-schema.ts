// PLAN §6.3 + BOOTSTRAP-PHASE3 Step 3 — artwork-batch input schema.
//
// MUST NOT declare `aspectRatio` or `language` — those are top-level
// WorkflowRunParams. Precondition #7 enforces at runtime; Step 7
// input-schema sweep enforces at test time across all 4 workflows.

import { z } from "zod"

// The 8 artwork-groups camelCase keys extracted by Phase 2. Kept in sync
// with src/core/templates/artwork-groups.ts ArtworkGroupKey — we re-state
// here (rather than import the type) because Zod enum needs literal values
// at runtime, and the template is the ultimate source of truth.
const ARTWORK_GROUP_KEYS = [
  "memory",
  "cartoon",
  "aiArt",
  "festive",
  "xmas",
  "baby",
  "avatar",
  "allInOne",
] as const

export const ArtworkBatchInputSchema = z.object({
  group: z.enum(ARTWORK_GROUP_KEYS),
  subjectDescription: z.string().min(1).max(500),
  conceptCount: z.number().int().min(1).max(10).default(4),
  variantsPerConcept: z.number().int().min(1).max(8).default(1),
  seed: z.number().int().optional(),
}).strict()

export type ArtworkBatchInput = z.infer<typeof ArtworkBatchInputSchema>
export type ArtworkGroupKeyInput = ArtworkBatchInput["group"]
