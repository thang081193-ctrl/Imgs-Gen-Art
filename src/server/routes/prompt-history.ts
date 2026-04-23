// Phase 5 Step 5b (Session #27b) — GET /api/assets/:assetId/prompt-history.
//
// Returns the edit-and-replay log for a single source asset, ordered by
// createdAt DESC. Used by the PromptLab sidebar to show prior iterations.
//
// 404 on unknown source asset so the client can distinguish "this asset
// doesn't exist" from "this asset exists but has no edits yet" (empty
// array is a meaningful signal for new assets).
//
// Mount order: before `/api/assets` main route so `/:assetId/prompt-history`
// wins over the base `/:id`. Same pattern as replay.ts.

import { Hono } from "hono"

import { NotFoundError } from "@/core/shared/errors"
import { getAssetRepo, getPromptHistoryRepo } from "@/server/asset-store"

export function createPromptHistoryRoute(): Hono {
  const route = new Hono()

  route.get("/:assetId/prompt-history", (c) => {
    const assetId = c.req.param("assetId")
    const asset = getAssetRepo().findById(assetId)
    if (!asset) {
      throw new NotFoundError(`Asset '${assetId}' not found`, { assetId })
    }
    const history = getPromptHistoryRepo().listByAsset(assetId)
    return c.json({ assetId, history })
  })

  return route
}
