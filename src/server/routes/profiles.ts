// BOOTSTRAP-PHASE3 Step 5 — /api/profiles CRUD.
//
// Storage: JSON-file-per-profile under data/profiles/{id}.json (loader/saver
// in src/server/profile-repo). Route layer maps AppProfile → ProfileDto /
// ProfileSummaryDto so asset IDs become `/api/profile-assets/{id}/file` URLs
// and no disk paths ever leak (Rule 11).
//
// Session #13 Q1 — Version conflict 409 shape (flat, not nested in `details`):
//   { error: "VERSION_CONFLICT", message, currentVersion, expectedVersion }
// Matches workflow-runs DELETE precedent `{ error, currentStatus }`. Uses
// c.json() direct return instead of throwing VersionConflictError so the
// errorHandler envelope `{ code, message, details }` is bypassed.
//
// Session #13 Q2 — DELETE guard: 409 PROFILE_HAS_ASSETS when
// assetRepo.countByProfile > 0 (hard unlink requires caller to clear assets
// first, per PLAN §7.1 hard-delete semantics).
//
// Session #13 Q3 — POST /:id/upload-asset NOT registered in Step 5.
// Genuine 404 via Hono default; Step 6 (profile-assets module) ships it.

import { Hono } from "hono"
import { shortId, slugify } from "@/core/shared/id"
import { AppProfileSchema, type AppProfile } from "@/core/schemas/app-profile"
import { getAssetRepo } from "@/server/asset-store/context"
import { validateBody } from "@/server/middleware/validator"
import {
  deleteProfile,
  listProfiles,
  saveProfile,
  toProfileDto,
  toProfileSummaryDto,
  tryLoadProfile,
} from "@/server/profile-repo"
import { BadRequestError, NotFoundError } from "@/core/shared/errors"
import {
  ProfileCreateBodySchema,
  ProfileUpdateBodySchema,
  type ProfileCreateBody,
  type ProfileUpdateBody,
} from "./profiles.body"

type ProfilesEnv = {
  Variables: {
    validatedBody: ProfileCreateBody | ProfileUpdateBody
  }
}

function resolveProfileId(body: ProfileCreateBody): string {
  const fromBody = body.id?.trim()
  if (fromBody) return fromBody
  const slug = slugify(body.name)
  return slug || shortId("profile", 8)
}

function buildCreated(body: ProfileCreateBody): AppProfile {
  const now = new Date().toISOString()
  return AppProfileSchema.parse({
    version: 1,
    id: resolveProfileId(body),
    name: body.name,
    tagline: body.tagline,
    category: body.category,
    assets: body.assets,
    visual: body.visual,
    positioning: body.positioning,
    context: body.context,
    createdAt: now,
    updatedAt: now,
  })
}

function mergeUpdate(existing: AppProfile, patch: ProfileUpdateBody): AppProfile {
  return {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.assets !== undefined ? { assets: patch.assets } : {}),
    ...(patch.visual !== undefined ? { visual: patch.visual } : {}),
    ...(patch.positioning !== undefined ? { positioning: patch.positioning } : {}),
    ...(patch.context !== undefined ? { context: patch.context } : {}),
  }
}

export function createProfilesRoute(): Hono<ProfilesEnv> {
  const route = new Hono<ProfilesEnv>()

  route.get("/", (c) => {
    const profiles = listProfiles().map(toProfileSummaryDto)
    return c.json({ profiles })
  })

  route.get("/:id", (c) => {
    const id = c.req.param("id")
    const profile = tryLoadProfile(id)
    if (!profile) throw new NotFoundError(`Profile '${id}' not found`, { profileId: id })
    return c.json(toProfileDto(profile))
  })

  route.post("/", validateBody(ProfileCreateBodySchema), (c) => {
    const body = c.get("validatedBody") as ProfileCreateBody
    const created = buildCreated(body)
    if (tryLoadProfile(created.id)) {
      throw new BadRequestError(`Profile '${created.id}' already exists`, {
        profileId: created.id,
      })
    }
    const saved = saveProfile(created, { touchUpdatedAt: false })
    return c.json(toProfileDto(saved), 201)
  })

  route.put("/:id", validateBody(ProfileUpdateBodySchema), (c) => {
    const id = c.req.param("id")
    const body = c.get("validatedBody") as ProfileUpdateBody
    const existing = tryLoadProfile(id)
    if (!existing) throw new NotFoundError(`Profile '${id}' not found`, { profileId: id })

    if (existing.version !== body.expectedVersion) {
      // DECISIONS §F.3.1 — augmented body: legacy flat fields retained
      // for back-compat; `code` + `details` added so client ApiError
      // envelope flows the conflict info through to preserve-edits UI.
      const message = `Profile '${id}' has been modified. Expected version ${body.expectedVersion}, current version ${existing.version}. Refetch and retry.`
      return c.json(
        {
          error: "VERSION_CONFLICT",
          code: "VERSION_CONFLICT",
          message,
          currentVersion: existing.version,
          expectedVersion: body.expectedVersion,
          details: {
            currentVersion: existing.version,
            expectedVersion: body.expectedVersion,
          },
        },
        409,
      )
    }

    // DECISIONS §F.3 — version bump lives in the route, not saver.
    // saveProfile stays storage-neutral; PUT increments by 1 on success.
    const next: AppProfile = { ...mergeUpdate(existing, body), version: existing.version + 1 }
    const saved = saveProfile(next, { touchUpdatedAt: true })
    return c.json(toProfileDto(saved))
  })

  route.delete("/:id", (c) => {
    const id = c.req.param("id")
    const existing = tryLoadProfile(id)
    if (!existing) return c.json({ error: "PROFILE_NOT_FOUND" }, 404)

    const assetCount = getAssetRepo().countByProfile(id)
    if (assetCount > 0) {
      return c.json(
        {
          error: "PROFILE_HAS_ASSETS",
          message: `Cannot delete profile '${id}': ${assetCount} asset(s) exist. Delete assets first.`,
          profileId: id,
          assetCount,
        },
        409,
      )
    }

    deleteProfile(id)
    return c.body(null, 204)
  })

  return route
}
