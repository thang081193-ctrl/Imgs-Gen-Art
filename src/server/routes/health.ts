// GET /api/health — liveness probe. Returns { status, version, uptimeMs }.
// Version injected at boot (read from package.json once in app factory).

import { Hono } from "hono"

export interface HealthBody {
  status: "ok"
  version: string
  uptimeMs: number
}

export function createHealthRoute(version: string): Hono {
  const route = new Hono()
  route.get("/", (c) => {
    const body: HealthBody = {
      status: "ok",
      version,
      uptimeMs: Math.floor(process.uptime() * 1000),
    }
    return c.json(body)
  })
  return route
}
