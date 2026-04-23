# Session #28 Handoff — Phase 5 Step 3 (Gallery filters) OR visual smoke batch

Paste at the start of Session #28 to resume cleanly on any PC.

---

## Where we stopped (end of Session #27b — 2026-04-24)

- **Phase 5 Steps 5a + 5b CLOSED ✅** — backend `mode=edit` + full PromptLab
  UI shipped. Edit iterations logged in `prompt_history` SQLite table.
- **27a carry-forwards #2 + #4 paid down.** `applyOverride` lives in
  `replay-override.ts`; dead `EDIT_REQUIRES_PROMPT` ErrorCode removed.
- **Regression: 573 / 584** (10 skipped + 1 todo). +27 net vs Session #27a.
- **Git tree:** clean + 3 commits (`d9c9529` + `52b7d91` + docs commit).

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`. Run via the
Node 20 PowerShell PATH prefix (see `HANDOFF-SESSION27.md`).

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -4    # expect the 3 Session #27b commits on top of 27a's ae54131

npm install
npm run regression:full # expect 573 pass + 10 skipped + 1 todo / 584 total
```

Full regression occasionally surfaces a cross-test flake (health-cache init
+ zz-pa-test profile race across parallel integration workers — not caused
by Step 5b). Re-run; isolated runs always pass.

## What still needs doing on Phase 5

| Step | Title | Status |
|---|---|---|
| 3 | Gallery filters (tags / date / provider / model / replayClass) | pending |
| 4 | Profile CMS (CRUD UI + optimistic concurrency) | pending |
| 6 | AppProfileSchema v2 trigger-driven migration | pending (defer unless blocked) |

## Recommended Session #28 scope (bro-decide)

### Option A — **Visual smoke batch** (60–90 min, mostly bro-operated)

Fold in the Session #26 Step 2 smoke (deferred from Session #26 close) AND
the Session #27b Step 5b smoke in one Chrome MCP session. Scripted checklist:

**Step 2 (ReplayBadge + Replay button states):**
1. `npm run dev` on bro's home PC.
2. Open Gallery in Chrome.
3. Hover thumbnails → confirm EXACT (green) / APPROX (amber) / `—` badges
   render per asset.replayClass.
4. Click a `deterministic` asset → modal opens → Replay button reads
   `Replay (exact) · $X.XX`.
5. Click Replay → SSE streams → result card appears → Open ↗ swaps modal,
   Open-in-Gallery filters by new batchId.
6. Click a `not_replayable` asset → Replay button disabled → hover tooltip
   matches `notReplayableTooltip(reason)` per probe reason.
7. Click a watermark_applied / seed_missing / provider_no_seed_support
   asset to verify the 3 tooltip reason branches (seed via `assets.seed IS
   NULL`, provider via `modelId='gemini-3-pro-image-preview'`,
   watermark via mock).

**Step 5b (PromptLab):**
1. Pick any canonical asset (Session #27a+ rows — `editable.canEdit=true`).
2. Click `[Edit & replay]` in the modal → navigates to
   `/prompt-lab?assetId=<id>`.
3. Verify 3-column layout: source card (left) + editor + prediction strip
   (middle) + diff + history (right).
4. Edit the prompt → confirm DiffViewer updates on every keystroke
   (red `<del>` + green `<ins>` + `+/−` markers).
5. Toggle `Add watermark` → predicted replayClass flips to `not_replayable`
   in the prediction strip.
6. Click `Run edit` → SSE streams → new asset appears in prediction strip
   + history sidebar refreshes with a new `complete` row.
7. Click `Open result in Gallery ↗` → navigates to Gallery filtered by new
   batchId.
8. Back to PromptLab → click a history entry → prefill hint appears below
   editor (non-destructive — textarea not clobbered).
9. Pick a legacy row (pre-Session-#27, `editable.canEdit=false`) from the
   modal → confirm `[Edit & replay]` disabled + tooltip reads:
   "This asset predates the edit & replay feature. Replay is supported
   but editing is not. Create a new batch to use edit & replay."

### Option B — **Phase 5 Step 3: Gallery filters** (5–7 hours)

Add filter chips/dropdowns for tags + date range + provider + model +
replayClass on top of the existing profile / workflow / batchId filters.

Pre-alignment scope Qs for bro:

- **Q-3.A** Filter UI shape: (a) chips row above grid, (b) left sidebar,
  (c) filter drawer. Recommend (a) — consistent with AssetFilterBar's
  current inline chip pattern + no layout churn.
- **Q-3.B** Date filter: (a) from/to date pickers, (b) preset ranges
  (last 7d / 30d / all), (c) both. Recommend (b) first — prompt history
  is typically recent; date pickers are polish.
- **Q-3.C** Tag filter: (a) AND semantics (asset has ALL selected tags),
  (b) OR semantics (asset has ANY selected tag). Recommend (b) — matches
  how users think about categorization.
- **Q-3.D** Server-side vs client-side filtering: existing `GET /api/
  assets?profileId&workflowId&batchId&limit&offset` is server-side. New
  filters should join that pattern (not client-filter after fetch) so
  pagination stays correct.
- **Q-3.E** ReplayClass filter: discriminated union on
  `deterministic | best_effort | not_replayable` — multi-select? Or
  radio-style single select? Recommend multi-select, default all on.

Backend work: `AssetListFilter` gains `createdAfter?`, `createdBefore?`,
`tags?: string[]`, `providerId?`, `modelId?`, `replayClass?: string[]`
+ corresponding SQL conditionals in `asset-repo.list()`. Zod schema
update on `AssetListQuerySchema`. Tags filter = SQL LIKE on the JSON
array (v1.1+ can add a proper tags table + index; see `schema.sql`
comment on the `tags` column).

Frontend work: `AssetFilterBar.tsx` grows the new chips; `Gallery.tsx`
state bag + filter params pass-through.

Estimated LOC: ~300 backend + ~400 frontend + ~150 tests = ~850 LOC.

### Option C — **Phase 5 Step 4: Profile CMS** (7–9 hours)

Full CRUD UI for AppProfile (list / view / create / edit / delete) +
optimistic concurrency (Session #15's `expectedVersion` contract), +
logo/badge/screenshot upload via the existing `/api/profiles/:id/
upload-asset` endpoint, + JSON import/export.

Significant — almost certainly won't land with comprehensive gates in
one session. Pre-align Qs similar to 27/27a density (10+ Qs on CRUD
flow, conflict UX, validation UX, etc.).

## Carry-forwards (status)

| # | Source | Item | Status |
|---|---|---|---|
| 1 | 27a-CF#1 | HTTP capability test (needs live key) | still deferred |
| 2 | 27a-CF#2 | `EDIT_REQUIRES_PROMPT` cleanup | ✅ done Session #27b |
| 3 | 27a-CF#3 | Legacy profileSnapshot decision | ✅ locked at "edit disabled + tooltip" |
| 4 | 27a-CF#4 | `replay-service.ts` LOC split | ✅ done Session #27b (now 257 LOC — 7 over new soft cap) |
| 5 | 26-CF#1 | Component + hook tests (needs jsdom) | still deferred |
| 6 | 26-CF#2 | `RATE_LIMIT` error code | still deferred |
| 7 | 26-CF#4 | Visual UI smoke Step 2 | **→ Option A** |
| 8 | 27b-new | `replay-service.ts` now 257 LOC | split history block to own file if extending |
| 9 | 27b-new | Visual UI smoke Step 5b | **→ Option A** |
| 10 | 27b-new | Tree view via parentHistoryId | polish backlog |
| 11 | 27b-new | Side-by-side diff panel | polish backlog |
| 12 | 27b-new | PromptLab standalone entry | Phase 6 polish |

## v2 schema trigger watch (no action needed)

Per PLAN §10 Step 6: `AppProfileSchema` bumps to v2 only when a breaking
field change lands. None fired in Session #27b. Trigger list:
- New required field on AppProfile
- Removal of a field clients depend on
- Semantic change to `visual.*` color fields (outside hex)

If a Session #28 Step 3/4 change needs a v2 bump, author the migration +
update `profileVersion` stamp in `persistProfile` + re-run legacy asset
backfill. Otherwise skip.

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits up-front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro before firing.
- Show evidence before claiming done (HANDOFF rule #7).

## Session #28 estimate

- **Option A** (visual smoke batch): 60-90 min. Mostly bro-operated via
  Chrome MCP; agent spins up dev server + records findings + files any
  bugs found as dedicated carry-forwards.
- **Option B** (Step 3 Gallery filters): 5-7 hours assuming Qs pre-align
  in <30 min. Not bundle-able with Option A in one session.
- **Option C** (Step 4 Profile CMS): realistically a standalone session.

Bro picks at Session #28 kickoff.

---

*Session #27b closed 2026-04-24 — Phase 5 Step 5 (5a + 5b) CLOSED. Next:
visual smoke batch OR Step 3 Gallery filters OR Step 4 Profile CMS.
Handoff file = `HANDOFF-SESSION28.md` (this file).*
