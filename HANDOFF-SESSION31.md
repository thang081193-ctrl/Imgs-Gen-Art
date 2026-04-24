# Session #31 Handoff — Phase 5 close-out candidates

Paste at the start of Session #31 to resume cleanly on any PC.

Session #30 shipped Step 4 (Profile CMS frontend) + three smoke-driven
fixes bundled in. Phase 5 Steps 1/2/3/4/5a/5b all CLOSED. Only **Step 6
(AppProfileSchema v2 migration)** remains, and that's trigger-driven —
only invoke when a real schema surface change forces it.

Session #31 is therefore a scope-choice session: either kick off Step 6
proactively, or drain the Phase 5 polish backlog. Bro picks at kickoff.

---

## Where we stopped (end of Session #30 — 2026-04-24)

- **Phase 5 Step 4 CLOSED ✅** — 15 new client files / 4 modified / 31
  new unit tests / full UI smoke via Claude Preview MCP. 7 pre-code Qs
  locked + 6 audit findings reversed/refined mid-session. F1 reversed
  to defer preserve-edits-on-409 to the Step 6 v2 session
  (unreachable under `version: z.literal(1)`).
- **3 smoke-driven fixes bundled** before commit:
  - ProfileEdit Save semantics split by mode (create always on, edit
    requires dirty) — clone-to-draft Save was erroneously disabled.
  - Gallery now reads `navigator.params.profileIds` for F6 "View in
    Gallery" deep-link (mirrors existing batchId pattern).
  - Pre-existing: `useAssets` `&_=${refreshKey}` cache-buster failed
    Session #28a strict-allowlist → every Gallery asset fetch was 400
    under any filter. Moved refreshKey dedupe to URL fragment
    (`#r=${refreshKey}`). Silent fix for 2-session-old bug.
- **Regression: 672 pass / 10 skipped / 1 todo / 683 total.** +31 net
  vs Session #29 (exactly the new unit cases). Parallel ENOTEMPTY
  flake (handoff CF) didn't surface this run.
- **Git tree:** Session #30 commits pending — NOT YET PUSHED. Run
  `git log --oneline -8` post-pull to confirm alignment with origin.

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`. Node 20
via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -8    # expect Session #30 commits on top of 8a8f48f
npm install
npm run regression:full # expect 672 pass / 10 skipped / 1 todo
```

Parallel-workers flake still may surface — isolate the 4 known tests
if it does (`tests/integration/{edit-and-run,replay-route,workflows-
full,workflows-routes}.test.ts`).

## Phase 5 status post-#30

| Step | Title | Status |
|---|---|---|
| 1 | Replay API | ✅ #25 |
| 2 | Replay UI | ✅ #26 |
| 3a | Filter schema + SQL builder backend | ✅ #28a |
| 3b | Gallery filter UI | ✅ #29 |
| 4 | Profile CMS | ✅ #30 |
| 5a | Canonical payload migration + mode=edit backend | ✅ #27a |
| 5b | PromptLab UI | ✅ #27b |
| 6 | AppProfileSchema v2 migration | **PENDING — trigger-driven** |

## Session #31 scope — two candidates

### Option A: Step 6 kickoff (v2 migration)

Proactively ship the schema v2 migration so preserve-edits-on-409 + any
future schema surface changes have the runway. Scope:

- Bump `AppProfileSchema.version` from `z.literal(1)` to `z.number()`
  with bump-on-mutation in `saveProfile`.
- Migration runner to update existing `data/profiles/*.json` from v1 →
  v2 (`version: 1 → 1` initially, no shape change; bump happens on
  next write).
- Re-open preserve-edits-on-409 UI per original Q-30.E spec: silent
  re-fetch latest, preserve user edits, banner + toast, "Saving will
  overwrite remote version" language.
- Expand integration tests: `profiles-crud.test.ts` gains a real
  version-conflict case (two tabs, race writes, second fails 409).

Estimate: 4–6 hours. Lower risk because the migration surface is
intentionally tiny (one literal → one int + bump). Most effort is in
the new preserve-edits UI.

### Option B: Phase 5 polish batch

Drain the polish backlog. Candidate items (bro picks 2–3):

- Parallel test cleanup race (mutex or retry-with-backoff in
  `afterEach` of the 4 ENOTEMPTY tests). Unblocks reliable parallel
  regression runs. ~1h.
- `/api/profiles/:id/export` backend endpoint deprecation (unused
  post-#30; F4 client-wrap uses `GET /:id` directly). Deletion + one
  integration test teardown. ~30min.
- CF #16 Custom date picker for Gallery filter bar. ~2h.
- CF #19 Tag autocomplete + `/api/assets/tags` distinct endpoint. ~2h.
- CF #11 Side-by-side diff panel in PromptLab. ~2h.
- CF #10 Tree view via `parentHistoryId` in PromptLab history sidebar.
  ~3h.
- CF #12 PromptLab standalone entry (currently only reachable via
  asset modal). ~1h.
- Profile import UI (sibling to F4 export). ~3h.
- Read-only profile view route (shareable permalink without editor
  chrome). ~1.5h.

Estimate: bundle = 4–6 hours per bro's picks.

### Option C: Mixed — smoke-race fix + one polish item

Lightest option. Kill the parallel flake (stops it biting every
regression run) + knock out a quick CF. ~2 hours. Good if bro has a
short window.

**Recommendation:** Option A if bro has 4–6 free hours and is willing
to open the schema. Option C otherwise. Option B is the safest bro-
time-efficient choice if no v2 trigger has surfaced during #30→#31
dogfood.

## Carry-forwards (status at end of Session #30)

| # | Source | Item | Status |
|---|---|---|---|
| 1 | 27a-CF#1 | HTTP capability test (needs live key) | still deferred |
| 5 | 26-CF#1 | Component + hook tests (needs jsdom) | still deferred |
| 6 | 26-CF#2 | `RATE_LIMIT` error code | still deferred |
| 7 | 26-CF#4 | Visual UI smoke Step 2 | bro self-smoke at office |
| 8 | 27b-new | `replay-service.ts` 257 LOC | still over soft cap |
| 9 | 27b-new | Visual UI smoke Step 5b | bro self-smoke at office |
| 10 | 27b-new | Tree view via parentHistoryId | polish backlog |
| 11 | 27b-new | Side-by-side diff panel | polish backlog |
| 12 | 27b-new | PromptLab standalone entry | Phase 6 polish |
| 14 | 28a-new | Cursor-based pagination migration | Session #31+ |
| 15 | 28a-new | Tag `asset_tags` JOIN table (DECISIONS §C1) | post-v1 dogfood trigger |
| 16 | 28a-new | Custom date picker | polish backlog |
| 17 | 29-new | Full Gallery DOM mount test (needs jsdom) | covered by URL round-trip unit |
| 18 | 29-new | Visual UI smoke Step 3b | bro self-smoke at office |
| 19 | 29-new | Tag autocomplete + `/api/assets/tags` distinct endpoint | polish backlog |
| 20 | 30-new | Preserve-edits on 409 VERSION_CONFLICT (Option A Step 6 trigger) | v2 migration session |
| 21 | 30-new | Profile import UI | polish backlog |
| 22 | 30-new | 3-way merge UI for profile conflicts | v2+ polish |
| 23 | 30-new | Bulk profile operations (multi-select delete/export) | polish backlog |
| 24 | 30-new | Profile list search/filter (trigger: >15 profiles) | polish backlog |
| 25 | 30-new | Read-only profile view route | polish backlog |
| 26 | 30-new | `/api/profiles/:id/export` backend endpoint deprecation | next backend-touching session |
| 27 | 30-new | Parallel test cleanup ENOTEMPTY race fix | Option B / C kickoff item |

## v2 schema trigger watch

Session #30 did not touch `AppProfileSchema`. Triggers unchanged:

- New required field on AppProfile
- Removal of a field clients depend on
- Semantic change to `visual.*` color fields (outside hex)
- Preserve-edits-on-409 UI shipping (F1 defer — this is the explicit
  trigger for Option A above)

## Pre-alignment Qs for Session #31 kickoff

- **Q-31.A** Scope pick: Option A (Step 6 v2 kickoff) / Option B (polish
  batch — bro picks 2–3 CFs) / Option C (flake fix + 1 CF)?
- **Q-31.B** If Option B/C: is the parallel flake fix the right first
  item? Unblocks every future regression run, cheap to ship.
- **Q-31.C** If Option A: migration path for existing v1 `.json`
  files — in-place bump vs shadow v2 directory? Recommend **in-place**
  (single-writer, SQLite-style WAL already covers atomicity concerns).
- **Q-31.D** If Option A: preserve-edits UI copy. Bro's original F1
  called for "Server version updated. Your edits preserved. Saving
  will overwrite remote version." Confirm exact wording + CTA?

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN / DECISIONS §E section when creating files.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits up-
  front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro before
  firing.
- Show evidence before claiming done (HANDOFF rule #7).
- **If Session #31 touches any UI — run the Preview MCP smoke before
  declaring done.** Session #30 surfaced 2 real bugs at smoke time that
  unit tests + typecheck missed.

## Session #31 estimate

- **Option A full ship**: 4–6 hours.
- **Option B polish batch (2–3 items)**: 4–6 hours.
- **Option C (flake fix + 1 CF)**: 2 hours.

Bro picks at Session #31 kickoff.

---

*Session #30 closed 2026-04-24 — Phase 5 Step 4 CLOSED (Profile CMS
frontend + 3 smoke-driven fixes). Next: Session #31 Option A/B/C pick.
Handoff file = `HANDOFF-SESSION31.md` (this file).*
