// Schema + parser for extracted country profiles (Phase 2, Genart-3).
// See vendor/genart-3/constants.ts — two separate exports ZONE_BASE + COUNTRY_OVERRIDES.
// Preserved-structure output per Decision 2(B) — DRY: zones hold regional defaults;
// each country references a zone by key. Phase 3 implements resolveCountry() merge.
//
// Output file: data/templates/country-profiles.json (committed).

import { z } from "zod"
import { ExtractionError } from "@/core/shared/errors"
import { I18nLangSchema, SchemaVersion1, type I18nLang } from "./types"

// --- Schema ---

// Regional zone defaults (casting/camera/wardrobe/places arrays).
const ZoneConfigSchema = z.object({
  casting:          z.array(z.string().min(1)).min(1),
  camera:           z.array(z.string().min(1)).min(1),
  wardrobeEveryday: z.array(z.string().min(1)).min(1),
  placesEveryday:   z.array(z.string().min(1)).min(1),
}).strict()

export type ZoneConfig = z.infer<typeof ZoneConfigSchema>

// Country-specific metadata. `zone` is a string key into the zones map (runtime
// validated by parser — Zod can't cross-reference sibling keys).
const CountryOverrideSchema = z.object({
  name:        z.string().min(1),
  zone:        z.string().min(1),
  defaultLang: I18nLangSchema,
  langs:       z.array(I18nLangSchema).min(1),
}).strict()

export type CountryOverride = z.infer<typeof CountryOverrideSchema>

export const CountryProfilesSchema = z.object({
  schemaVersion: SchemaVersion1,
  zones:     z.record(z.string().min(1), ZoneConfigSchema)
    .refine((r) => Object.keys(r).length > 0, "zones must have at least one entry"),
  countries: z.record(z.string().min(1), CountryOverrideSchema)
    .refine((r) => Object.keys(r).length > 0, "countries must have at least one entry"),
}).strict()

export type CountryProfilesFile = z.infer<typeof CountryProfilesSchema>

// --- ResolvedCountryProfile (Phase 3 consumer shape) ---
//
// Flat merge of country override + its zone's defaults. Phase 3 workflow runners
// call resolveCountry() at load time; interface defined here in Phase 2 so
// Phase 3 has a stable target to code against.

export interface ResolvedCountryProfile {
  code: string
  name: string
  zone: string
  defaultLang: I18nLang
  langs: I18nLang[]
  casting: string[]
  camera: string[]
  wardrobeEveryday: string[]
  placesEveryday: string[]
}

/**
 * Flatten a country override by merging its referenced zone defaults.
 * Throws {@link ExtractionError} if the country or its zone is missing.
 */
export function resolveCountry(
  data: CountryProfilesFile,
  code: string,
): ResolvedCountryProfile {
  const country = data.countries[code]
  if (!country) {
    throw new ExtractionError(`country-profiles: unknown country code '${code}'`, { code })
  }
  const zone = data.zones[country.zone]
  if (!zone) {
    throw new ExtractionError(
      `country-profiles: country '${code}' references unknown zone '${country.zone}'`,
      { code, zone: country.zone },
    )
  }
  return {
    code,
    name: country.name,
    zone: country.zone,
    defaultLang: country.defaultLang,
    langs: country.langs,
    casting: zone.casting,
    camera: zone.camera,
    wardrobeEveryday: zone.wardrobeEveryday,
    placesEveryday: zone.placesEveryday,
  }
}

// --- Parser ---

function fail(reason: string, extra?: Record<string, unknown>): never {
  throw new ExtractionError(`country-profiles: ${reason}`, { source: "genart-3", ...extra })
}

export function parseCountryProfiles(raw: unknown): CountryProfilesFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("raw input must be a plain object (vendor module namespace)")
  }
  const rawMap = raw as Record<string, unknown>

  const zones = rawMap["ZONE_BASE"]
  const countries = rawMap["COUNTRY_OVERRIDES"]
  if (typeof zones !== "object" || zones === null || Array.isArray(zones)) {
    fail("missing or non-object vendor export: ZONE_BASE")
  }
  if (typeof countries !== "object" || countries === null || Array.isArray(countries)) {
    fail("missing or non-object vendor export: COUNTRY_OVERRIDES")
  }

  // Cross-reference check: every country.zone must exist as a key in zones.
  const zoneKeys = new Set(Object.keys(zones as Record<string, unknown>))
  for (const [code, rawOverride] of Object.entries(countries as Record<string, unknown>)) {
    const zoneKey = (rawOverride as { zone?: unknown })?.zone
    if (typeof zoneKey !== "string" || !zoneKeys.has(zoneKey)) {
      fail(
        `country '${code}' references unknown zone '${String(zoneKey)}' — present zones: [${[...zoneKeys].join(", ")}]`,
        { code, zoneKey },
      )
    }
  }

  return CountryProfilesSchema.parse({ schemaVersion: 1, zones, countries })
}
