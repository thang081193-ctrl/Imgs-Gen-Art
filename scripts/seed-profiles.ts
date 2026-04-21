/**
 * scripts/seed-profiles.ts — idempotent profile seeder.
 *
 * Canonical seeds live in scripts/seed-data/profiles/ (git-tracked).
 * Runtime profiles live in data/profiles/ (gitignored, created/edited via
 * the Phase-5 CMS). This script bootstraps a fresh checkout by copying
 * any canonical seed that is not yet present in data/profiles/.
 *
 * Never overwrites an existing runtime profile — `data/profiles/<id>.json`
 * already present means the user (or CMS) has it; we leave it alone.
 *
 * Reasons for the scripts/seed-data/ location: see PHASE-STATUS.md Step 5
 * deviation note + memory/patterns.md File Location Policy.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = process.cwd()
const SOURCE_DIR = resolve(ROOT, "scripts/seed-data/profiles")
const TARGET_DIR = resolve(ROOT, "data/profiles")

function main(): void {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`[seed-profiles] source directory missing: ${SOURCE_DIR}`)
    process.exit(1)
  }
  mkdirSync(TARGET_DIR, { recursive: true })

  const seeds = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".json")).sort()
  if (seeds.length === 0) {
    console.warn(`[seed-profiles] no seeds found in ${SOURCE_DIR}`)
    return
  }

  let copied = 0
  let skipped = 0
  for (const filename of seeds) {
    const source = join(SOURCE_DIR, filename)
    const target = join(TARGET_DIR, filename)
    if (existsSync(target)) {
      console.warn(`[seed-profiles] skip ${filename} — already present`)
      skipped++
      continue
    }
    copyFileSync(source, target)
    console.warn(`[seed-profiles] seeded ${filename}`)
    copied++
  }
  console.warn(`[seed-profiles] done — ${copied} copied, ${skipped} skipped.`)
}

main()
