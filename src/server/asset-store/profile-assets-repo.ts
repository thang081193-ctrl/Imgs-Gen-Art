// profile_assets table repo — Phase 3 Step 6.
//
// `profile_assets` stores logos / badges / screenshot images uploaded for a
// ProfileDto. These are distinct from workflow-generated `assets` (which
// have prompts, seeds, replay payloads); here we only retain file pointer
// + mime + size + uploaded timestamp. The `kind` column is the soft enum
// 'logo' | 'badge' | 'screenshot' — enforced in the repo insert guard.
//
// Follows asset-repo.ts patterns: Database.Database injection via factory,
// row↔internal mapper, COLUMNS table pinned to migration order. File path
// is INTERNAL and must not appear in DTOs (Rule 11) — mapping done at the
// route layer.

import type Database from "better-sqlite3"

export type ProfileAssetKind = "logo" | "badge" | "screenshot"

const VALID_KINDS: readonly ProfileAssetKind[] = ["logo", "badge", "screenshot"]

export interface ProfileAssetInternal {
  id: string
  profileId: string
  kind: ProfileAssetKind
  filePath: string
  mimeType: string
  fileSizeBytes: number | null
  uploadedAt: string
}

export interface ProfileAssetInsertInput {
  id: string
  profileId: string
  kind: ProfileAssetKind
  filePath: string
  mimeType: string
  fileSizeBytes?: number | null
  uploadedAt?: string
}

interface ProfileAssetRow {
  id: string
  profile_id: string
  kind: string
  file_path: string
  mime_type: string
  file_size_bytes: number | null
  uploaded_at: string
}

function rowToAsset(row: ProfileAssetRow): ProfileAssetInternal {
  if (!VALID_KINDS.includes(row.kind as ProfileAssetKind)) {
    throw new Error(
      `profile-assets-repo: unknown kind '${row.kind}' in row ${row.id} (DB drift)`,
    )
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    kind: row.kind as ProfileAssetKind,
    filePath: row.file_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    uploadedAt: row.uploaded_at,
  }
}

export function createProfileAssetsRepo(db: Database.Database) {
  const insertStmt = db.prepare(
    `INSERT INTO profile_assets
     (id, profile_id, kind, file_path, mime_type, file_size_bytes, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const findByIdStmt = db.prepare(`SELECT * FROM profile_assets WHERE id = ?`)
  const listByProfileStmt = db.prepare(
    `SELECT * FROM profile_assets WHERE profile_id = ? ORDER BY uploaded_at ASC`,
  )
  const deleteStmt = db.prepare(`DELETE FROM profile_assets WHERE id = ?`)

  return {
    insert(input: ProfileAssetInsertInput): ProfileAssetInternal {
      if (!VALID_KINDS.includes(input.kind)) {
        throw new Error(`profile-assets-repo.insert: invalid kind '${input.kind}'`)
      }
      const uploadedAt = input.uploadedAt ?? new Date().toISOString()
      insertStmt.run(
        input.id,
        input.profileId,
        input.kind,
        input.filePath,
        input.mimeType,
        input.fileSizeBytes ?? null,
        uploadedAt,
      )
      const row = findByIdStmt.get(input.id) as ProfileAssetRow
      return rowToAsset(row)
    },

    findById(id: string): ProfileAssetInternal | null {
      const row = findByIdStmt.get(id) as ProfileAssetRow | undefined
      return row ? rowToAsset(row) : null
    },

    listByProfile(profileId: string): ProfileAssetInternal[] {
      return (listByProfileStmt.all(profileId) as ProfileAssetRow[]).map(rowToAsset)
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0
    },
  }
}

export type ProfileAssetsRepo = ReturnType<typeof createProfileAssetsRepo>
