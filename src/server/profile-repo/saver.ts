// Persists an AppProfile to `data/profiles/{id}.json`.
// Rule 14 — AppProfileSchema pins version to `z.literal(1)`; any shape
// change bumps the literal and ships a migration. Saver writes whatever
// the caller passes (already v1 today); an explicit bump path will land
// alongside the first v2 migration.

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
