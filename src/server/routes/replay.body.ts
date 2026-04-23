// Phase 5 Step 1 (Session #25) — body schema for POST /api/assets/:id/replay.
//
// v1 surface supports `mode: "replay"` only (exact re-run of the stored
// payload). `mode: "edit"` — prompt/providerSpecificParams overrides — is
// reserved for a follow-up step once the canonical payload migration lands
// (editing a simplified payload would lose the linkage to the original
// template). Schema accepts "edit" as a discriminant so the client contract
// stays stable; route handler returns 501 Not Implemented until wired.

import { z } from "zod"

export const ReplayBodySchema = z.object({
  mode: z.enum(["replay", "edit"]).default("replay"),
})

export type ReplayBody = z.infer<typeof ReplayBodySchema>
