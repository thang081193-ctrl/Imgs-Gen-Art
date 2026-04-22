// Session #14 Q1/Q2 — central multipart upload helper.
//
// Single source of truth for size + MIME validation so every upload route
// (profile-asset logo/badge/screenshot, future Vertex JSON) emits the same
// error shape. Uses Web standard FormData (fetch layer) rather than Hono
// c.req.parseBody() — keeps the helper callable from any Request-shaped
// input and avoids coupling to Hono's body cache behaviour.
//
// Error shape is flat per Step 5 VERSION_CONFLICT precedent — bypasses the
// errorHandler envelope so client can read `allowed`/`received` without
// unwrapping `details`:
//   400 BAD_MULTIPART         — malformed / missing file field
//   413 PAYLOAD_TOO_LARGE     — file > MAX_UPLOAD_BYTES
//   415 UNSUPPORTED_MEDIA     — MIME not in ALLOWED_UPLOAD_MIME

import type { Context } from "hono"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ALLOWED_UPLOAD_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const
export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number]

export interface MultipartFile {
  filename: string
  mimeType: AllowedUploadMime
  bytes: Uint8Array
  size: number
}

export interface MultipartFields {
  file: MultipartFile
  fields: Record<string, string>
}

export type MultipartResult =
  | { ok: true; data: MultipartFields }
  | { ok: false; response: Response }

export interface MultipartOptions {
  allowedMimeTypes?: readonly string[]
  maxBytes?: number
  fileField?: string
}

export async function parseMultipartUpload(
  c: Context,
  opts: MultipartOptions = {},
): Promise<MultipartResult> {
  const allowed = opts.allowedMimeTypes ?? ALLOWED_UPLOAD_MIME
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES
  const fileField = opts.fileField ?? "file"

  let form: FormData
  try {
    form = await c.req.raw.formData()
  } catch {
    return badRequest(c, "Invalid or missing multipart/form-data body")
  }

  const fileEntry = form.get(fileField)
  if (!(fileEntry instanceof File)) {
    return badRequest(c, `Missing file field '${fileField}' in multipart body`)
  }

  if (!allowed.includes(fileEntry.type)) {
    return {
      ok: false,
      response: c.json(
        {
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: `File mime '${fileEntry.type}' is not allowed`,
          allowed: [...allowed],
          received: fileEntry.type,
        },
        415,
      ),
    }
  }

  if (fileEntry.size > maxBytes) {
    return {
      ok: false,
      response: c.json(
        {
          error: "PAYLOAD_TOO_LARGE",
          message: `File size ${fileEntry.size} exceeds maximum ${maxBytes}`,
          maxBytes,
          received: fileEntry.size,
        },
        413,
      ),
    }
  }

  const fields: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (key === fileField) continue
    if (typeof value === "string") fields[key] = value
  }

  const bytes = new Uint8Array(await fileEntry.arrayBuffer())

  return {
    ok: true,
    data: {
      file: {
        filename: fileEntry.name,
        mimeType: fileEntry.type as AllowedUploadMime,
        bytes,
        size: fileEntry.size,
      },
      fields,
    },
  }
}

function badRequest(c: Context, message: string): MultipartResult {
  return {
    ok: false,
    response: c.json({ error: "BAD_MULTIPART", message }, 400),
  }
}
