// Session #31 — one-off v1 → v2 migration for data/profiles/*.json.
// DECISIONS §F.1 — migration-on-read pattern. Script reads every
// on-disk profile, parses through the union + transform, and re-writes
// the validated shape. Idempotent: running on already-v2 files is a
// no-op (file bytes round-trip identically after JSON.stringify/parse).
//
// For v2a (DECISIONS §F.2) the transform is identity — v1 files stay
// at `version: 1` and only get bumped on the next PUT. This script is
// therefore primarily a validation pass: parse-fail loudly (exit 1)
// instead of letting a malformed file silently fail a later loader
// call. For future v3+ migrations that rename or default-fill fields,
// rename this file and extend the transform — contents below are the
// reusable template.
//
// Run: `npm run migrate:profiles-v1-to-v2`  (script entry added in
// package.json — see Session #31 commit chain).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { AppProfileSchema } from "@/core/schemas/app-profile"

const PROFILES_DIR = resolve(process.cwd(), "data", "profiles")

interface Report {
  scanned: number
  migrated: number
  noop: number
  failed: Array<{ file: string; error: string }>
}

function migrateOne(file: string, report: Report): void {
  const path = resolve(PROFILES_DIR, file)
  const raw = readFileSync(path, "utf8")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    report.failed.push({
      file,
      error: `JSON parse: ${err instanceof Error ? err.message : String(err)}`,
    })
    return
  }
  const result = AppProfileSchema.safeParse(parsed)
  if (!result.success) {
    report.failed.push({ file, error: result.error.message })
    return
  }
  const migrated = result.data
  const serialized = JSON.stringify(migrated, null, 2) + "\n"
  if (serialized === raw) {
    report.noop += 1
    return
  }
  writeFileSync(path, serialized, "utf8")
  report.migrated += 1
}

function main(): number {
  if (!existsSync(PROFILES_DIR)) {
    console.log(`[migrate-profiles] ${PROFILES_DIR} not present — nothing to do.`)
    return 0
  }
  const files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"))
  const report: Report = { scanned: files.length, migrated: 0, noop: 0, failed: [] }
  for (const file of files) migrateOne(file, report)

  console.log(
    `[migrate-profiles] scanned=${report.scanned} migrated=${report.migrated} ` +
      `noop=${report.noop} failed=${report.failed.length}`,
  )
  if (report.failed.length > 0) {
    for (const f of report.failed) {
      console.error(`[migrate-profiles] FAIL ${f.file} — ${f.error}`)
    }
    return 1
  }
  return 0
}

process.exit(main())
