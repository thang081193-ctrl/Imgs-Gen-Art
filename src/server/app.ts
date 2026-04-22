// Hono app factory — wires middleware + routes. Kept pure (no I/O at construct
// time) so integration tests can mount it in-process. Boot entry (index.ts)
// adds DB migration + listener on top.

import { Hono } from "hono"
import { dtoFilter } from "./middleware/dto-filter"
import { errorHandler } from "./middleware/error-handler"
import { requestLogger } from "./middleware/logger"
import { createDebugRoute } from "./routes/debug"
import { createHealthRoute } from "./routes/health"
import { createProvidersRoute } from "./routes/providers"
import { createStubsRoute } from "./routes/stubs"
import { createWorkflowRunsRoute } from "./routes/workflow-runs"
import { createWorkflowsRoute } from "./routes/workflows"

export interface AppConfig {
  version: string
}

export function createApp(config: AppConfig): Hono {
  const app = new Hono()

  // Middleware (order matters): requestId first, then response scanner, then routes.
  // onError is registered last but catches from any middleware + handler.
  app.use("*", requestLogger)
  app.use("*", dtoFilter)

  app.route("/api/health", createHealthRoute(config.version))
  app.route("/api/providers", createProvidersRoute())
  app.route("/api/debug", createDebugRoute())
  // Workflow-runs mounted FIRST under /api/workflows/runs so its DELETE
  // /:batchId wins over the broader /api/workflows/:id/run route below.
  app.route("/api/workflows/runs", createWorkflowRunsRoute())
  app.route("/api/workflows", createWorkflowsRoute())
  app.route("/api", createStubsRoute())

  app.onError(errorHandler)

  return app
}
