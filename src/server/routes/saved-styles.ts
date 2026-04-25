// Session #37 Phase A1 (PLAN-v3 §6) — /api/saved-styles CRUD.
//
// REST surface for the home shelf + future wizard saved-style picker. List
// supports an optional `?lane=ads|aso` (or exact `?lane=ads.meta`) filter
// applied at the repo layer. Mutations are blocked on `preset-legacy` rows
// — the 3 seeded presets are read-only audit anchors. Block returns 403
// PRESET_LOCKED so the client can surface a precise error vs a generic 400.
//
// Mount: `app.route("/api/saved-styles", createSavedStylesRoute())`. No
// path-collision concerns — this subapp owns the whole namespace.

import { Hono } from "hono"

import { shortId } from "@/core/shared/id"
import { BadRequestError, NotFoundError } from "@/core/shared/errors"
import type { SavedStyleKind } from "@/core/dto/saved-style-dto"
import { getSavedStylesRepo } from "@/server/asset-store"
import type { SavedStyleUpdatePatch } from "@/server/saved-styles/saved-styles-repo"
import { validateBody } from "@/server/middleware/validator"
import {
  SavedStyleCreateBodySchema,
  SavedStyleUpdateBodySchema,
  type SavedStyleCreateBody,
  type SavedStyleUpdateBody,
} from "./saved-styles.body"

type SavedStylesEnv = {
  Variables: { validatedBody: SavedStyleCreateBody | SavedStyleUpdateBody }
}

function presetLockedResponse(c: { json: (body: unknown, status: 403) => Response }, id: string, action: string): Response {
  return c.json(
    {
      error: "PRESET_LOCKED",
      code: "PRESET_LOCKED",
      message: `Cannot ${action} preset-legacy saved style '${id}'. Presets are read-only.`,
      savedStyleId: id,
    },
    403,
  )
}

export function createSavedStylesRoute(): Hono<SavedStylesEnv> {
  const route = new Hono<SavedStylesEnv>()

  route.get("/", (c) => {
    const lane = c.req.query("lane")?.trim()
    const kindParam = c.req.query("kind")?.trim()
    const kind: SavedStyleKind | undefined =
      kindParam === "preset-legacy" || kindParam === "user" ? kindParam : undefined
    if (kindParam && !kind) {
      throw new BadRequestError(`Invalid 'kind' filter '${kindParam}'`, { kind: kindParam })
    }
    const styles = getSavedStylesRepo().list({
      ...(lane ? { lane } : {}),
      ...(kind ? { kind } : {}),
    })
    return c.json({ styles })
  })

  route.get("/:id", (c) => {
    const id = c.req.param("id")
    const style = getSavedStylesRepo().findById(id)
    if (!style) {
      throw new NotFoundError(`Saved style '${id}' not found`, { savedStyleId: id })
    }
    return c.json(style)
  })

  route.post("/", validateBody(SavedStyleCreateBodySchema), (c) => {
    const body = c.get("validatedBody") as SavedStyleCreateBody
    const repo = getSavedStylesRepo()
    if (repo.findBySlug(body.slug)) {
      throw new BadRequestError(`Saved style slug '${body.slug}' already exists`, {
        slug: body.slug,
      })
    }
    const now = new Date().toISOString()
    const created = repo.insert({
      id: shortId("style", 8),
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      kind: "user",
      promptTemplate: body.promptTemplate,
      previewAssetId: body.previewAssetId ?? null,
      lanes: body.lanes,
      createdAt: now,
      updatedAt: now,
    })
    return c.json(created, 201)
  })

  route.patch("/:id", validateBody(SavedStyleUpdateBodySchema), (c) => {
    const id = c.req.param("id")
    const repo = getSavedStylesRepo()
    const existing = repo.findById(id)
    if (!existing) {
      throw new NotFoundError(`Saved style '${id}' not found`, { savedStyleId: id })
    }
    if (existing.kind === "preset-legacy") {
      return presetLockedResponse(c, id, "edit")
    }
    const body = c.get("validatedBody") as SavedStyleUpdateBody
    const patch: SavedStyleUpdatePatch = {}
    if (body.name !== undefined) patch.name = body.name
    if (Object.prototype.hasOwnProperty.call(body, "description")) patch.description = body.description ?? null
    if (body.promptTemplate !== undefined) patch.promptTemplate = body.promptTemplate
    if (Object.prototype.hasOwnProperty.call(body, "previewAssetId")) patch.previewAssetId = body.previewAssetId ?? null
    if (body.lanes !== undefined) patch.lanes = body.lanes
    const updated = repo.update(id, patch)
    return c.json(updated)
  })

  route.delete("/:id", (c) => {
    const id = c.req.param("id")
    const repo = getSavedStylesRepo()
    const existing = repo.findById(id)
    if (!existing) return c.json({ error: "NOT_FOUND" }, 404)
    if (existing.kind === "preset-legacy") {
      return presetLockedResponse(c, id, "delete")
    }
    repo.delete(id)
    return c.body(null, 204)
  })

  return route
}
