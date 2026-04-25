// GET /api/health — liveness probe. Returns { status, version, uptimeMs,
// lastGenAt }. Version injected at boot (read from package.json once in
// app factory). `lastGenAt` is the ISO timestamp of the most recent
// row in `assets` (S#38 Q-38.C — feeds AppHeader version strip "last
// gen 5m ago"); null when no assets exist or asset-store isn't bound
// (test contexts that mount the app without initAssetStore — health
// stays a green liveness probe regardless of subsystem state).

import { Hono } from "hono"
import { getAssetRepo } from "@/server/asset-store"

export interface HealthBody {
  status: "ok"
  version: string
  uptimeMs: number
  lastGenAt: string | null
}

function readLastGenAt(): string | null {
  try {
    return getAssetRepo().findMostRecentCreatedAt()
  } catch (err) {
    // Singleton not bound (asset store uninitialized): only surface in
    // test contexts that exercise routes without booting the DB. A real
    // SQL failure has a different error shape and is rethrown.
    if (err instanceof Error && err.message.includes("not initialized")) return null
    throw err
  }
}

export function createHealthRoute(version: string): Hono {
  const route = new Hono()
  route.get("/", (c) => {
    const body: HealthBody = {
      status: "ok",
      version,
      uptimeMs: Math.floor(process.uptime() * 1000),
      lastGenAt: readLastGenAt(),
    }
    return c.json(body)
  })
  return route
}
