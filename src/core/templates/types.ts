// Shared Zod fragments for extracted templates (Phase 2).
// src/core/templates/ is universal (client + server). Pure schemas + types, no I/O.
//
// Approach: each template file owns its own schema + parser + inferred type
// (colocated per CONTRIBUTING single-responsibility). This file holds ONLY
// the cross-template shared enums below.

import { z } from "zod"

// Schema version literal used by every template file's top-level object.
// Bump per Rule 14 on shape changes + add migration note in PHASE-STATUS.
export const SchemaVersion1 = z.literal(1)

// --- Language enums (local to templates/) ---
//
// IMPORTANT: canonical src/core/model-registry/types.ts LanguageCode covers
// Imagen/Gemini provider capability matrices (en, vi, ja, ko, pt, es, de, fr,
// hi, it, zh, zh-CN, zh-TW). It does NOT include `th` or `id`, but Genart-3
// I18N / COPY_TEMPLATES / COUNTRY_OVERRIDES do.
//
// Rather than churn canonical (Rule 14 versioning stability — would bump
// AppProfile v1 → v2), templates define their own local lang enums here.
// Phase 3 can consolidate if workflow inputs cross both axes.

/** 11-lang coverage for i18n (UI strings). Includes `th` + `id`. */
export const I18nLangSchema = z.enum([
  "en", "vi", "ja", "ko", "th", "es", "fr", "id", "pt", "it", "de",
])
export type I18nLang = z.infer<typeof I18nLangSchema>

/** 10-lang coverage for copy-templates (marketing copy). Subset of I18nLang minus `id`. */
export const CopyLangSchema = z.enum([
  "en", "vi", "ja", "ko", "th", "es", "fr", "pt", "it", "de",
])
export type CopyLang = z.infer<typeof CopyLangSchema>

// --- FeatureFocus enum (extracted from vendor/genart-2/types.ts) ---
//
// Source is a TS string enum: FeatureFocus.RESTORE = "restore", etc.
// At JSON serialization time the string values are emitted, so our schema
// accepts the 7 string literals directly.

export const FeatureFocusSchema = z.enum([
  "restore", "enhance", "ai_art", "three_d", "cartoon", "polaroid", "all_in_one",
])
export type FeatureFocus = z.infer<typeof FeatureFocusSchema>
