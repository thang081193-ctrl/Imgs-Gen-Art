// Barrel for src/core/templates/ — public surface for schemas, types, parsers.
// Consumers (server loaders, extract scripts, tests) should import from here,
// not from sibling files directly.

export {
  I18nLangSchema,
  CopyLangSchema,
  FeatureFocusSchema,
  SchemaVersion1,
  type I18nLang,
  type CopyLang,
  type FeatureFocus,
} from "./types"

export {
  ArtworkGroupsSchema,
  parseArtworkGroups,
  type ArtworkGroupsFile,
  type ArtworkGroupKey,
} from "./artwork-groups"

export {
  AdLayoutsSchema,
  parseAdLayouts,
  type AdLayoutsFile,
  type LayoutConfig,
} from "./ad-layouts"

export {
  CountryProfilesSchema,
  parseCountryProfiles,
  resolveCountry,
  type CountryProfilesFile,
  type CountryOverride,
  type ZoneConfig,
  type ResolvedCountryProfile,
} from "./country-profiles"

export {
  StyleDnaSchema,
  parseStyleDna,
  type StyleDnaFile,
  type ArtStyleKey,
  type ArtStyleDetails,
} from "./style-dna"

export {
  I18nSchema,
  parseI18n,
  type I18nFile,
  type I18nEntry,
} from "./i18n"

export {
  CopyTemplatesSchema,
  parseCopyTemplates,
  type CopyTemplatesFile,
  type CopyEntry,
} from "./copy-templates"
