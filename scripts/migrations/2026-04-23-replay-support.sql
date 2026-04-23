-- Phase 5 Step 1 — Replay API batch linkage.
-- Adds replay-of pointers to the batches table so a replay run shows as a
-- NEW batch linked back to its source (immutable audit trail per Session #25
-- Q1 decision). Asset-level replay linkage already exists via
-- assets.replayed_from (added in the initial schema).

ALTER TABLE batches ADD COLUMN replay_of_batch_id TEXT;
ALTER TABLE batches ADD COLUMN replay_of_asset_id TEXT;

CREATE INDEX idx_batches_replay_of_batch ON batches(replay_of_batch_id);
