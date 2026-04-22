// Phase 1 stub routes — remaining domains that still respond 501 NOT_IMPLEMENTED.
// Each will be replaced by a real route file when the corresponding phase
// lands: profiles/assets/profile-assets = Phase 3 Steps 5-6, keys = Phase 4,
// templates = Phase 2+5. workflows + workflow-runs shipped in Phase 3 Step 4.

import { Hono } from "hono"
import { NotImplementedError } from "@/core/shared/errors"

export const STUB_DOMAINS: readonly string[] = [
  "profiles",
  "assets",
  "keys",
  "templates",
  "profile-assets",
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
