// Phase 1 stub routes — empty after Phase 3 Step 6. File kept so tests +
// future domains still have a mount point; STUB_DOMAINS is now [] which
// means `createStubsRoute()` is effectively a no-op Hono subapp. Leaving
// the surface area intact makes re-enabling domains in later phases a
// one-entry edit instead of a full restructure.

import { Hono } from "hono"
import { NotImplementedError } from "@/core/shared/errors"

export const STUB_DOMAINS: readonly string[] = []

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
