// Lightweight ID + slug helpers. No Node crypto in src/core — use Web Crypto (universally available).

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

function randomBase62(length: number): string {
  const bytes = new Uint8Array(length)
  // globalThis.crypto is available in Node 20+ and browsers. Node's
  // @types/node exposes it via globalThis typing; no DOM lib needed.
  const c = globalThis.crypto
  if (!c) throw new Error("crypto.getRandomValues unavailable")
  c.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i++) {
    const b = bytes[i] as number
    out += BASE62[b % 62] ?? "0"
  }
  return out
}

export function shortId(prefix: string, length = 10): string {
  return `${prefix}_${randomBase62(length)}`
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Vietnamese đ/Đ doesn't decompose via NFKD — map explicitly.
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64)
}
