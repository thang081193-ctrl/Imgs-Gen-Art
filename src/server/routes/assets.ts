// BOOTSTRAP-PHASE3 Step 6 — /api/assets read + file + delete.
//
// Session #14 Q5 — POST /:id/replay NOT registered (Phase 5 scope).
// Unregistered path → Hono default 404.
//
// `toAssetDetailDto` (with ReplayPayloadDto) is deferred from Phase 1 per
// PHASE-STATUS. For `?include=replayPayload` we attach `replayPayload:
// null` as a placeholder so the wire shape is stable for clients; the real
// build pairs template IDs + a frozen ProfileDto snapshot, which lands in
// Phase 5 alongside the Replay UI.
//
// File stream: reads from AssetInternal.filePath (Rule 11 — internal), sets
// Content-Type from the asset's `mimeType`-equivalent (always image/png
// today — Mock writes PNGs; real providers in Phase 4 may emit jpeg via
// GenerateResult.mimeType, so we derive from file extension with a PNG
// fallback until mime-type persists in the DB).

import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { extname } from "node:path"
import { Hono } from "hono"
import type { AssetDto } from "@/core/dto/asset-dto"
import { NotFoundError } from "@/core/shared/errors"
import { getAssetRepo, toAssetDto } from "@/server/asset-store"
import type { AssetInternal } from "@/server/asset-store"
import { AssetListFilterSchema } from "@/core/schemas/asset-list-filter"
import { parseIncludeParam } from "./assets.body"

function mimeTypeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  return "image/png"
}

// Keep `?include=` out of the filter schema — it's a projection flag, not a
// list filter. Everything else flows through AssetListFilterSchema.strict().
const FILTER_EXCLUDED_KEYS = new Set(["include"])

function collectFilterQuery(c: { req: { query: () => Record<string, string> } }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(c.req.query())) {
    if (FILTER_EXCLUDED_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

export function createAssetsRoute(): Hono {
  const route = new Hono()

  route.get("/", (c) => {
    const parsed = AssetListFilterSchema.safeParse(collectFilterQuery(c))
    if (!parsed.success) {
      return c.json(
        { error: "BAD_REQUEST", message: "Invalid query", issues: parsed.error.issues },
        400,
      )
    }
    const filter = parsed.data
    const rows = getAssetRepo().list(filter)
    const assets = rows.map(toAssetDto)
    return c.json({ assets, limit: filter.limit, offset: filter.offset ?? 0 })
  })

  route.get("/:id", (c) => {
    const id = c.req.param("id")
    const asset = getAssetRepo().findById(id)
    if (!asset) throw new NotFoundError(`Asset '${id}' not found`, { assetId: id })

    let include: Set<string>
    try {
      include = parseIncludeParam(c.req.query("include"))
    } catch {
      return c.json(
        { error: "BAD_REQUEST", message: "Invalid ?include= option", allowed: ["replayPayload"] },
        400,
      )
    }

    const base: AssetDto = toAssetDto(asset)
    if (include.has("replayPayload")) {
      // Phase 5 will build a full ReplayPayloadDto from the stored JSON +
      // a frozen profile snapshot. For Phase 3 we expose the shape with
      // null so clients can code against the final contract today.
      return c.json({ ...base, replayPayload: null })
    }
    return c.json(base)
  })

  route.get("/:id/file", (c) => {
    const id = c.req.param("id")
    const asset: AssetInternal | null = getAssetRepo().findById(id)
    if (!asset) throw new NotFoundError(`Asset '${id}' not found`, { assetId: id })
    if (!existsSync(asset.filePath)) {
      // Integrity warning — DB row exists but file is gone.
      throw new NotFoundError(`Asset '${id}' file not present on disk`, {
        assetId: id,
        integrity: "db_row_without_file",
      })
    }
    const bytes = readFileSync(asset.filePath)
    const stat = statSync(asset.filePath)
    c.header("Content-Type", mimeTypeFromPath(asset.filePath))
    c.header("Content-Length", String(stat.size))
    return c.body(bytes)
  })

  route.delete("/:id", (c) => {
    const id = c.req.param("id")
    const asset = getAssetRepo().findById(id)
    if (!asset) return c.json({ error: "ASSET_NOT_FOUND", assetId: id }, 404)

    // Best-effort: unlink file first; row delete happens even if file was
    // already missing (orphan DB row cleanup is also the intent here).
    if (existsSync(asset.filePath)) {
      rmSync(asset.filePath, { force: true })
    }
    getAssetRepo().deleteById(id)
    return c.body(null, 204)
  })

  return route
}
