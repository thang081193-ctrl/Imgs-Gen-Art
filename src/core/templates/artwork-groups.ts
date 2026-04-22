// Schema + parser for extracted artwork groups (Phase 2, Genart-1).
// See vendor/genart-1/types.ts — 10 separate `const X_GROUPS: XGroupKey[]` exports;
// we merge 8 into a single Record and drop SEXY_ANIME + SUPER_SEXY per v2.0.
//
// Output file: data/templates/artwork-groups.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { SchemaVersion1 } from "./types"

// --- Schema ---

// 8 surviving categories. camelCase per Decision 1 (JSON idiom).
const GroupsSchema = z.object({
  memory:   z.array(z.string().min(1)).min(1),
  cartoon:  z.array(z.string().min(1)).min(1),
  aiArt:    z.array(z.string().min(1)).min(1),
  festive:  z.array(z.string().min(1)).min(1),
  xmas:     z.array(z.string().min(1)).min(1),
  baby:     z.array(z.string().min(1)).min(1),
  avatar:   z.array(z.string().min(1)).min(1),
  allInOne: z.array(z.string().min(1)).min(1),
}).strict()

export const ArtworkGroupsSchema = z.object({
  schemaVersion: SchemaVersion1,
  groups: GroupsSchema,
}).strict()

export type ArtworkGroupsFile = z.infer<typeof ArtworkGroupsSchema>
export type ArtworkGroupKey = keyof z.infer<typeof GroupsSchema>

// --- Parser ---
//
// Input: raw map of vendor-exported consts (e.g. `import * as g from vendor/...`).
// Expects every key in VENDOR_KEY_TO_GROUP plus both DROPPED_VENDOR_KEYS to be
// present (fail-fast if vendor removed a drop target — re-audit required).

const VENDOR_KEY_TO_GROUP: Record<string, ArtworkGroupKey> = {
  MEMORY_GROUPS: "memory",
  CARTOON_GROUPS: "cartoon",
  AI_ART_GROUPS: "aiArt",
  FESTIVE_GROUPS: "festive",
  XMAS_GROUPS: "xmas",
  BABY_GROUPS: "baby",
  AVATAR_GROUPS: "avatar",
  ALL_IN_ONE_GROUPS: "allInOne",
}

const DROPPED_VENDOR_KEYS = ["SEXY_ANIME_GROUPS", "SUPER_SEXY_GROUPS"] as const

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`artwork-groups: ${reason}`, { source: "genart-1", ...extra })
}

export function parseArtworkGroups(raw: unknown): ArtworkGroupsFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  // Fail-fast guard: drop targets must still exist in source. Silent vendor
  // removal would mean we're no longer actively dropping anything — audit needed.
  for (const key of DROPPED_VENDOR_KEYS) {
    if (!(key in rawMap)) {
      fail(`expected-to-drop vendor key missing: ${key} (re-audit drop list)`, { key })
    }
  }

  const groups: Record<string, string[]> = {}
  for (const [vendorKey, outputKey] of Object.entries(VENDOR_KEY_TO_GROUP)) {
    const value = rawMap[vendorKey]
    if (!Array.isArray(value)) {
      fail(`missing or non-array vendor export: ${vendorKey}`, { vendorKey })
    }
    if (!value.every((x): x is string => typeof x === "string" && x.length > 0)) {
      fail(`non-string or empty entries in ${vendorKey}`, { vendorKey })
    }
    groups[outputKey] = value
  }

  // Final Zod parse = defense-in-depth (catches any shape drift the manual
  // checks above miss). Throws ZodError on invalid, which caller wraps.
  return ArtworkGroupsSchema.parse({ schemaVersion: 1, groups })
}
