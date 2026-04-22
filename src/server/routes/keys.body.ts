// BOOTSTRAP-PHASE3 Step 6 — Zod schemas for /api/keys.
//
// Gemini create = JSON body (single field `key` + label). Vertex create =
// multipart form (serviceAccount file + projectId/location fields) — the
// multipart route validates `fields` via VertexFieldsSchema after the
// upload helper hands control back. Test endpoint body is flexible:
// optional modelId override.

import { z } from "zod"

export const GeminiCreateBodySchema = z.object({
  provider: z.literal("gemini"),
  label: z.string().min(1).max(200),
  key: z.string().min(1),
})

export const VertexFieldsSchema = z.object({
  label: z.string().min(1).max(200),
  projectId: z.string().min(1),
  location: z.string().min(1),
})

export const KeyTestBodySchema = z
  .object({
    modelId: z.string().min(1).optional(),
  })
  .passthrough()

export type GeminiCreateBody = z.infer<typeof GeminiCreateBodySchema>
export type VertexFields = z.infer<typeof VertexFieldsSchema>
export type KeyTestBody = z.infer<typeof KeyTestBodySchema>
