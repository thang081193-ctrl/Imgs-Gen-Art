// File I/O for the encrypted key store (data/keys.enc).
// Missing file → EMPTY_STORE. Write is atomic (tmp + rename) so a crash
// mid-write cannot leave a half-written keys.enc. Zod-validates on both
// load and save to catch schema drift per Rule 14.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { EMPTY_STORE, StoredKeysSchema, type StoredKeys } from "./types"

// Default path is resolved lazily so tests can inject IMAGES_GEN_ART_KEYS_PATH
// (via mkdtempSync) to isolate from a developer's real `data/keys.enc`.
// Production code never sets the env var; default matches PLAN §4 layout.
function getDefaultKeysPath(): string {
  return (
    process.env.IMAGES_GEN_ART_KEYS_PATH ??
    resolve(process.cwd(), "data", "keys.enc")
  )
}

export function resolveDefaultKeysPath(): string {
  return getDefaultKeysPath()
}

export function loadStoredKeys(path?: string): StoredKeys {
  const p = path ?? getDefaultKeysPath()
  if (!existsSync(p)) return EMPTY_STORE
  const raw = readFileSync(p, "utf8")
  const parsed: unknown = JSON.parse(raw)
  return StoredKeysSchema.parse(parsed)
}

export function saveStoredKeys(data: StoredKeys, path?: string): void {
  const p = path ?? getDefaultKeysPath()
  StoredKeysSchema.parse(data) // fail before touching disk
  mkdirSync(dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8")
  renameSync(tmp, p)
}
