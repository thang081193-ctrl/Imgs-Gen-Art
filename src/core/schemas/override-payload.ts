// Session #27a — Phase 5 Step 5a. Strict allowlist for POST
// /api/assets/:id/replay `overridePayload` when body.mode === "edit".
//
// Why strict (not ReplayPayloadSchema.pick().partial()): picking flattens
// providerSpecificParams as a whole object and would allow the client to
// stuff arbitrary keys through `.passthrough()`. A dedicated flat shape with
// `.strict()` blocks that cleanly — any key outside prompt / addWatermark /
// negativePrompt fails Zod parsing and the route hand-lifts the offending
// key into `EditFieldNotAllowedError(field)` for a field-level 400.
//
// NOT editable in v1 (per Session #27 pre-align Q6):
//   - providerId, modelId, seed, aspectRatio, language  (changing any of
//     these = fresh asset via Workflow page, not a replay-with-edits)
//   - promptTemplateId, promptTemplateVersion            (code event, not
//     a user-facing override)
//   - contextSnapshot                                    (server-derived)
// Capability gating (negativePrompt on Imagen 4 etc.) is a second-pass check
// after this schema passes; handled in replay-service.ts.

import { z } from "zod"

export const OverridePayloadSchema = z
  .object({
    prompt: z.string().min(1).max(10000).optional(),
    addWatermark: z.boolean().optional(),
    negativePrompt: z.string().max(2000).optional(),
  })
  .strict()

export type OverridePayload = z.infer<typeof OverridePayloadSchema>

export const OVERRIDE_ALLOWED_FIELDS = ["prompt", "addWatermark", "negativePrompt"] as const
