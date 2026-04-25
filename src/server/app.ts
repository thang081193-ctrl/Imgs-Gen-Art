// Hono app factory — wires middleware + routes. Kept pure (no I/O at construct
// time) so integration tests can mount it in-process. Boot entry (index.ts)
// adds DB migration + listener on top.

import { Hono } from "hono"
import { dtoFilter } from "./middleware/dto-filter"
import { errorHandler } from "./middleware/error-handler"
import { requestLogger } from "./middleware/logger"
import { createAssetsRoute } from "./routes/assets"
import { createDebugRoute } from "./routes/debug"
import { createHealthRoute } from "./routes/health"
import { createKeysRoute } from "./routes/keys"
import {
  createProfileAssetsRoute,
  createProfileUploadAssetRoute,
} from "./routes/profile-assets"
import { createProfilesRoute } from "./routes/profiles"
import { createPromptAssistRoute } from "./routes/prompt-assist"
import { createPromptHistoryRoute } from "./routes/prompt-history"
import { createProvidersRoute } from "./routes/providers"
import { createPolicyRulesRoute } from "./routes/policy-rules"
import { createReplayRoute } from "./routes/replay"
import { createSavedStylesRoute } from "./routes/saved-styles"
import { createStubsRoute } from "./routes/stubs"
import { createTagsRoute } from "./routes/tags"
import { createTemplatesRoute } from "./routes/templates"
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
  // Upload-asset subapp mounted FIRST so POST /:id/upload-asset registers
  // before the main profiles subapp claims /:id/* catch-all shapes.
  app.route("/api/profiles", createProfileUploadAssetRoute())
  app.route("/api/profiles", createProfilesRoute())
  app.route("/api/profile-assets", createProfileAssetsRoute())
  app.route("/api/templates", createTemplatesRoute())
  app.route("/api/keys", createKeysRoute())
  // Replay + prompt-history subapps registered FIRST under /api/assets so
  // their /:assetId/replay + /:assetId/replay-class + /:assetId/prompt-
  // history paths win over the base /:id handlers (same pattern as
  // workflow-runs before workflows).
  app.route("/api/assets", createReplayRoute())
  app.route("/api/assets", createPromptHistoryRoute())
  app.route("/api/assets", createAssetsRoute())
  app.route("/api/tags", createTagsRoute())
  app.route("/api/saved-styles", createSavedStylesRoute())
  app.route("/api/prompt-assist", createPromptAssistRoute())
  app.route("/api/policy-rules", createPolicyRulesRoute())
  app.route("/api/debug", createDebugRoute())
  // Workflow-runs mounted FIRST under /api/workflows/runs so its DELETE
  // /:batchId wins over the broader /api/workflows/:id/run route below.
  app.route("/api/workflows/runs", createWorkflowRunsRoute())
  app.route("/api/workflows", createWorkflowsRoute())
  app.route("/api", createStubsRoute())

  app.onError(errorHandler)

  return app
}
