-- Images Gen Art — SQLite schema (canonical reference).
-- Source of truth mirrored verbatim into scripts/migrations/2026-04-20-initial.sql.
-- When the schema changes, author a NEW dated migration file and update this
-- file to match the resulting cumulative state. Never edit past migrations.
--
-- PLAN §5.3. Rule 11: file_path columns are INTERNAL — repo DTO mappers must
-- strip them before any route returns an object.

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
  -- Session #35 F1: CASCADE added in 2026-04-24-replay-cascade.sql.
  -- Deleting a source invalidates descendant replay chains; UI warns
  -- about the blast radius via replayDescendantCount on AssetDto.
  FOREIGN KEY (replayed_from) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_assets_profile ON assets(profile_id);
CREATE INDEX idx_assets_workflow ON assets(workflow_id);
CREATE INDEX idx_assets_batch ON assets(batch_id);
CREATE INDEX idx_assets_variant_group ON assets(variant_group);
CREATE INDEX idx_assets_created ON assets(created_at DESC);
-- Session #35 F1: indexes the self-FK subquery used to populate
-- replayDescendantCount on AssetDto (single lookup per list row).
CREATE INDEX idx_assets_replayed_from ON assets(replayed_from);

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
  aborted_at TEXT,                      -- v2.2: NEW
  replay_of_batch_id TEXT,              -- Phase 5 Step 1 — source batch of a replay run
  replay_of_asset_id TEXT               -- Phase 5 Step 1 — source asset that triggered the replay
);

CREATE INDEX IF NOT EXISTS idx_batches_replay_of_batch ON batches(replay_of_batch_id);

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

-- Phase 5 Step 5b (Session #27b) — PromptLab edit history.
CREATE TABLE IF NOT EXISTS prompt_history (
  id TEXT PRIMARY KEY,
  asset_id TEXT,                         -- source asset (nullable after source delete)
  result_asset_id TEXT,                  -- new asset from the edit (NULL until complete)
  parent_history_id TEXT,                -- reserved for v1.1 tree view; always NULL in v1
  profile_id TEXT NOT NULL,              -- denormalized for profile filter queries
  prompt_raw TEXT NOT NULL,
  override_params TEXT NOT NULL,         -- JSON — {addWatermark?, negativePrompt?}
  created_at TEXT NOT NULL,
  created_by_session TEXT,               -- optional opaque session identifier (v1: always NULL)
  status TEXT NOT NULL,                  -- 'pending' | 'complete' | 'failed' | 'cancelled'
  cost_usd REAL,                         -- denormalized from result asset
  error_message TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (result_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_history_id) REFERENCES prompt_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_asset ON prompt_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_profile ON prompt_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_created ON prompt_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_history_pending ON prompt_history(status) WHERE status != 'complete';
