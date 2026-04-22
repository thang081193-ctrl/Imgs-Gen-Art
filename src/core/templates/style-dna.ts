// Schema + parser for extracted art style DNA (Phase 2, Genart-3).
// See vendor/genart-3/constants.ts — `export const ART_STYLES: Record<ArtStyleKey, ArtStyleDetails>`
// with 3 fixed entries (ANIME/GHIBLI/PIXAR) × 5 fields.
//
// Output file: data/templates/style-dna.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { SchemaVersion1 } from "./types"

// --- Schema ---

// Exactly these 3 keys expected from vendor. Adding a style requires an explicit
// schema bump + drop-audit review, so we lock the enum here rather than z.string().
const ArtStyleKeySchema = z.enum(["ANIME", "GHIBLI", "PIXAR"])
export type ArtStyleKey = z.infer<typeof ArtStyleKeySchema>

const ArtStyleDetailsSchema = z.object({
  key:         ArtStyleKeySchema,
  label:       z.string().min(1),
  promptCues:  z.string().min(1),
  renderStyle: z.string().min(1),
  uiVibe:      z.string().min(1),
}).strict()

export type ArtStyleDetails = z.infer<typeof ArtStyleDetailsSchema>

export const StyleDnaSchema = z.object({
  schemaVersion: SchemaVersion1,
  // Record keyed by ArtStyleKey. All 3 keys must be present.
  styles: z.object({
    ANIME:  ArtStyleDetailsSchema,
    GHIBLI: ArtStyleDetailsSchema,
    PIXAR:  ArtStyleDetailsSchema,
  }).strict(),
}).strict()

export type StyleDnaFile = z.infer<typeof StyleDnaSchema>

// --- Parser ---

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`style-dna: ${reason}`, { source: "genart-3", ...extra })
}

export function parseStyleDna(raw: unknown): StyleDnaFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  const styles = rawMap["ART_STYLES"]
  if (typeof styles !== "object" || styles === null || Array.isArray(styles)) {
    fail("missing or non-object vendor export: ART_STYLES")
  }
  const stylesMap = styles as Record<string, unknown>

  // Verify each entry's `key` field matches its record key (vendor invariant —
  // e.g. ART_STYLES.GHIBLI.key === "GHIBLI"). Mirrors ad-layouts.id check.
  for (const [key, value] of Object.entries(stylesMap)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      fail(`styles[${key}] must be an object`, { key })
    }
    const entryKey = (value as { key?: unknown }).key
    if (entryKey !== key) {
      fail(`styles[${key}].key mismatch: expected ${JSON.stringify(key)}, got ${JSON.stringify(entryKey)}`, { key, entryKey })
    }
  }

  return StyleDnaSchema.parse({ schemaVersion: 1, styles: stylesMap })
}
