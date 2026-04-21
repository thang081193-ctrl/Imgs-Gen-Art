// Loads an AppProfile from `data/profiles/{id}.json`, validated by Zod.
// Path is an internal concern; error messages never leak it.

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { AppProfileSchema, type AppProfile } from "@/core/schemas/app-profile"
import { NotFoundError } from "@/core/shared/errors"

export const DEFAULT_PROFILES_DIR = resolve(process.cwd(), "data/profiles")

export function profilePath(id: string, dir: string = DEFAULT_PROFILES_DIR): string {
  return resolve(dir, `${id}.json`)
}

export function loadProfile(id: string, dir?: string): AppProfile {
  const path = profilePath(id, dir)
  if (!existsSync(path)) {
    throw new NotFoundError(`Profile '${id}' not found`, { profileId: id })
  }
  const raw = readFileSync(path, "utf8")
  const parsed: unknown = JSON.parse(raw)
  return AppProfileSchema.parse(parsed)
}

export function tryLoadProfile(id: string, dir?: string): AppProfile | null {
  const path = profilePath(id, dir)
  if (!existsSync(path)) return null
  const raw = readFileSync(path, "utf8")
  return AppProfileSchema.parse(JSON.parse(raw))
}
