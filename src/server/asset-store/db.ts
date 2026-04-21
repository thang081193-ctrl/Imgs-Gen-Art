// Plan §5.3 / §4 — SQLite connection with WAL + FK enforcement + boot migration.
//
// DB filename "images-gen-art.db" chosen to match project folder name.
// PLAN §4 used placeholder "artforge.db" — deviation intentional and
// consistent with folder structure on Pham's machine. Both names remain
// gitignored; legacy "artforge.db" entry kept for safety.

import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { runPendingMigrations, type MigrationRunResult } from "./migration-runner"
import { logger } from "@/core/shared/logger"

export const DEFAULT_DB_PATH = "./data/images-gen-art.db"
export const IN_MEMORY_PATH = ":memory:"

export interface OpenAssetDatabaseOptions {
  path?: string
  readonly?: boolean
  migrationsDir?: string
}

export interface OpenedDatabase {
  db: Database.Database
  migrations: MigrationRunResult
}

export function openAssetDatabase(options: OpenAssetDatabaseOptions = {}): OpenedDatabase {
  const path = options.path ?? DEFAULT_DB_PATH
  if (path !== IN_MEMORY_PATH) {
    mkdirSync(dirname(path), { recursive: true })
  }

  const db = new Database(path, { readonly: options.readonly ?? false })
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  const migrations = runPendingMigrations(db, options.migrationsDir)

  if (migrations.applied.length > 0) {
    logger.info("asset-store: applied migrations", {
      count: migrations.applied.length,
      files: migrations.applied,
    })
  }

  return { db, migrations }
}
