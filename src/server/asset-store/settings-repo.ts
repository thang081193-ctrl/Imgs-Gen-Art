// PLAN-v3 §4.3 — generic key-value `settings` table accessor (Phase C2,
// Session #42). First consumer: `policy_rules.lastScrapedAt` for the
// bi-weekly Home banner staleness check (PLAN-v3 §4.4). C3 enforcement
// will likely add more keys (e.g. `policy_rules.lastEnforcementAt`),
// hence the generic `getString` / `setString` shape.

import type Database from "better-sqlite3"

export interface SettingsRepo {
  getString(key: string): string | null
  setString(key: string, value: string): void
}

interface SettingsRow {
  value: string
}

export function createSettingsRepo(db: Database.Database): SettingsRepo {
  const selectStmt = db.prepare<[string]>(
    "SELECT value FROM settings WHERE key = ?",
  )
  const upsertStmt = db.prepare<[string, string]>(
    "INSERT INTO settings (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )

  return {
    getString(key: string): string | null {
      const row = selectStmt.get(key) as SettingsRow | undefined
      return row?.value ?? null
    },
    setString(key: string, value: string): void {
      upsertStmt.run(key, value)
    },
  }
}
