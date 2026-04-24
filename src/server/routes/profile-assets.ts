// BOOTSTRAP-PHASE3 Step 6 — /api/profile-assets (GET file, DELETE) +
// POST /api/profiles/:id/upload-asset (multipart upload).
//
// Two subapps exported: caller mounts `createProfileAssetsRoute()` at
// /api/profile-assets and `createProfileUploadAssetRoute()` at /api/profiles
// so the upload endpoint path matches PLAN §6.4 (`POST /api/profiles/:id/
// upload-asset`) while the storage + file-serve code lives in this module.
//
// Session #14 Q3 (kind via form field) + Q4 (expectedVersion guard BEFORE
// file write) — upload order: parse multipart → validate kind/expectedVersion
// → load profile → version check → write file → insert row → mutate profile.
// Failures before the file write leave no orphan; failures between file
// write and DB insert orphan a file (acceptable for v1 — sweep later).

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { extname, resolve } from "node:path"
import { Hono } from "hono"
import { z } from "zod"
import { shortId } from "@/core/shared/id"
import { NotFoundError } from "@/core/shared/errors"
import { getProfileAssetsRepo } from "@/server/asset-store/context"
import {
  parseMultipartUpload,
  type AllowedUploadMime,
} from "@/server/middleware/multipart"
import { saveProfile, tryLoadProfile } from "@/server/profile-repo"

function defaultProfileAssetsDir(): string {
  return (
    process.env.IMAGES_GEN_ART_PROFILE_ASSETS_DIR ??
    resolve(process.cwd(), "data", "profile-assets")
  )
}

const KindSchema = z.enum(["logo", "badge", "screenshot"])
type AssetKind = z.infer<typeof KindSchema>

const UploadFieldsSchema = z.object({
  kind: KindSchema,
  expectedVersion: z.coerce.number().int().nonnegative(),
})

function extFromMime(mime: AllowedUploadMime): string {
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  return "webp"
}

function mimeFromExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  return "image/png"
}

function applyKindToProfile(
  existing: ReturnType<typeof tryLoadProfile>,
  kind: AssetKind,
  assetId: string,
) {
  if (!existing) throw new Error("applyKindToProfile: profile null")
  const assets = existing.assets
  if (kind === "logo") return { ...existing, assets: { ...assets, appLogoAssetId: assetId } }
  if (kind === "badge") return { ...existing, assets: { ...assets, storeBadgeAssetId: assetId } }
  return {
    ...existing,
    assets: {
      ...assets,
      screenshotAssetIds: [...assets.screenshotAssetIds, assetId],
    },
  }
}

export function createProfileAssetsRoute(): Hono {
  const route = new Hono()

  route.get("/:id/file", (c) => {
    const id = c.req.param("id")
    const row = getProfileAssetsRepo().findById(id)
    if (!row) throw new NotFoundError(`Profile asset '${id}' not found`, { assetId: id })
    if (!existsSync(row.filePath)) {
      throw new NotFoundError(`Profile asset '${id}' file missing on disk`, {
        assetId: id,
        integrity: "db_row_without_file",
      })
    }
    const bytes = readFileSync(row.filePath)
    const stat = statSync(row.filePath)
    c.header("Content-Type", row.mimeType || mimeFromExt(row.filePath))
    c.header("Content-Length", String(stat.size))
    return c.body(bytes)
  })

  route.delete("/:id", (c) => {
    const id = c.req.param("id")
    const row = getProfileAssetsRepo().findById(id)
    if (!row) return c.json({ error: "PROFILE_ASSET_NOT_FOUND", assetId: id }, 404)
    if (existsSync(row.filePath)) rmSync(row.filePath, { force: true })
    getProfileAssetsRepo().delete(id)
    return c.body(null, 204)
  })

  return route
}

export function createProfileUploadAssetRoute(): Hono {
  const route = new Hono()

  route.post("/:id/upload-asset", async (c) => {
    const profileId = c.req.param("id")

    const parsed = await parseMultipartUpload(c)
    if (!parsed.ok) return parsed.response

    const fieldsResult = UploadFieldsSchema.safeParse(parsed.data.fields)
    if (!fieldsResult.success) {
      return c.json(
        {
          error: "BAD_REQUEST",
          message: "Invalid upload fields (need 'kind' + 'expectedVersion')",
          issues: fieldsResult.error.issues,
        },
        400,
      )
    }
    const { kind, expectedVersion } = fieldsResult.data

    const existing = tryLoadProfile(profileId)
    if (!existing) {
      throw new NotFoundError(`Profile '${profileId}' not found`, { profileId })
    }
    if (existing.version !== expectedVersion) {
      // DECISIONS §F.3.1 — augmented body (code + details) mirrors
      // profiles.ts PUT 409 so the client ApiError envelope carries
      // currentVersion/expectedVersion through to preserve-edits UI.
      const message = `Profile '${profileId}' has been modified. Expected version ${expectedVersion}, current version ${existing.version}. Refetch and retry.`
      return c.json(
        {
          error: "VERSION_CONFLICT",
          code: "VERSION_CONFLICT",
          message,
          currentVersion: existing.version,
          expectedVersion,
          details: {
            currentVersion: existing.version,
            expectedVersion,
          },
        },
        409,
      )
    }

    // Step 1: file + DB insert (orphan risk minimized — version already cleared)
    const assetId = shortId("pa", 10)
    const ext = extFromMime(parsed.data.file.mimeType)
    const assetsDir = defaultProfileAssetsDir()
    const fileDir = resolve(assetsDir, profileId)
    const filePath = resolve(fileDir, `${assetId}.${ext}`)
    mkdirSync(fileDir, { recursive: true })
    writeFileSync(filePath, Buffer.from(parsed.data.file.bytes))

    getProfileAssetsRepo().insert({
      id: assetId,
      profileId,
      kind,
      filePath,
      mimeType: parsed.data.file.mimeType,
      fileSizeBytes: parsed.data.file.size,
    })

    // Step 2: mutate + save profile (touches updatedAt; version NOT
    // bumped — DECISIONS §F.3 keeps upload mutations out of the OC
    // counter so multi-asset workflows don't force a refetch-per-
    // upload. Only PUT /api/profiles/:id bumps the version.)
    const mutated = applyKindToProfile(existing, kind, assetId)
    saveProfile(mutated, { touchUpdatedAt: true })

    return c.json({ assetId, kind, profileId }, 201)
  })

  return route
}
