// Plan §5.3 support — migration runner with SHA-256 drift detection.
// Applies scripts/migrations/*.sql in lexical order; records each in
// `_migrations(filename, applied_at, checksum)`. Re-application is a no-op
// when the filename is recorded AND the content checksum still matches.
// A mismatch throws MigrationDriftError (fail-fast per Rule 12) so that
// silent edits to already-applied migrations cannot slip into prod.

import type Database from "better-sqlite3"
import { readdirSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { MigrationDriftError } from "@/core/shared/errors"

export const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), "scripts/migrations")

export interface MigrationRecord {
  filename: string
  appliedAt: string
  checksum: string
}

export interface MigrationRunResult {
  applied: string[]
  skipped: string[]
}

export function runPendingMigrations(
  db: Database,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): MigrationRunResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    )
  `)

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  const rows = db
    .prepare(`SELECT filename, applied_at AS appliedAt, checksum FROM _migrations`)
    .all() as MigrationRecord[]
  const applied = new Map(rows.map((r) => [r.filename, r]))

  const result: MigrationRunResult = { applied: [], skipped: [] }
  const insertRecord = db.prepare(
    `INSERT INTO _migrations (filename, applied_at, checksum) VALUES (?, ?, ?)`,
  )

  for (const filename of files) {
    const content = readFileSync(join(migrationsDir, filename), "utf8")
    const checksum = sha256(content)
    const existing = applied.get(filename)

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new MigrationDriftError({
          filename,
          expectedChecksum: existing.checksum,
          actualChecksum: checksum,
        })
      }
      result.skipped.push(filename)
      continue
    }

    const applyOne = db.transaction(() => {
      db.exec(content)
      insertRecord.run(filename, new Date().toISOString(), checksum)
    })
    applyOne()
    result.applied.push(filename)
  }

  return result
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}
