// Unit tests for the SQLite migration runner — PLAN §5.3 support.
// Covers: single-apply, idempotent re-run, SHA-256 drift detection,
// lexical ordering across multiple files, non-.sql file filtering,
// _migrations bookkeeping table shape, and the real on-disk migration.

import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runPendingMigrations } from "@/server/asset-store/migration-runner"
import { MigrationDriftError } from "@/core/shared/errors"

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "igart-migrations-"))
}

function writeSql(dir: string, filename: string, sql: string): void {
  writeFileSync(join(dir, filename), sql, "utf8")
}

describe("migration-runner", () => {
  it("applies a single migration + records filename, ISO timestamp, SHA-256 checksum", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT PRIMARY KEY);")
      const db = new Database(":memory:")
      const result = runPendingMigrations(db, dir)

      expect(result.applied).toEqual(["001-init.sql"])
      expect(result.skipped).toEqual([])

      const rows = db
        .prepare(`SELECT filename, applied_at, checksum FROM _migrations`)
        .all() as Array<{ filename: string; applied_at: string; checksum: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0]?.filename).toBe("001-init.sql")
      expect(rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)
      expect(rows[0]?.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='foo'`)
        .all()
      expect(tables).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is idempotent: re-running with no file changes skips instead of re-applying", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT);")
      const db = new Database(":memory:")
      runPendingMigrations(db, dir)
      const again = runPendingMigrations(db, dir)
      expect(again.applied).toEqual([])
      expect(again.skipped).toEqual(["001-init.sql"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws MigrationDriftError when an applied file is edited", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT);")
      const db = new Database(":memory:")
      runPendingMigrations(db, dir)

      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT, tampered INTEGER);")
      let caught: unknown
      try {
        runPendingMigrations(db, dir)
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(MigrationDriftError)
      const err = caught as MigrationDriftError
      expect(err.code).toBe("MIGRATION_DRIFT")
      expect(err.status).toBe(500)
      expect(err.details).toMatchObject({ filename: "001-init.sql" })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("applies multiple files in lexical order", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "002-b.sql", "CREATE TABLE b (id TEXT);")
      writeSql(dir, "001-a.sql", "CREATE TABLE a (id TEXT);")
      writeSql(dir, "003-c.sql", "CREATE TABLE c (id TEXT);")
      const db = new Database(":memory:")
      const result = runPendingMigrations(db, dir)
      expect(result.applied).toEqual(["001-a.sql", "002-b.sql", "003-c.sql"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("ignores non-.sql files in the migrations directory", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "README.md", "# ignored")
      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT);")
      writeSql(dir, "notes.txt", "whatever")
      const db = new Database(":memory:")
      const result = runPendingMigrations(db, dir)
      expect(result.applied).toEqual(["001-init.sql"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("_migrations table has expected columns", () => {
    const dir = makeTmpDir()
    try {
      writeSql(dir, "001-init.sql", "CREATE TABLE foo (id TEXT);")
      const db = new Database(":memory:")
      runPendingMigrations(db, dir)
      const cols = db.prepare(`PRAGMA table_info(_migrations)`).all() as Array<{ name: string }>
      const names = cols.map((c) => c.name).sort()
      expect(names).toEqual(["applied_at", "checksum", "filename"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("real scripts/migrations dir applies cleanly against a fresh DB", () => {
    const db = new Database(":memory:")
    const result = runPendingMigrations(db)
    expect(result.applied).toContain("2026-04-20-initial.sql")

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("assets")
    expect(names).toContain("batches")
    expect(names).toContain("profile_assets")
    expect(names).toContain("_migrations")
  })
})
