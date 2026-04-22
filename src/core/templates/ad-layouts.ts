// Schema + parser for extracted ad-production layouts (Phase 2, Genart-2).
// See vendor/genart-2/constants.ts — `export const LAYOUTS: Record<string, LayoutConfig>`
// with 28 entries. Each entry shapes a before/after ad visualization layout.
//
// Output file: data/templates/ad-layouts.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { FeatureFocusSchema, SchemaVersion1 } from "./types"

// --- Schema ---

// Single layout entry. Fields mirror vendor/genart-2/types.ts LayoutConfig
// 1:1. feature is the string-valued enum (FeatureFocus.RESTORE → "restore", etc).
// beforeStyle/afterStyle are long prose (100-200 chars typical, no hard cap).
const LayoutConfigSchema = z.object({
  id:          z.string().min(1),
  feature:     FeatureFocusSchema,
  hasPhoneUI:  z.boolean(),
  type:        z.string().min(1),
  description: z.string().min(1),
  beforeStyle: z.string().min(1),
  afterStyle:  z.string().min(1),
}).strict()

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>

export const AdLayoutsSchema = z.object({
  schemaVersion: SchemaVersion1,
  // Record<LayoutId, LayoutConfig>. Keys arbitrary strings (e.g.
  // "restore_split_view", "cartoon_burst_multi_panel"). min 1 entry.
  layouts: z.record(z.string().min(1), LayoutConfigSchema)
    .refine((r) => Object.keys(r).length > 0, "layouts must have at least one entry"),
}).strict()

export type AdLayoutsFile = z.infer<typeof AdLayoutsSchema>

// --- Parser ---
//
// Input: raw vendor module namespace (e.g. `import * as g from vendor/...`).
// Expects `LAYOUTS` key to be a Record<string, LayoutConfig>.

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`ad-layouts: ${reason}`, { source: "genart-2", ...extra })
}

export function parseAdLayouts(raw: unknown): AdLayoutsFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  const layouts = rawMap["LAYOUTS"]
  if (typeof layouts !== "object" || layouts === null || Array.isArray(layouts)) {
    fail("missing or non-object vendor export: LAYOUTS")
  }
  const layoutsMap = layouts as Record<string, unknown>

  // Verify each entry's id matches its record key (consistency invariant from
  // vendor source — each entry has `id: "restore_split_view"` alongside the
  // record key `restore_split_view`). Catches manual vendor edits that break
  // this pairing silently.
  for (const [key, value] of Object.entries(layoutsMap)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      fail(`layouts[${key}] must be an object`, { key })
    }
    const entryId = (value as { id?: unknown }).id
    if (entryId !== key) {
      fail(`layouts[${key}].id mismatch: expected ${JSON.stringify(key)}, got ${JSON.stringify(entryId)}`, { key, entryId })
    }
  }

  // Final Zod parse = defense-in-depth (catches shape drift).
  return AdLayoutsSchema.parse({ schemaVersion: 1, layouts: layoutsMap })
}
