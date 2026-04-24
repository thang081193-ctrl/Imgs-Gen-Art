// BOOTSTRAP-PHASE3 Step 5 — body schemas for /api/profiles.
//
// Colocated per patterns.md Session #2 (.body.ts sibling). Reuses
// AppProfileSchema's field shapes via .omit()/.extend()/.partial() so the
// storage schema stays the single source of truth (Rule 14): any AppProfile
// v2 migration propagates here automatically.
//
// Create body: AppProfile minus {version, id, createdAt, updatedAt}; id
// optional (server slugifies from name if absent). Update body: same shape
// but top-level .partial() + required expectedVersion for optimistic
// concurrency.

import { z } from "zod"
import { AppProfileBodyFields } from "@/core/schemas/app-profile"

// Session #31 — AppProfileSchema is now z.union([V1,V2]).transform(...)
// so `.omit()` is unavailable on it. AppProfileBodyFields is the
// version-agnostic base that both branches extend; omit id/createdAt/
// updatedAt for the writable subset (version is not on the base).
const ProfileWritableSchema = AppProfileBodyFields.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const ProfileCreateBodySchema = ProfileWritableSchema.extend({
  id: z.string().min(1).optional(),
})

export const ProfileUpdateBodySchema = ProfileWritableSchema.partial().extend({
  expectedVersion: z.number().int().nonnegative(),
})

export type ProfileCreateBody = z.infer<typeof ProfileCreateBodySchema>
export type ProfileUpdateBody = z.infer<typeof ProfileUpdateBodySchema>
