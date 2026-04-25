-- Session #37 Phase A1 (PLAN-v3 §6.2) — Saved Styles + lane-stamping.
--
-- Adds the `saved_styles` first-class entity (PLAN-v3 §6.1) plus the
-- forward-compat columns Phase A2/C consumers need:
--   * assets.lane             — Phase A2 Gallery filter (legacy default).
--   * batches.policy_decision_json — Phase C3 audit trail. Per Q-37.I,
--     the decision lives at batch level (1 preflight per gen run, N
--     assets per batch — avoids duplicate JSON blobs on assets rows).
--   * settings(key, value)    — generic kv table; first key seeded is
--     policy_rules.lastScrapedAt for the §4.3 bi-weekly banner.
--
-- All ALTERs are unconditional — SQLite ADD COLUMN is idempotent at the
-- migration-runner level (this file only runs once via _migrations).

CREATE TABLE saved_styles (
  id               TEXT PRIMARY KEY,
  slug             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  kind             TEXT NOT NULL,
  prompt_template  TEXT NOT NULL,
  preview_asset_id TEXT,
  lanes_json       TEXT NOT NULL,
  usage_count      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY (preview_asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_saved_styles_kind ON saved_styles(kind);
CREATE INDEX idx_saved_styles_slug ON saved_styles(slug);

ALTER TABLE assets ADD COLUMN lane TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX idx_assets_lane ON assets(lane);

ALTER TABLE batches ADD COLUMN policy_decision_json TEXT;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value)
VALUES ('policy_rules.lastScrapedAt', '1970-01-01T00:00:00Z');
