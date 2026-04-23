// Hono onError adapter. Maps AppError → status; ZodError → 400; everything else → 500.
// JSON body shape: { code, message, details? }.

import type { ErrorHandler } from "hono"
import { ZodError } from "zod"
import { AppError } from "@/core/shared/errors"
import { createLogger } from "@/core/shared/logger"

const logger = createLogger()

interface ErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId") as string | undefined

  if (err instanceof AppError) {
    const body: ErrorBody = {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    }
    // Log only genuine internal failures (500). 501 NOT_IMPLEMENTED + other
    // 4xx/5xx are client-facing known states; logging them is noise.
    if (err.status === 500) {
      logger.error("internal error", {
        requestId,
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      })
    }
    return c.json(body, err.status as 400 | 401 | 404 | 409 | 410 | 422 | 500 | 501 | 502)
  }

  if (err instanceof ZodError) {
    const body: ErrorBody = {
      code: "BAD_REQUEST",
      message: "Request validation failed",
      details: { issues: err.issues },
    }
    return c.json(body, 400)
  }

  logger.error("unhandled error", {
    requestId,
    message: err.message,
    ...(err.stack ? { stack: err.stack } : {}),
  })
  const body: ErrorBody = {
    code: "INTERNAL",
    message: "Internal server error",
  }
  return c.json(body, 500)
}
