// Determinism tripwire for extract:all (Session #8 D5).
// Runs the 3 extractors twice in sequence and hashes data/templates/ after
// each run — identical hashes prove the output is byte-stable across runs.
//
// Failure modes this catches: unstable Map iteration, non-sorted JSON keys,
// timestamp leakage, platform-specific line endings (writes use "\n" always).

import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { extractGenart1 } from "../../scripts/extract-genart-1"
import { extractGenart2 } from "../../scripts/extract-genart-2"
import { extractGenart3 } from "../../scripts/extract-genart-3"

const DIR = join(process.cwd(), "data", "templates")

function hashDir(dir: string): string {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  const hash = createHash("sha256")
  for (const f of files) {
    hash.update(f)
    hash.update("\0")
    hash.update(readFileSync(join(dir, f)))
  }
  return hash.digest("hex")
}

function runAll(): void {
  extractGenart1()
  extractGenart2()
  extractGenart3()
}

describe("Phase 2 extract:all — determinism", () => {
  it("two consecutive runs produce byte-identical data/templates/", () => {
    runAll()
    const h1 = hashDir(DIR)
    runAll()
    const h2 = hashDir(DIR)
    expect(h2).toBe(h1)
  })
})
