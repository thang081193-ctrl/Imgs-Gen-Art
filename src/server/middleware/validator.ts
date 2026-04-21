// Zod body validator factory. Returns a Hono middleware that parses JSON body,
// validates via schema, and stashes parsed data on context under "validatedBody".
// ZodError bubbles up to errorHandler → 400 BAD_REQUEST with issues.
// Route handler retrieves via c.get("validatedBody") with its own type cast.

import type { MiddlewareHandler } from "hono"
import type { ZodSchema } from "zod"
import { BadRequestError } from "@/core/shared/errors"

export function validateBody<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      throw new BadRequestError("Invalid JSON body")
    }
    const parsed = schema.parse(raw)
    c.set("validatedBody", parsed)
    await next()
  }
}
