// Layer 2 — acceptance test for extract:all output.
// Reads the 6 committed JSONs under data/templates/, validates each against
// its canonical schema, and spot-checks anchor values to catch semantic drift
// the pure Zod shape check can't detect.
//
// Precondition: `npm run extract:all` has been run (files must exist on disk).
// Regression runs `test` after `check-loc`; if a contributor forgets extract
// before committing, `npm run extract:all` is the fix.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ArtworkGroupsSchema,
  AdLayoutsSchema,
  CountryProfilesSchema,
  StyleDnaSchema,
  I18nSchema,
  CopyTemplatesSchema,
  resolveCountry,
} from "@/core/templates"

const DIR = join(process.cwd(), "data", "templates")

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DIR, filename), "utf8")) as T
}

describe("Phase 2 extract:all — Layer 2 acceptance", () => {
  it("artwork-groups.json validates + drops sexyAnime/superSexy + keeps 8 categories", () => {
    const parsed = ArtworkGroupsSchema.parse(readJson("artwork-groups.json"))
    expect(parsed.schemaVersion).toBe(1)
    const keys = Object.keys(parsed.groups).sort()
    expect(keys).toEqual(["aiArt", "allInOne", "avatar", "baby", "cartoon", "festive", "memory", "xmas"])
    // Per Session #8 D1: explicit drop of sexy categories
    expect(keys).not.toContain("sexyAnime")
    expect(keys).not.toContain("superSexy")
    expect(parsed.groups.memory).toContain("Family")
    expect(parsed.groups.xmas).toContain("SantaGlam")
  })

  it("ad-layouts.json validates + has >=1 layout + all features are valid FeatureFocus", () => {
    const parsed = AdLayoutsSchema.parse(readJson("ad-layouts.json"))
    expect(parsed.schemaVersion).toBe(1)
    const layoutKeys = Object.keys(parsed.layouts)
    expect(layoutKeys.length).toBeGreaterThan(0)
    const validFeatures = new Set(["restore", "enhance", "ai_art", "three_d", "cartoon", "polaroid", "all_in_one"])
    for (const [key, layout] of Object.entries(parsed.layouts)) {
      expect(layout.id, `layouts[${key}].id must match record key`).toBe(key)
      expect(validFeatures.has(layout.feature), `unknown feature ${layout.feature} in ${key}`).toBe(true)
    }
  })

  it("country-profiles.json validates + VN.name === 'Vietnam' + resolveCountry(VN) flat-merges SEA zone", () => {
    const parsed = CountryProfilesSchema.parse(readJson("country-profiles.json"))
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.countries.VN?.name).toBe("Vietnam")
    expect(parsed.countries.VN?.zone).toBe("SEA")
    expect(parsed.countries.GB?.zone).toBe("GLOBAL_WEST")
    // Flat-merge via resolveCountry pulls zone defaults into the country shape
    const vn = resolveCountry(parsed, "VN")
    expect(vn.casting).toEqual(parsed.zones.SEA?.casting)
    expect(vn.defaultLang).toBe("vi")
  })

  it("style-dna.json validates + ANIME/GHIBLI/PIXAR all present", () => {
    const parsed = StyleDnaSchema.parse(readJson("style-dna.json"))
    expect(parsed.schemaVersion).toBe(1)
    expect(Object.keys(parsed.styles).sort()).toEqual(["ANIME", "GHIBLI", "PIXAR"])
    expect(parsed.styles.GHIBLI.label).toMatch(/ghibli/i)
  })

  it("i18n.json validates + has exactly 11 langs incl th + id", () => {
    const parsed = I18nSchema.parse(readJson("i18n.json"))
    expect(parsed.schemaVersion).toBe(1)
    const langs = Object.keys(parsed.strings).sort()
    expect(langs).toEqual(["de", "en", "es", "fr", "id", "it", "ja", "ko", "pt", "th", "vi"])
    expect(parsed.strings.vi.cta).toBe("Tải App Miễn Phí")
  })

  it("copy-templates.json validates + exactly 10 langs (no id) + h/s arrays length 3", () => {
    const parsed = CopyTemplatesSchema.parse(readJson("copy-templates.json"))
    expect(parsed.schemaVersion).toBe(1)
    const langs = Object.keys(parsed.templates).sort()
    expect(langs).toEqual(["de", "en", "es", "fr", "it", "ja", "ko", "pt", "th", "vi"])
    expect(langs).not.toContain("id") // intentional divergence per Session #8 D3
    for (const [lang, entry] of Object.entries(parsed.templates)) {
      expect(entry.h.length, `${lang} headlines`).toBe(3)
      expect(entry.s.length, `${lang} subheadlines`).toBe(3)
    }
  })
})
