// Dev-mode defense-in-depth: recursively scan JSON response bodies for banned
// internal keys (file_path, serviceAccountPath, keyEncrypted, snake + camel).
// If found → logger.error + throw INTERNAL. Skipped in production (perf).
// Rule 11 — no paths or ciphertext in API responses.

import type { MiddlewareHandler } from "hono"
import { AppError } from "@/core/shared/errors"
import { createLogger } from "@/core/shared/logger"

const logger = createLogger()

const BANNED_KEYS: ReadonlySet<string> = new Set([
  "file_path",
  "filePath",
  "service_account_path",
  "serviceAccountPath",
  "key_encrypted",
  "keyEncrypted",
])

function findBannedKey(node: unknown, path = "$"): string | null {
  if (node === null || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = findBannedKey(node[i], `${path}[${i}]`)
      if (found !== null) return found
    }
    return null
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (BANNED_KEYS.has(key)) return `${path}.${key}`
    const found = findBannedKey(value, `${path}.${key}`)
    if (found !== null) return found
  }
  return null
}

export const dtoFilter: MiddlewareHandler = async (c, next) => {
  await next()

  if (process.env["NODE_ENV"] === "production") return

  const contentType = c.res.headers.get("Content-Type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) return

  let body: unknown
  try {
    body = await c.res.clone().json()
  } catch {
    return
  }

  const bannedPath = findBannedKey(body)
  if (bannedPath === null) return

  const requestId = c.get("requestId") as string | undefined
  logger.error("DTO leak detected — response contained banned key", {
    requestId,
    path: bannedPath,
    route: c.req.path,
  })
  throw new AppError(
    "INTERNAL",
    `DTO leak: response contained banned key at ${bannedPath}`,
    500,
  )
}
