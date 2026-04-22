// BOOTSTRAP-PHASE3 Step 1 — in-process memo for loaded templates.
//
// Six typed getters over loadTemplate(). Module-level Map memoizes first call;
// no TTL (files are git-committed, rebuild = new boot). preloadAllTemplates()
// is wired into boot (src/server/index.ts) so any corrupted/missing JSON
// aborts startup before the HTTP listener binds.

import type { ZodType } from "zod"

import {
  AdLayoutsSchema,
  ArtworkGroupsSchema,
  CopyTemplatesSchema,
  CountryProfilesSchema,
  I18nSchema,
  StyleDnaSchema,
  type AdLayoutsFile,
  type ArtworkGroupsFile,
  type CopyTemplatesFile,
  type CountryProfilesFile,
  type I18nFile,
  type StyleDnaFile,
} from "@/core/templates"

import { ALL_TEMPLATE_NAMES, loadTemplate, type TemplateName } from "./loader"

const cache = new Map<TemplateName, unknown>()

function getOrLoad<T>(name: TemplateName, schema: ZodType<T>): T {
  const hit = cache.get(name)
  if (hit !== undefined) return hit as T
  const loaded = loadTemplate(name, schema)
  cache.set(name, loaded)
  return loaded
}

export function getArtworkGroups(): ArtworkGroupsFile {
  return getOrLoad("artwork-groups", ArtworkGroupsSchema)
}

export function getAdLayouts(): AdLayoutsFile {
  return getOrLoad("ad-layouts", AdLayoutsSchema)
}

export function getCountryProfiles(): CountryProfilesFile {
  return getOrLoad("country-profiles", CountryProfilesSchema)
}

export function getStyleDna(): StyleDnaFile {
  return getOrLoad("style-dna", StyleDnaSchema)
}

export function getI18n(): I18nFile {
  return getOrLoad("i18n", I18nSchema)
}

export function getCopyTemplates(): CopyTemplatesFile {
  return getOrLoad("copy-templates", CopyTemplatesSchema)
}

/**
 * Eagerly load all 6 templates. Called at server boot so a corrupted or
 * missing file aborts startup. Idempotent — second call is all cache hits.
 */
export function preloadAllTemplates(): void {
  for (const name of ALL_TEMPLATE_NAMES) {
    switch (name) {
      case "artwork-groups":   getArtworkGroups();    break
      case "ad-layouts":       getAdLayouts();        break
      case "country-profiles": getCountryProfiles();  break
      case "style-dna":        getStyleDna();         break
      case "i18n":             getI18n();             break
      case "copy-templates":   getCopyTemplates();    break
    }
  }
}

/** Test-only: drop memoized entries so the next getter call reads disk. */
export function _resetTemplateCacheForTests(): void {
  cache.clear()
}
