-- Phase 5 Step 5b (Session #27b) — PromptLab UI history log.
-- Records each mode=edit replay iteration so the PromptLab page can list
-- prior edits for a given source asset. Pure replays (mode=replay, no
-- overridePayload) do NOT insert history rows — PromptHistory is the
-- log of edits, not of all replays.
--
-- Lineage is tracked two ways:
--   - asset_id       → the source asset the edit branched from (FK ON DELETE
--                      SET NULL so deleting a source doesn't cascade the log)
--   - result_asset_id → the asset the edit produced once complete (NULL until
--                       status=complete)
--   - parent_history_id → reserved for v1.1 tree-view support (Session #27b
--                         locked v1 as a flat list ordered by createdAt DESC;
--                         column present but always NULL on writes v1)
--
-- cost_usd is denormalized from the result asset's cost (avoids a JOIN on
-- the list endpoint); source of truth is still assets.cost_usd.
-- created_by_session is an optional opaque session identifier (per #27 Q2);
-- v1 always writes NULL, column present so future clients can populate
-- without a migration.

CREATE TABLE IF NOT EXISTS prompt_history (
  id TEXT PRIMARY KEY,
  asset_id TEXT,
  result_asset_id TEXT,
  parent_history_id TEXT,
  profile_id TEXT NOT NULL,
  prompt_raw TEXT NOT NULL,
  override_params TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_session TEXT,
  status TEXT NOT NULL,
  cost_usd REAL,
  error_message TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (result_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_history_id) REFERENCES prompt_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_asset ON prompt_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_profile ON prompt_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_created ON prompt_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_history_pending ON prompt_history(status) WHERE status != 'complete';
