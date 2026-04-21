-- Initial schema migration
-- Generated from src/server/asset-store/schema.sql on 2026-04-20
-- DO NOT EDIT after applying. If schema needs changes,
-- create new migration file. Edit triggers MigrationDriftError at boot.

-- v2.2: no path leaks in query results (handled by repo-layer DTO mapping)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  profile_version_at_gen INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  batch_id TEXT,
  variant_group TEXT,

  prompt_raw TEXT NOT NULL,
  prompt_template_id TEXT,
  prompt_template_version TEXT,
  input_params TEXT NOT NULL,
  replay_payload TEXT,                  -- v2.2: NULLABLE (was NOT NULL)
  replay_class TEXT NOT NULL,           -- derived: NULL payload → 'not_replayable'

  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  seed INTEGER,
  aspect_ratio TEXT NOT NULL,
  language TEXT,                        -- v2.2: NEW — for replay validation

  file_path TEXT NOT NULL,              -- INTERNAL ONLY — never returned by API
  width INTEGER,
  height INTEGER,
  file_size_bytes INTEGER,

  status TEXT NOT NULL,
  error_message TEXT,

  generation_time_ms INTEGER,
  cost_usd REAL,

  tags TEXT,                            -- JSON array (v1: simple scan filter; v1.1+: index strategy)
  notes TEXT,
  replayed_from TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (replayed_from) REFERENCES assets(id)
);

CREATE INDEX idx_assets_profile ON assets(profile_id);
CREATE INDEX idx_assets_workflow ON assets(workflow_id);
CREATE INDEX idx_assets_batch ON assets(batch_id);
CREATE INDEX idx_assets_variant_group ON assets(variant_group);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  total_assets INTEGER NOT NULL,
  successful_assets INTEGER NOT NULL,
  total_cost_usd REAL,
  status TEXT NOT NULL,                 -- v2.2: NEW — 'running' | 'completed' | 'aborted' | 'error'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  aborted_at TEXT                       -- v2.2: NEW
);

-- v2.2 NEW: profile assets registry
CREATE TABLE IF NOT EXISTS profile_assets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- 'logo' | 'badge' | 'screenshot'
  file_path TEXT NOT NULL,              -- INTERNAL
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX idx_profile_assets_profile ON profile_assets(profile_id);
