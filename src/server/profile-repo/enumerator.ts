// Directory-level helpers for the JSON-file-per-profile store.
// `loader.ts` / `saver.ts` handle single-file I/O; this sibling handles
// multi-file ops (list all, delete one) needed by the /api/profiles route.

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { AppProfileSchema, type AppProfile } from "@/core/schemas/app-profile"
import { DEFAULT_PROFILES_DIR, profilePath } from "./loader"

export function listProfiles(dir: string = DEFAULT_PROFILES_DIR): AppProfile[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: AppProfile[] = []
  for (const file of files) {
    const path = resolve(dir, file)
    const raw = readFileSync(path, "utf8")
    out.push(AppProfileSchema.parse(JSON.parse(raw)))
  }
  return out
}

export function deleteProfile(id: string, dir?: string): boolean {
  const path = profilePath(id, dir)
  if (!existsSync(path)) return false
  rmSync(path, { force: true })
  return true
}
