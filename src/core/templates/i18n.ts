// Schema + parser for extracted i18n UI strings (Phase 2, Genart-3).
// See vendor/genart-3/constants.ts — `export const I18N: Record<string, {name,before,after,cta}>`
// with 11 language entries.
//
// Note: i18n covers UI strings (11 langs); copy-templates covers marketing copy
// (10 langs, excluding 'id'). Divergence is intentional from Genart-3 — different
// content types have different coverage. Do NOT fabricate missing langs.
//
// Output file: data/templates/i18n.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { I18nLangSchema, SchemaVersion1, type I18nLang } from "./types"

// --- Schema ---

const I18nEntrySchema = z.object({
  name:   z.string().min(1),
  before: z.string().min(1),
  after:  z.string().min(1),
  cta:    z.string().min(1),
}).strict()

export type I18nEntry = z.infer<typeof I18nEntrySchema>

// Require all 11 I18nLang keys — build the object schema programmatically so
// adding a lang in types.ts auto-propagates here (and forgetting to update
// source would fail Zod parse with a clear "missing key" error).
const STRINGS_SCHEMA_SHAPE = Object.fromEntries(
  I18nLangSchema.options.map((lang): [I18nLang, typeof I18nEntrySchema] => [lang, I18nEntrySchema]),
) as Record<I18nLang, typeof I18nEntrySchema>

export const I18nSchema = z.object({
  schemaVersion: SchemaVersion1,
  strings: z.object(STRINGS_SCHEMA_SHAPE).strict(),
}).strict()

export type I18nFile = z.infer<typeof I18nSchema>

// --- Parser ---

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`i18n: ${reason}`, { source: "genart-3", ...extra })
}

export function parseI18n(raw: unknown): I18nFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  const strings = rawMap["I18N"]
  if (typeof strings !== "object" || strings === null || Array.isArray(strings)) {
    fail("missing or non-object vendor export: I18N")
  }

  // Zod schema catches missing keys, extra keys, and shape drift.
  return I18nSchema.parse({ schemaVersion: 1, strings })
}
