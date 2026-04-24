// Session #32 F4 — GET /api/tags autocomplete/distinct endpoint.
//
// Path chosen flat ("/api/tags") per Q-32.C future-proofing: tags will grow
// into a first-class resource when DECISIONS §C1 trigger trips (real tags
// table + asset_tags JOIN). v1 response shape stays minimal ({tag, count})
// matching current JSON-column storage; enrichment fields (id/color/
// createdAt) land additively when the schema migration ships.

import { Hono } from "hono"
import { z } from "zod"
import { getAssetRepo } from "@/server/asset-store"

const TagsQuerySchema = z.object({
  q: z.string().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export function createTagsRoute(): Hono {
  const route = new Hono()

  route.get("/", (c) => {
    const parsed = TagsQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json(
        { error: "BAD_REQUEST", message: "Invalid query", issues: parsed.error.issues },
        400,
      )
    }
    const result = getAssetRepo().listTags(parsed.data)
    return c.json(result)
  })

  return route
}
