// Extract genart-3/constants.ts → 4 JSON files under data/templates/
//   I18N            → i18n.json
//   ART_STYLES      → style-dna.json
//   ZONE_BASE + COUNTRY_OVERRIDES → country-profiles.json
//   COPY_TEMPLATES  → copy-templates.json
// All values are pure literals (no enum refs), so no enumMap needed.

import { join } from "node:path"
import { openSourceFile, readExportedConst, writeJsonDeterministic } from "./extract-common"
import {
  parseI18n,
  parseStyleDna,
  parseCountryProfiles,
  parseCopyTemplates,
} from "@/core/templates"

const ROOT = process.cwd()
const CONST_FILE = join(ROOT, "vendor", "genart-3", "constants.ts")
const TEMPLATES_DIR = join(ROOT, "data", "templates")

export function extractGenart3(): void {
  const source = openSourceFile(CONST_FILE)

  const i18n = parseI18n({ I18N: readExportedConst(source, "I18N") })
  writeJsonDeterministic(join(TEMPLATES_DIR, "i18n.json"), i18n)
  console.warn(`[extract-genart-3] wrote i18n.json`)

  const styleDna = parseStyleDna({ ART_STYLES: readExportedConst(source, "ART_STYLES") })
  writeJsonDeterministic(join(TEMPLATES_DIR, "style-dna.json"), styleDna)
  console.warn(`[extract-genart-3] wrote style-dna.json`)

  const countries = parseCountryProfiles({
    ZONE_BASE: readExportedConst(source, "ZONE_BASE"),
    COUNTRY_OVERRIDES: readExportedConst(source, "COUNTRY_OVERRIDES"),
  })
  writeJsonDeterministic(join(TEMPLATES_DIR, "country-profiles.json"), countries)
  console.warn(`[extract-genart-3] wrote country-profiles.json`)

  const copy = parseCopyTemplates({ COPY_TEMPLATES: readExportedConst(source, "COPY_TEMPLATES") })
  writeJsonDeterministic(join(TEMPLATES_DIR, "copy-templates.json"), copy)
  console.warn(`[extract-genart-3] wrote copy-templates.json`)
}

const entry = process.argv[1] ?? ""
if (entry.endsWith("extract-genart-3.ts") || entry.endsWith("extract-genart-3.js")) {
  extractGenart3()
}
