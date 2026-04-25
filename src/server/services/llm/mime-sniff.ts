// Session #39 Phase B1 — image MIME detection from buffer magic bytes.
//
// LLM vision endpoints (xAI, OpenAI, Anthropic) accept `data:image/{mime};base64,
// {b64}` URLs in the chat-message content array. Caller passes a raw Buffer
// from multipart upload; we sniff the first 12 bytes and emit the data URL.
// Defaults to image/png if signature is unrecognised — most LLM vision APIs
// tolerate the lie for any reasonable raster format, and a wrong MIME never
// causes a security issue (only a worse decode result).
//
// Q-39.G: 6-line helper, no new dep.

const PNG = [0x89, 0x50, 0x4e, 0x47]
const JPEG = [0xff, 0xd8, 0xff]
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]
const GIF = [0x47, 0x49, 0x46, 0x38]

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false
  }
  return true
}

export function sniffImageMime(buf: Buffer): string {
  if (startsWith(buf, PNG)) return "image/png"
  if (startsWith(buf, JPEG)) return "image/jpeg"
  if (startsWith(buf, WEBP_RIFF) && startsWith(buf, WEBP_TAG, 8)) return "image/webp"
  if (startsWith(buf, GIF)) return "image/gif"
  return "image/png"
}

export function bufferToDataUrl(buf: Buffer): string {
  const mime = sniffImageMime(buf)
  return `data:${mime};base64,${buf.toString("base64")}`
}
