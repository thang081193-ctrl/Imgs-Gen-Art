// Phase 5 Step 1 (Session #25) — body schema for POST /api/assets/:id/replay.
// Session #27a — extended with `overridePayload` for mode === "edit". Zod
// discriminated union keeps the two mode surfaces type-safe: mode="replay"
// accepts no override, mode="edit" REQUIRES overridePayload with at least
// one allowlisted field. The strict allowlist in OverridePayloadSchema
// blocks non-editable fields with `EDIT_FIELD_NOT_ALLOWED` at Zod parse time.
//
// At least one override field must be present on mode="edit" — an empty
// override is nonsense (same as mode="replay") and rejected at the route
// layer with a 400 rather than silently collapsing to a pure replay.

import { z } from "zod"

import { OverridePayloadSchema } from "@/core/schemas/override-payload"

export const ReplayBodySchema = z
  .object({
    mode: z.enum(["replay", "edit"]).default("replay"),
    overridePayload: OverridePayloadSchema.optional(),
  })
  .refine(
    (body) => body.mode !== "edit" || body.overridePayload !== undefined,
    { message: "mode='edit' requires overridePayload", path: ["overridePayload"] },
  )
  .refine(
    (body) => body.mode !== "replay" || body.overridePayload === undefined,
    {
      message: "overridePayload is only valid with mode='edit'",
      path: ["overridePayload"],
    },
  )

export type ReplayBody = z.infer<typeof ReplayBodySchema>
