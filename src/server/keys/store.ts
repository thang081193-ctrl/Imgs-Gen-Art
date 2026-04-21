// File I/O for the encrypted key store (data/keys.enc).
// Missing file → EMPTY_STORE. Write is atomic (tmp + rename) so a crash
// mid-write cannot leave a half-written keys.enc. Zod-validates on both
// load and save to catch schema drift per Rule 14.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { EMPTY_STORE, StoredKeysSchema, type StoredKeys } from "./types"

const DEFAULT_KEYS_PATH = resolve(process.cwd(), "data", "keys.enc")

export function resolveDefaultKeysPath(): string {
  return DEFAULT_KEYS_PATH
}

export function loadStoredKeys(path: string = DEFAULT_KEYS_PATH): StoredKeys {
  if (!existsSync(path)) return EMPTY_STORE
  const raw = readFileSync(path, "utf8")
  const parsed: unknown = JSON.parse(raw)
  return StoredKeysSchema.parse(parsed)
}

export function saveStoredKeys(data: StoredKeys, path: string = DEFAULT_KEYS_PATH): void {
  StoredKeysSchema.parse(data) // fail before touching disk
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8")
  renameSync(tmp, path)
}
