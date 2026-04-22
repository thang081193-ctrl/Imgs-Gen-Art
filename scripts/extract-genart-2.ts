// Extract genart-2/constants.ts → data/templates/ad-layouts.json
// `LAYOUTS` values reference `FeatureFocus.X` enum members from genart-2/types.ts,
// so we pre-read the enum map and pass it to the literal evaluator.

import { join } from "node:path"
import {
  openSourceFile,
  readEnumMap,
  readExportedConst,
  writeJsonDeterministic,
} from "./extract-common"
import { parseAdLayouts } from "@/core/templates"

const ROOT = process.cwd()
const TYPES_FILE = join(ROOT, "vendor", "genart-2", "types.ts")
const CONST_FILE = join(ROOT, "vendor", "genart-2", "constants.ts")
const OUTPUT_FILE = join(ROOT, "data", "templates", "ad-layouts.json")

export function extractGenart2(): void {
  const typesFile = openSourceFile(TYPES_FILE)
  const constFile = openSourceFile(CONST_FILE)
  const enums = { FeatureFocus: readEnumMap(typesFile, "FeatureFocus") }
  const layouts = readExportedConst(constFile, "LAYOUTS", enums)
  const file = parseAdLayouts({ LAYOUTS: layouts })
  writeJsonDeterministic(OUTPUT_FILE, file)
  console.warn(`[extract-genart-2] wrote ${OUTPUT_FILE}`)
}

const entry = process.argv[1] ?? ""
if (entry.endsWith("extract-genart-2.ts") || entry.endsWith("extract-genart-2.js")) {
  extractGenart2()
}
