// Persists an AppProfile to `data/profiles/{id}.json`.
//
// DECISIONS §F.3 (Session #31) — saver is storage-neutral. Callers
// own version lifecycle: POST passes `version: 1`, PUT increments
// (`existing.version + 1`), import echoes the round-tripped value.
// Schema now accepts v1 (literal 1) or v2 (number >= 1) via union +
// transform; any future v3 migration slots in at the schema level
// without touching this file.

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { AppProfileSchema, type AppProfile } from "@/core/schemas/app-profile"
import { profilePath, DEFAULT_PROFILES_DIR } from "./loader"

export interface SaveProfileOptions {
  dir?: string
  touchUpdatedAt?: boolean
}

export function saveProfile(profile: AppProfile, options: SaveProfileOptions = {}): AppProfile {
  const dir = options.dir ?? DEFAULT_PROFILES_DIR
  const validated = AppProfileSchema.parse(profile)
  const persisted: AppProfile =
    options.touchUpdatedAt === false
      ? validated
      : { ...validated, updatedAt: new Date().toISOString() }
  const path = profilePath(validated.id, dir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(persisted, null, 2) + "\n", "utf8")
  return persisted
}
