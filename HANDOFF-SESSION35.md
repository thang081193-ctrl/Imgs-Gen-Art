# Session #35 Handoff — bug-fix mode (priority: replay-delete FK guard)

Paste at the start of Session #35 to resume cleanly on any PC.

Session #34 shipped two dogfood features same-day: Gallery delete UI
(per-asset + Google Photos-style bulk-select) and Home H1 chơi-chữ
+ Inter Variable self-host. Regression 700/711 pass throughout.
One real backend bug surfaced by smoke testing: deleting an asset
that is referenced as `replayedFromAssetId` by a descendant returns
500 (SQLite FK constraint). That's the #1 priority for S#35.

Session #35 reverts to **bug-fix-only mode** per HANDOFF-SESSION33
default. No new feature work unless bro explicitly promotes a
v2+ roadmap item.

---

## Where we stopped (end of Session #34 — 2026-04-24)

- Phases 1-6 CLOSED. v1 + theme + Gallery delete UI + H1
  chơi-chữ all shipped.
- Regression **700 pass / 10 skipped / 1 todo / 711 total**. Clean.
- LOC: 2 files above soft cap (Gallery 268, replay-service 257);
  0 above hard cap 300.
- **Git tree:** 3 Session #34 commits on top of `ff2d265` HANDOFF.
- Bro's home PC path: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.
  Node 20 via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5       # expect 3 S#34 commits on top of ff2d265
npm install
npm run regression:full    # expect 700 pass / 711 total CLEAN
npm run dev                # http://localhost:5173
```

## Priority pick — F1: backend replay-delete FK guard

Real dogfood bug surfaced by Session #34's delete-UI smoke.

**Symptom.** `DELETE /api/assets/:id` returns 500 (no JSON body)
when the asset is referenced as `replayedFromAssetId` by another
asset. Client surfaces "Delete failed: Internal server error" toast.
In S#34's 50-asset dogfood gallery, 1 asset (`ast_oV48pXmw7T`) is
such a source.

**Root cause.** SQLite foreign key constraint on the
`replayed_from_asset_id` column (without `ON DELETE CASCADE` or
an app-level guard).

**Two viable fixes — bro picks one:**

### Option A (recommended) — `ON DELETE CASCADE`

Semantically correct for this app: deleting a source invalidates
all descendant replay chains (they can no longer be re-replayed
because the source asset is gone). CASCADE removes the descendants
alongside the source in one transaction.

**Steps:**
1. Check current assets schema for FK declaration location.
   Likely in `src/server/asset-store/asset-repo.ts` or a
   migration file. Grep for `REFERENCES assets` or
   `replayed_from_asset_id`.
2. Add `ON DELETE CASCADE` to the FK constraint. Requires SQLite
   schema recreation (ALTER TABLE cannot add FK actions in-place)
   — check if the app uses a migrations layer or just rebuilds
   the schema on boot.
3. If schema is rebuilt on boot via `CREATE TABLE IF NOT EXISTS`,
   a forward-only migration is needed: `CREATE TABLE new_assets
   ... ON DELETE CASCADE; INSERT INTO new_assets SELECT * FROM
   assets; DROP TABLE assets; ALTER TABLE new_assets RENAME TO
   assets;`.
4. Integration test: extend `tests/integration/assets-routes.test.ts`
   with a test that creates source + replay-child, deletes source,
   asserts child also gone (or 404).

### Option B — app-level 409 guard

Mirrors the `/api/profiles/:id` pattern from Session #30 (Step 4).
Safer for users — no silent cascade delete.

**Steps:**
1. In `src/server/routes/assets.ts` DELETE handler, before the
   `deleteById` call, query the asset-repo for descendants
   (`SELECT COUNT(*) FROM assets WHERE replayed_from_asset_id = ?`).
2. If count > 0, return 409 with body
   `{error: "REPLAY_DEPENDENTS_EXIST", descendantCount: N}`.
3. Client-side: in `use-delete-asset.ts`, the 409 already reaches
   the `.catch` branch as an `ApiError`. Surface a clearer toast
   — "Cannot delete: N replay descendants exist. Delete the
   replays first." (mirror `DeleteProfileDialog` pattern if bro
   wants a richer UI).
4. Integration test: new test asserts 409 + body shape.

**Decision Qs for S#35 start:**
- Q-A — CASCADE or 409?
- Q-B — If CASCADE, do we want a confirm warning in the UI when
  deleting a source ("This will also delete N replay descendants")?
  Probably yes — mirror ConfirmDialog body conditional.

### Estimate

- Option A: ~30–45min (schema rebuild + migration + 1 test).
- Option B: ~45–60min (route guard + client toast + 1 test +
  optional UI polish).
- Session buffer: 30min.
- F2 close: 15min.

Total: **~1.5h**. Budget 2h.

---

## Other bug-fix flow candidates (lower priority, pull if time)

Same list as HANDOFF-SESSION33 §H.3 + DECISIONS §I.3:

- Sharp-derived icon-only favicon crop.
- jm-* semantic class migration (gate on overlay maintenance cost).
- Theme-aware brand-color ramps (gate on light-mode washout).
- §C1 asset_tags JOIN migration (gate on schema trigger).
- §G.1 server-side async flush await.
- Pre-existing nested-button console warning in ReplayedFromChip
  (visible in S#34 smoke logs — `<button>` inside `<button>`).
  Minor a11y issue, not theme or delete-UI related.

## Out of scope (v2+ carry-forward)

- Tree view via parentHistoryId.
- Side-by-side diff panel.
- Cursor-based pagination.
- Profile import UI.
- 3-way merge UI.
- Bulk profile operations.
- Profile list search/filter.
- Read-only profile view route.
- Bulk delete for cross-page selection (current implementation
  is page-scoped; the "Select all on page" button doesn't select
  across pages).

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Pre-alignment Qs before firing code (§A + §B above for S#35).
- <300 content LOC hard cap (250 soft, 300 fail).
- Pin exact versions. No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget before firing.
- Show evidence before claiming done (HANDOFF rule #7).
- Preview MCP smoke required for UI-visible changes.

---

*Session #34 closed 2026-04-24 (2 features + 1 docs commit).
Regression 700/711 CLEAN. Next: Session #35 = backend FK guard
for replay-source deletes (DECISIONS §I.1 + §I.3 flagged it).
Handoff file = `HANDOFF-SESSION35.md` (this file). Post-S#35,
continue HANDOFF-SESSION33 bug-fix-only mode.*
