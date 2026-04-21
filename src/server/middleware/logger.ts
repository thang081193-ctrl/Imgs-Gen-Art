// Hono request-logger middleware. Generates requestId (UUID), stores on context,
// echoes in X-Request-Id response header, logs method/path/status/durationMs via
// core logger (which redacts AIza/ya29/JWT). Never uses console.log (Rule 9).

import type { MiddlewareHandler } from "hono"
import { createLogger } from "@/core/shared/logger"

const logger = createLogger()

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = globalThis.crypto.randomUUID()
  c.set("requestId", requestId)
  c.header("X-Request-Id", requestId)

  const start = Date.now()
  await next()
  const durationMs = Date.now() - start

  logger.info("request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  })
}
