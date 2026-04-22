// PLAN §6.2 / BOOTSTRAP-PHASE3 Step 1 — synchronous template loader.
//
// Reads Phase 2 extracted JSON (data/templates/*.json), Zod-validates,
// wraps every failure (I/O, parse, schema drift) as ExtractionError so
// callers (server boot, workflow runners) handle one error class.
//
// Synchronous by design: loader is boot-time only, not on hot request path;
// the cache layer (./cache.ts) memoizes so subsequent reads are free.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ZodType } from "zod"

import { ExtractionError } from "@/core/shared/errors"

export type TemplateName =
  | "artwork-groups"
  | "ad-layouts"
  | "country-profiles"
  | "style-dna"
  | "i18n"
  | "copy-templates"

export const ALL_TEMPLATE_NAMES: readonly TemplateName[] = [
  "artwork-groups",
  "ad-layouts",
  "country-profiles",
  "style-dna",
  "i18n",
  "copy-templates",
] as const

export const DEFAULT_TEMPLATES_DIR = join(process.cwd(), "data", "templates")

export interface LoadTemplateOptions {
  /** Override template directory (tests). Defaults to `./data/templates/`. */
  baseDir?: string
}

export function loadTemplate<T>(
  name: TemplateName,
  schema: ZodType<T>,
  options: LoadTemplateOptions = {},
): T {
  const baseDir = options.baseDir ?? DEFAULT_TEMPLATES_DIR
  const path = join(baseDir, `${name}.json`)

  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (err) {
    throw new ExtractionError(`failed to read template file: ${name}.json`, {
      template: name,
      path,
      cause: err instanceof Error ? err.message : String(err),
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new ExtractionError(`template file is not valid JSON: ${name}.json`, {
      template: name,
      path,
      cause: err instanceof Error ? err.message : String(err),
    })
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new ExtractionError(`template ${name}.json failed schema validation`, {
      template: name,
      path,
      issues: result.error.issues,
    })
  }
  return result.data
}
