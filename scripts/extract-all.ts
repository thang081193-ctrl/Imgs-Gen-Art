// Phase 2 extraction orchestrator.
// Runs the 3 per-source extractors in sequence; fails fast on any error.
// Usage: `npm run extract:all` → writes 6 JSONs under data/templates/.

import { extractGenart1 } from "./extract-genart-1"
import { extractGenart2 } from "./extract-genart-2"
import { extractGenart3 } from "./extract-genart-3"

const started = Date.now()

try {
  extractGenart1()
  extractGenart2()
  extractGenart3()
} catch (err) {
  console.error(`[extract-all] FAILED:`, err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(1)
}

console.warn(`[extract-all] 6 JSON files written in ${Date.now() - started}ms`)
