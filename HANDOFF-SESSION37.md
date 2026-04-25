# Session #37 Handoff — Phase A1 backend (saved_styles)

Paste at the start of S#37 to resume cleanly on any PC. First code
session after PLAN-v3 shipped. Scope is backend-only per Q-36.G split.

**Approach B (from S#36 close):** pre-align Qs below are pre-filled
with my best-guess answers. Bro skim, sửa chỗ nào sai, fire code.

---

## Where we stopped (end of Session #36 — 2026-04-25)

- PLAN-v3.md shipped (532 LOC) — canonical
  `Imgs-Gen-Art/PLAN-v3.md`, mirror outer dir. §0-§9 + §J DECISIONS
  locked including Q-36.A-H.
- No code changes this session (PLAN-only per scope).
- Regression baseline unchanged: **713 pass / 10 skipped / 1 todo / 724 total**.
- Git tree: S#36 docs commit **pending bro approval**, base `0f658b2`.

## Current repo state (verify before firing A1)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -8    # expect 0f658b2 (S#36 handoff-lock) on top,
                        # or S#36 PLAN-v3 commit if shipped
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 713 / 724 (or 714 / 725 if we add A1 smoke test)
```

---

## Priority pick — S#37: Phase A1 backend (saved_styles)

### Goal

Add `saved_styles` first-class entity + REST CRUD + boot-time preset
seeding + schema additions for Phase C (policy decision JSON) and
Phase A2 (asset lane column). Zero frontend touch.

### Deliverables

1. **New migration SQL** —
   `scripts/migrations/2026-04-25-saved-styles.sql`:
   - `CREATE TABLE saved_styles (...)` — schema per PLAN-v3 §6.1.
   - `ALTER TABLE assets ADD COLUMN lane TEXT NOT NULL DEFAULT 'legacy'`.
   - `ALTER TABLE history ADD COLUMN policy_decision_json TEXT`.
   - `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,
      value TEXT NOT NULL)`.
   - `INSERT OR IGNORE INTO settings (key, value) VALUES
      ('policy_rules.lastScrapedAt', '1970-01-01T00:00:00Z')`.
2. **Update `schema.sql`** canonical to match post-migration state.
3. **New repo module** — `src/server/saved-styles/saved-styles-repo.ts`
   (insert/get/list/update/delete + DTO mapping).
4. **Route pair** —
   `src/server/routes/saved-styles.ts` +
   `src/server/routes/saved-styles.body.ts` (zod).
   Endpoints:
   - `GET /api/saved-styles` (list, optional `?lane=ads|aso`)
   - `GET /api/saved-styles/:id` (detail)
   - `POST /api/saved-styles` (create, `kind='user'` only)
   - `PATCH /api/saved-styles/:id` (edit, block `preset-legacy`)
   - `DELETE /api/saved-styles/:id` (delete, block `preset-legacy`)
5. **Boot seeding** —
   `src/server/saved-styles/seed-presets.ts` called from `app.ts` boot:
   reads `data/templates/{artwork-groups,ad-layouts,style-dna}.json`,
   inserts 3 `preset-legacy` rows if not yet present (idempotent).
6. **Tests:** unit (repo CRUD + seed idempotency) + route (HTTP 200/
   400/404/403 paths). Add 1 regression smoke: `saved-styles.smoke.ts`.

### LOC budget

| File | Budget |
|------|--------|
| 2026-04-25-saved-styles.sql | ~50 |
| schema.sql (update)         | ~30 LOC added |
| saved-styles-repo.ts        | ~180 |
| saved-styles.ts (route)     | ~120 |
| saved-styles.body.ts (zod)  | ~60 |
| seed-presets.ts             | ~150 |
| saved-styles.smoke.ts       | ~80 |
| **Total new content**       | **~670 LOC across 7 files** |

All individual files ≤ 200 (soft 250, hard 300). No single file near
cap.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-37.A — Migration filename date**
- *Pre-filled:* `2026-04-25-saved-styles.sql` (today). Since there's
  already `2026-04-25-prompt-history.sql`, lexical order puts
  saved-styles AFTER prompt-history — OK since both only add
  new tables/columns, no conflict.
- *Alternative:* bump to `2026-04-26-saved-styles.sql` if S#37 fires
  tomorrow (keeps date-of-apply honest).
- *Confirm at S#37 start.* **STATUS: PRE-FILLED.**

**Q-37.B — UUID for saved_styles.id**
- *Pre-filled:* `globalThis.crypto.randomUUID()` — already used at
  `src/server/middleware/logger.ts:11` for request IDs. Native, no
  dep, zero-config.
- *Alternative:* nanoid shorter (21 chars). Not worth adding dep.
- **STATUS: LOCKED (reuse existing pattern).**

**Q-37.C — Preset slug values**
- *Pre-filled:* `artwork-legacy` · `ad-legacy` · `style-legacy`.
- Slugs are `UNIQUE NOT NULL` so seeding `INSERT OR IGNORE` on slug
  collision = idempotent.
- **STATUS: LOCKED.**

**Q-37.D — Preset `prompt_template` source extraction**
- *Pre-filled:* each preset extracts from its matching JSON file:
  - `artwork-legacy` ← concat all group prompt_heads in
    `data/templates/artwork-groups.json` → single multi-line template
    with `{{group}}` placeholder.
  - `ad-legacy` ← `data/templates/ad-layouts.json` →
    `{{layout}}/{{locale}}` placeholders.
  - `style-legacy` ← `data/templates/style-dna.json` → `{{dna_id}}`.
- Risk: the JSON schemas differ (each template has its own shape).
  Cleanest: each preset's `prompt_template` is a short pointer-doc
  (e.g. "Legacy Artwork preset — routes through workflow
  `artwork` with group={{group}}") + actual expansion happens in
  Phase D+ when the wizard knows which preset to fire.
- **Recommendation:** ship pointer-doc template in A1 (thin); full
  expansion logic lands in D1 (Meta Ads backend). Keeps A1 < 2h.
- *Bro confirm:* thin pointer vs full expansion in A1?
  **STATUS: OPEN — pick at S#37 start.**

**Q-37.E — `lanes_json` per legacy preset**
- *Pre-filled:*
  - artwork-legacy → `["ads.meta","ads.google-ads"]`
  - ad-legacy → `["ads.meta","ads.google-ads"]`
  - style-legacy → `["ads.meta","ads.google-ads","aso.play"]`
    (Style DNA is generic, cross-platform).
- **STATUS: PRE-FILLED.**

**Q-37.F — DTO mapping + `file_path` rule**
- *Pre-filled:* `saved_styles` has no file_path column, but
  `preview_asset_id` references `assets.id`. On GET response, join
  assets + strip `assets.file_path` per Rule 11 (schema.sql:6 note).
  Expose `previewAssetUrl: string | null` resolved via
  existing `assets/:id/preview` route.
- **STATUS: PRE-FILLED.**

**Q-37.G — Smoke test env**
- *Pre-filled:* SQLite in-memory fixture (matches existing repo test
  pattern). No live Vertex calls. Tests should run under <2s.
- **STATUS: LOCKED.**

**Q-37.H — PLAN-v3 §6.2 typo fix**
- PLAN-v3 §6.2 says `src/server/migrations/020_saved_styles.ts` —
  wrong, actual pattern is SQL files in `scripts/migrations/` dated.
- *Pre-filled action:* include a 2-line `DECISIONS.md` entry
  "§J.Q-37.H — migration spec corrected from numbered TS to dated
  SQL; PLAN-v3 §6.2 to be amended in next doc pass." OR edit
  PLAN-v3.md inline during A1 commit.
- **Recommendation:** amend PLAN-v3.md inline in A1 commit (1-line
  diff). Cleaner than DECISIONS entry.
- *Bro confirm.* **STATUS: OPEN.**

---

## Estimate

- S#37 scope: ~1.5h (recon already done this session; S#37 is
  implement + test only).
- Pre-align Qs check: ~5 min (bro skim, confirm/correct Q-37.D + H).
- Code + tests: ~1h.
- Regression + commit: ~20 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code (Q-37.A-H above).
- <300 content LOC hard cap per file (250 soft, 300 fail).
- Pin exact versions. No new deps without asking.
- `test:live:smoke-all` = billable — A1 uses only unit + in-memory
  smoke, no live calls. No budget concern.
- Show evidence before claiming done (HANDOFF rule #7).
- Node: `fnm exec --using=20 bash -lc "…"`.
- Preview MCP still blocked on Windows (A1 is backend-only so no
  Preview need anyway).

---

## Carry-forward (defer unless A1 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.

## Out of scope (this session)

- Any frontend code (A2 ships next session).
- Grok adapter (B1 session).
- Policy scraper (C2 session).
- Wizard UI or Meta Ads flow (D1/D2).
- Touching existing Vertex workflow runners.

---

*Session #36 closed 2026-04-25 with PLAN-v3 shipped. S#37 = Phase A1
backend-only per Q-36.G split. Pre-align Qs pre-filled in approach B
style — bro skim + fire. Next: HANDOFF-SESSION38.md for A2 frontend
drafted at S#37 close.*
