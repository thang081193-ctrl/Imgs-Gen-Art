// Extract genart-1/types.ts → data/templates/artwork-groups.json
// AST-parses 10 `export const _GROUPS: ...[] = [...]` literals; parser then
// merges 8 into output + drops 2 (SEXY_ANIME + SUPER_SEXY per Session #8 D1).

import { join } from "node:path"
import { openSourceFile, readExportedConst, writeJsonDeterministic } from "./extract-common"
import { parseArtworkGroups } from "@/core/templates"

const ROOT = process.cwd()
const VENDOR_FILE = join(ROOT, "vendor", "genart-1", "types.ts")
const OUTPUT_FILE = join(ROOT, "data", "templates", "artwork-groups.json")

// Must include both drop targets (parseArtworkGroups audit-guards them).
const VENDOR_GROUP_KEYS = [
  "MEMORY_GROUPS",
  "CARTOON_GROUPS",
  "AI_ART_GROUPS",
  "FESTIVE_GROUPS",
  "XMAS_GROUPS",
  "BABY_GROUPS",
  "AVATAR_GROUPS",
  "ALL_IN_ONE_GROUPS",
  "SEXY_ANIME_GROUPS",
  "SUPER_SEXY_GROUPS",
] as const

export function extractGenart1(): void {
  const source = openSourceFile(VENDOR_FILE)
  const raw: Record<string, unknown> = {}
  for (const key of VENDOR_GROUP_KEYS) {
    raw[key] = readExportedConst(source, key)
  }
  const file = parseArtworkGroups(raw)
  writeJsonDeterministic(OUTPUT_FILE, file)
  console.warn(`[extract-genart-1] wrote ${OUTPUT_FILE}`)
}

const entry = process.argv[1] ?? ""
if (entry.endsWith("extract-genart-1.ts") || entry.endsWith("extract-genart-1.js")) {
  extractGenart1()
}
