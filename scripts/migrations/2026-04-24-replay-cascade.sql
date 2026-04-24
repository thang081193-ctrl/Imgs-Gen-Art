-- @no-fk-checks
-- Session #35 F1 — replay-source delete FK guard.
--
-- The initial schema declared `FOREIGN KEY (replayed_from) REFERENCES
-- assets(id)` with no action (defaults to NO ACTION = RESTRICT after commit).
-- Deleting an asset referenced as a replay source therefore returns 500
-- (SQLite FK constraint), surfacing to the client as "Delete failed:
-- Internal server error". Session #34's Gallery delete UI dogfood hit
-- this bug on `ast_oV48pXmw7T`.
--
-- Semantically, deleting a source invalidates all descendant replay
-- chains (they can no longer be re-replayed because the source is gone),
-- so `ON DELETE CASCADE` is the correct action. The UI warns the user
-- about the blast radius before confirming.
--
-- SQLite cannot ALTER an existing FK action — this is the standard
-- 12-step table-recreate procedure (https://sqlite.org/lang_altertable.html).
-- Runner reads the `@no-fk-checks` directive above and disables FK
-- enforcement around the transaction so `DROP TABLE assets` doesn't fire
-- `ON DELETE SET NULL` on prompt_history rows.

CREATE TABLE assets_new (
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
  replay_payload TEXT,
  replay_class TEXT NOT NULL,

  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  seed INTEGER,
  aspect_ratio TEXT NOT NULL,
  language TEXT,

  file_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size_bytes INTEGER,

  status TEXT NOT NULL,
  error_message TEXT,

  generation_time_ms INTEGER,
  cost_usd REAL,

  tags TEXT,
  notes TEXT,
  replayed_from TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (replayed_from) REFERENCES assets(id) ON DELETE CASCADE
);

INSERT INTO assets_new SELECT * FROM assets;

DROP TABLE assets;

ALTER TABLE assets_new RENAME TO assets;

CREATE INDEX idx_assets_profile ON assets(profile_id);
CREATE INDEX idx_assets_workflow ON assets(workflow_id);
CREATE INDEX idx_assets_batch ON assets(batch_id);
CREATE INDEX idx_assets_variant_group ON assets(variant_group);
CREATE INDEX idx_assets_created ON assets(created_at DESC);
CREATE INDEX idx_assets_replayed_from ON assets(replayed_from);
