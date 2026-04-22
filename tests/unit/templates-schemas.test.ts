// Layer 1 tests for src/core/templates/ — per-parser schemas + invariants.
// Fixtures are small subsets of vendor data (not full extraction — that's Layer 2).
//
// Coverage strategy per schema:
//   (a) valid fixture parses to expected shape
//   (b) at least one shape-drift rejection (missing key, wrong type, empty)
//   (c) parser-specific invariant (drop-key / id-match / zone-ref / lang coverage)

import { describe, expect, it } from "vitest"
import {
  ArtworkGroupsSchema,
  parseArtworkGroups,
  AdLayoutsSchema,
  parseAdLayouts,
  CountryProfilesSchema,
  parseCountryProfiles,
  resolveCountry,
  StyleDnaSchema,
  parseStyleDna,
  I18nSchema,
  parseI18n,
  CopyTemplatesSchema,
  parseCopyTemplates,
  type ArtworkGroupsFile,
  type CountryProfilesFile,
} from "@/core/templates"
import { ExtractionError } from "@/core/shared/errors"

// ---------- artwork-groups ----------

describe("parseArtworkGroups", () => {
  const validVendor: Record<string, string[]> = {
    MEMORY_GROUPS: ["Family", "Wedding"],
    CARTOON_GROUPS: ["Anime", "Chibi"],
    AI_ART_GROUPS: ["Cyberpunk"],
    FESTIVE_GROUPS: ["Lunar"],
    XMAS_GROUPS: ["Santa"],
    BABY_GROUPS: ["Newborn"],
    AVATAR_GROUPS: ["Pixel"],
    ALL_IN_ONE_GROUPS: ["Multi"],
    SEXY_ANIME_GROUPS: ["Dropped1"],
    SUPER_SEXY_GROUPS: ["Dropped2"],
  }

  it("parses valid vendor shape, maps to camelCase keys, drops SEXY_ANIME + SUPER_SEXY", () => {
    const out = parseArtworkGroups(validVendor)
    expect(out.schemaVersion).toBe(1)
    expect(out.groups.memory).toEqual(["Family", "Wedding"])
    expect(out.groups.cartoon).toEqual(["Anime", "Chibi"])
    expect(out.groups.aiArt).toEqual(["Cyberpunk"])
    expect(out.groups.allInOne).toEqual(["Multi"])
    // Drop evidence — "Dropped1"/"Dropped2" are not in any surviving array.
    const flat = Object.values(out.groups).flat()
    expect(flat).not.toContain("Dropped1")
    expect(flat).not.toContain("Dropped2")
    // Extra-key rejection (strict): output object has exactly 8 keys.
    expect(Object.keys(out.groups).sort()).toEqual(
      ["aiArt", "allInOne", "avatar", "baby", "cartoon", "festive", "memory", "xmas"],
    )
  })

  it("throws ExtractionError when a drop-target vendor key is absent (re-audit)", () => {
    const { SUPER_SEXY_GROUPS: _drop, ...missingDrop } = validVendor
    expect(() => parseArtworkGroups(missingDrop)).toThrowError(ExtractionError)
    try {
      parseArtworkGroups(missingDrop)
    } catch (e) {
      expect(e).toBeInstanceOf(ExtractionError)
      expect((e as ExtractionError).message).toContain("SUPER_SEXY_GROUPS")
      expect((e as ExtractionError).message).toContain("re-audit")
    }
  })

  it("throws ExtractionError when a mapped vendor key is missing", () => {
    const { MEMORY_GROUPS: _m, ...missingMapped } = validVendor
    expect(() => parseArtworkGroups(missingMapped)).toThrowError(/MEMORY_GROUPS/)
  })

  it("throws ExtractionError on non-string entries", () => {
    const dirty = { ...validVendor, BABY_GROUPS: ["Newborn", 42 as unknown as string] }
    expect(() => parseArtworkGroups(dirty)).toThrowError(/BABY_GROUPS/)
  })

  it("rejects array / null / primitive raw input", () => {
    expect(() => parseArtworkGroups([])).toThrowError(/plain object/)
    expect(() => parseArtworkGroups(null)).toThrowError(/plain object/)
    expect(() => parseArtworkGroups("string")).toThrowError(/plain object/)
  })

  it("Zod schema rejects bad shape post-parse (defense-in-depth)", () => {
    // Bypasses parser, goes straight to schema. Empty group array.
    const bad: ArtworkGroupsFile = {
      schemaVersion: 1 as const,
      groups: {
        memory: [], cartoon: [], aiArt: [], festive: [],
        xmas: [], baby: [], avatar: [], allInOne: [],
      },
    }
    expect(ArtworkGroupsSchema.safeParse(bad).success).toBe(false)
  })
})

// ---------- ad-layouts ----------

describe("parseAdLayouts", () => {
  const validVendor = {
    LAYOUTS: {
      restore_split_view: {
        id: "restore_split_view",
        feature: "restore",
        hasPhoneUI: false,
        type: "before_after_split_50_50",
        description: "Torn Paper Split",
        beforeStyle: "RUINED PHOTO",
        afterStyle: "RESTORED PHOTO",
      },
      cartoon_burst: {
        id: "cartoon_burst",
        feature: "cartoon",
        hasPhoneUI: true,
        type: "multi_panel",
        description: "Burst panels",
        beforeStyle: "photo",
        afterStyle: "cartoon",
      },
    },
  }

  it("parses valid LAYOUTS record, preserves feature enum values", () => {
    const out = parseAdLayouts(validVendor)
    expect(out.schemaVersion).toBe(1)
    expect(Object.keys(out.layouts)).toEqual(["restore_split_view", "cartoon_burst"])
    expect(out.layouts.restore_split_view?.feature).toBe("restore")
    expect(out.layouts.cartoon_burst?.hasPhoneUI).toBe(true)
  })

  it("throws on id/key mismatch (invariant check)", () => {
    const broken = {
      LAYOUTS: {
        foo: { ...validVendor.LAYOUTS.restore_split_view, id: "bar" },
      },
    }
    expect(() => parseAdLayouts(broken)).toThrowError(/id mismatch/)
  })

  it("throws when LAYOUTS export missing", () => {
    expect(() => parseAdLayouts({})).toThrowError(/LAYOUTS/)
  })

  it("Zod rejects unknown feature value", () => {
    const badFeature = {
      LAYOUTS: {
        x: { ...validVendor.LAYOUTS.restore_split_view, id: "x", feature: "unknown_feat" },
      },
    }
    expect(() => parseAdLayouts(badFeature)).toThrowError()
  })
})

// ---------- country-profiles ----------

describe("parseCountryProfiles + resolveCountry", () => {
  const validVendor = {
    ZONE_BASE: {
      SEA: {
        casting: ["SEA woman"],
        camera: ["mirror selfie"],
        wardrobeEveryday: ["hoodie"],
        placesEveryday: ["bedroom"],
      },
      GLOBAL_WEST: {
        casting: ["Western woman"],
        camera: ["phone selfie"],
        wardrobeEveryday: ["denim"],
        placesEveryday: ["kitchen"],
      },
    },
    COUNTRY_OVERRIDES: {
      VN: { name: "Vietnam", zone: "SEA", defaultLang: "vi", langs: ["vi", "en"] },
      US: { name: "United States", zone: "GLOBAL_WEST", defaultLang: "en", langs: ["en"] },
    },
  }

  it("parses preserved-structure output (zones + countries separate)", () => {
    const out = parseCountryProfiles(validVendor)
    expect(out.schemaVersion).toBe(1)
    expect(Object.keys(out.zones)).toEqual(["SEA", "GLOBAL_WEST"])
    expect(out.countries.VN?.name).toBe("Vietnam")
    expect(out.countries.VN?.defaultLang).toBe("vi")
    expect(out.countries.VN?.langs).toEqual(["vi", "en"])
  })

  it("throws when a country references unknown zone (cross-ref invariant)", () => {
    const broken = {
      ...validVendor,
      COUNTRY_OVERRIDES: {
        ...validVendor.COUNTRY_OVERRIDES,
        XX: { name: "Nowhere", zone: "ATLANTIS", defaultLang: "en", langs: ["en"] },
      },
    }
    expect(() => parseCountryProfiles(broken)).toThrowError(/ATLANTIS/)
  })

  it("rejects defaultLang / langs outside I18nLang 11-set", () => {
    const hindi = {
      ...validVendor,
      COUNTRY_OVERRIDES: {
        ...validVendor.COUNTRY_OVERRIDES,
        IN: { name: "India", zone: "SEA", defaultLang: "hi", langs: ["hi", "en"] },
      },
    }
    // `hi` is in canonical LanguageCode but NOT in templates' I18nLang.
    expect(() => parseCountryProfiles(hindi)).toThrowError()
  })

  it("resolveCountry flat-merges zone defaults into country override", () => {
    const data = parseCountryProfiles(validVendor)
    const vn = resolveCountry(data, "VN")
    expect(vn).toEqual({
      code: "VN",
      name: "Vietnam",
      zone: "SEA",
      defaultLang: "vi",
      langs: ["vi", "en"],
      casting: ["SEA woman"],
      camera: ["mirror selfie"],
      wardrobeEveryday: ["hoodie"],
      placesEveryday: ["bedroom"],
    })
  })

  it("resolveCountry throws on unknown country code", () => {
    const data = parseCountryProfiles(validVendor)
    expect(() => resolveCountry(data, "ZZ")).toThrowError(/unknown country code.*ZZ/)
  })

  it("Zod rejects empty zones map", () => {
    const empty: unknown = { schemaVersion: 1, zones: {}, countries: { VN: validVendor.COUNTRY_OVERRIDES.VN } }
    expect(CountryProfilesSchema.safeParse(empty).success).toBe(false)
  })

  it("type test — CountryProfilesFile exposes zones + countries records", () => {
    // Compile-time check: if this stops compiling, the public type drifted.
    const cast: CountryProfilesFile = {
      schemaVersion: 1 as const,
      zones: {},
      countries: {},
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    cast
    expect(true).toBe(true)
  })
})

// ---------- style-dna ----------

describe("parseStyleDna", () => {
  const validVendor = {
    ART_STYLES: {
      ANIME:  { key: "ANIME",  label: "Anime",   promptCues: "cues", renderStyle: "r", uiVibe: "v" },
      GHIBLI: { key: "GHIBLI", label: "Ghibli",  promptCues: "cues", renderStyle: "r", uiVibe: "v" },
      PIXAR:  { key: "PIXAR",  label: "Pixar",   promptCues: "cues", renderStyle: "r", uiVibe: "v" },
    },
  }

  it("parses all 3 styles with key invariant verified", () => {
    const out = parseStyleDna(validVendor)
    expect(out.schemaVersion).toBe(1)
    expect(out.styles.GHIBLI.label).toBe("Ghibli")
    expect(out.styles.ANIME.key).toBe("ANIME")
  })

  it("throws when ART_STYLES missing", () => {
    expect(() => parseStyleDna({})).toThrowError(/ART_STYLES/)
  })

  it("throws on key/record mismatch (entry.key !== record key)", () => {
    const broken = {
      ART_STYLES: {
        ...validVendor.ART_STYLES,
        GHIBLI: { ...validVendor.ART_STYLES.GHIBLI, key: "ANIME" },
      },
    }
    expect(() => parseStyleDna(broken)).toThrowError(/key mismatch/)
  })

  it("Zod rejects missing required style (e.g. no PIXAR)", () => {
    const { PIXAR: _p, ...missing } = validVendor.ART_STYLES
    expect(StyleDnaSchema.safeParse({ schemaVersion: 1, styles: missing }).success).toBe(false)
  })

  it("Zod rejects unknown style key (strict)", () => {
    const extra = {
      ...validVendor.ART_STYLES,
      EXTRA: { key: "EXTRA", label: "x", promptCues: "x", renderStyle: "x", uiVibe: "x" },
    }
    expect(StyleDnaSchema.safeParse({ schemaVersion: 1, styles: extra }).success).toBe(false)
  })
})

// ---------- i18n ----------

describe("parseI18n", () => {
  const makeEntry = (marker: string) => ({
    name: `Name-${marker}`, before: `B-${marker}`, after: `A-${marker}`, cta: `C-${marker}`,
  })
  const validVendor = {
    I18N: {
      en: makeEntry("en"), vi: makeEntry("vi"), ja: makeEntry("ja"), ko: makeEntry("ko"),
      th: makeEntry("th"), es: makeEntry("es"), fr: makeEntry("fr"), id: makeEntry("id"),
      pt: makeEntry("pt"), it: makeEntry("it"), de: makeEntry("de"),
    },
  }

  it("parses all 11 langs (including th + id)", () => {
    const out = parseI18n(validVendor)
    expect(Object.keys(out.strings).sort().length).toBe(11)
    expect(out.strings.th?.name).toBe("Name-th")
    expect(out.strings.id?.cta).toBe("C-id")
  })

  it("rejects missing lang (e.g. no 'th')", () => {
    const { th: _th, ...missing } = validVendor.I18N
    expect(() => parseI18n({ I18N: missing })).toThrowError()
  })

  it("rejects extra lang not in I18nLang set (strict)", () => {
    const extra = { ...validVendor.I18N, hi: makeEntry("hi") }
    expect(() => parseI18n({ I18N: extra })).toThrowError()
  })

  it("rejects entry missing required field", () => {
    const partial = {
      ...validVendor.I18N,
      en: { name: "x", before: "x", after: "x" },  // missing cta
    }
    expect(I18nSchema.safeParse({ schemaVersion: 1, strings: partial }).success).toBe(false)
  })
})

// ---------- copy-templates ----------

describe("parseCopyTemplates", () => {
  const makeEntry = (marker: string) => ({
    h: [`h1-${marker}`, `h2-${marker}`, `h3-${marker}`],
    s: [`s1-${marker}`, `s2-${marker}`, `s3-${marker}`],
  })
  const validVendor = {
    COPY_TEMPLATES: {
      en: makeEntry("en"), vi: makeEntry("vi"), ja: makeEntry("ja"), ko: makeEntry("ko"),
      th: makeEntry("th"), es: makeEntry("es"), fr: makeEntry("fr"),
      pt: makeEntry("pt"), it: makeEntry("it"), de: makeEntry("de"),
    },
  }

  it("parses all 10 langs (no 'id')", () => {
    const out = parseCopyTemplates(validVendor)
    expect(Object.keys(out.templates).sort().length).toBe(10)
    expect(out.templates.th?.h).toEqual(["h1-th", "h2-th", "h3-th"])
  })

  it("rejects 'id' key (intentional divergence from i18n)", () => {
    const withId = { ...validVendor.COPY_TEMPLATES, id: makeEntry("id") }
    expect(() => parseCopyTemplates({ COPY_TEMPLATES: withId })).toThrowError()
  })

  it("rejects when h has wrong length (not 3)", () => {
    const badLen = {
      ...validVendor.COPY_TEMPLATES,
      en: { ...validVendor.COPY_TEMPLATES.en, h: ["only-one"] },
    }
    expect(CopyTemplatesSchema.safeParse({ schemaVersion: 1, templates: badLen }).success).toBe(false)
  })

  it("throws when COPY_TEMPLATES export missing", () => {
    expect(() => parseCopyTemplates({})).toThrowError(/COPY_TEMPLATES/)
  })
})
