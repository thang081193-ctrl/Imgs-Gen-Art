// Phase 1 stub routes — 7 domains that respond 501 NOT_IMPLEMENTED.
// Each will be replaced by a real route file (e.g. routes/profiles.ts) when
// the corresponding phase lands: profiles/assets/profile-assets = Phase 3+5,
// keys = Phase 4, workflows/workflow-runs = Phase 3, templates = Phase 2+5.

import { Hono } from "hono"
import { NotImplementedError } from "@/core/shared/errors"

export const STUB_DOMAINS: readonly string[] = [
  "profiles",
  "assets",
  "keys",
  "workflows",
  "templates",
  "profile-assets",
  "workflow-runs",
]

export function createStubsRoute(): Hono {
  const route = new Hono()
  for (const domain of STUB_DOMAINS) {
    const handler = (): never => {
      throw new NotImplementedError(`Endpoint /api/${domain} not implemented in Phase 1`)
    }
    route.all(`/${domain}`, handler)
    route.all(`/${domain}/*`, handler)
  }
  return route
}
