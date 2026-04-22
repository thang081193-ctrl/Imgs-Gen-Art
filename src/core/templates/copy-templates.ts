// Schema + parser for extracted marketing copy templates (Phase 2, Genart-3).
// See vendor/genart-3/constants.ts — `export const COPY_TEMPLATES: Record<string, {h,s}>`
// with 10 language entries (3 headlines `h` + 3 subheadlines `s` each).
//
// Note: i18n covers UI strings (11 langs); copy-templates covers marketing copy
// (10 langs, excluding 'id'). Divergence is intentional from Genart-3 — different
// content types have different coverage. Do NOT fabricate missing langs.
//
// Output file: data/templates/copy-templates.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { CopyLangSchema, SchemaVersion1, type CopyLang } from "./types"

// --- Schema ---

// Fixed-length 3 per Genart-3 source (h = 3 headlines, s = 3 subheadlines).
// .length(3) codifies this — vendor adding a 4th would fail-fast here and
// prompt a schema bump + downstream audit.
const CopyEntrySchema = z.object({
  h: z.array(z.string().min(1)).length(3),
  s: z.array(z.string().min(1)).length(3),
}).strict()

export type CopyEntry = z.infer<typeof CopyEntrySchema>

// Require all 10 CopyLang keys — build schema programmatically for
// auto-propagation (same pattern as i18n.ts).
const TEMPLATES_SCHEMA_SHAPE = Object.fromEntries(
  CopyLangSchema.options.map((lang): [CopyLang, typeof CopyEntrySchema] => [lang, CopyEntrySchema]),
) as Record<CopyLang, typeof CopyEntrySchema>

export const CopyTemplatesSchema = z.object({
  schemaVersion: SchemaVersion1,
  templates: z.object(TEMPLATES_SCHEMA_SHAPE).strict(),
}).strict()

export type CopyTemplatesFile = z.infer<typeof CopyTemplatesSchema>

// --- Parser ---

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`copy-templates: ${reason}`, { source: "genart-3", ...extra })
}

export function parseCopyTemplates(raw: unknown): CopyTemplatesFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  const templates = rawMap["COPY_TEMPLATES"]
  if (typeof templates !== "object" || templates === null || Array.isArray(templates)) {
    fail("missing or non-object vendor export: COPY_TEMPLATES")
  }

  return CopyTemplatesSchema.parse({ schemaVersion: 1, templates })
}
