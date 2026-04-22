// BOOTSTRAP-PHASE3 Step 3 — asset-store singleton.
//
// The server opens one DB handle at boot and reuses it for the lifetime
// of the process. Route handlers + workflow runners read the repos via
// the getters below. Factories (`createAssetRepo`, `createBatchRepo`)
// remain available from the module barrel for tests that want their
// own isolated instance.

import { createAssetRepo, type AssetRepo } from "./asset-repo"
import { createBatchRepo, type BatchRepo } from "./batch-repo"
import { openAssetDatabase, type OpenAssetDatabaseOptions, type OpenedDatabase } from "./db"
import {
  createProfileAssetsRepo,
  type ProfileAssetsRepo,
} from "./profile-assets-repo"

let opened: OpenedDatabase | null = null
let _assetRepo: AssetRepo | null = null
let _batchRepo: BatchRepo | null = null
let _profileAssetsRepo: ProfileAssetsRepo | null = null

export function initAssetStore(options: OpenAssetDatabaseOptions = {}): OpenedDatabase {
  if (opened) {
    throw new Error("initAssetStore: already initialized — call _resetAssetStoreForTests first")
  }
  opened = openAssetDatabase(options)
  _assetRepo = createAssetRepo(opened.db)
  _batchRepo = createBatchRepo(opened.db)
  _profileAssetsRepo = createProfileAssetsRepo(opened.db)
  return opened
}

export function getAssetRepo(): AssetRepo {
  if (!_assetRepo) {
    throw new Error("asset-store not initialized — call initAssetStore() at boot")
  }
  return _assetRepo
}

export function getBatchRepo(): BatchRepo {
  if (!_batchRepo) {
    throw new Error("asset-store not initialized — call initAssetStore() at boot")
  }
  return _batchRepo
}

export function getProfileAssetsRepo(): ProfileAssetsRepo {
  if (!_profileAssetsRepo) {
    throw new Error("asset-store not initialized — call initAssetStore() at boot")
  }
  return _profileAssetsRepo
}

/** Test-only: drop the singleton so a new initAssetStore call can rebind. */
export function _resetAssetStoreForTests(): void {
  if (opened) opened.db.close()
  opened = null
  _assetRepo = null
  _batchRepo = null
  _profileAssetsRepo = null
}
