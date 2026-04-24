# Session #32 Handoff — Phase 5 closed, polish backlog phase begins

Paste at the start of Session #32 to resume cleanly on any PC.

Session #31 shipped Step 6 — AppProfileSchema v2 migration (migration-
on-read via `z.union` + `.transform`) + preserve-edits-on-409 UI
(banner state machine + Overwrite & Save + Discard with confirm).
Phase 5 is now fully CLOSED (steps 1/2/3a/3b/4/5a/5b/6).

Session #32 is therefore pure polish selection: bro picks 2-3 CFs
from a drained backlog, or kicks off Phase 6 (if Phase 6 scope is
defined by then — not yet as of Session #31 close).

---

## Where we stopped (end of Session #31 — 2026-04-24)

- **Phase 5 Step 6 CLOSED ✅** — 3 new files / 9 modified / 1 test
  comment only / +1 package.json script. 5 new unit tests (union
  schema) + 1 real-409 integration test (two-tab refetch + Overwrite).
  Preview MCP smoke verified the banner + Overwrite + Discard +
  confirm copy end-to-end with a throwaway `zz-mcp-smoke` profile
  (204 cleanup at close).
- **Migration pattern locked for v3+** — `AppProfileBodyFields`
  exported as version-agnostic base; each `V{N}Schema` extends it;
  union + transform pipeline at `AppProfileSchema` level. Consumers
  get latest output type via `z.output<...>`.
- **Regression: 676 pass / 2 failed (CF#27 flake) / 10 skipped / 1
  todo / 689 total.** +6 net vs Session #30 baseline. Parallel
  ENOTEMPTY race in `tests/integration/replay-route.test.ts`
  surfaced on the full run (isolated 10/10 pass) — CF#27 is now
  the top polish candidate for Session #32.
- **Git tree:** Session #31 commits pending — NOT YET PUSHED. Run
  `git log --oneline -8` post-pull to confirm alignment with origin
  and expect 3 new commits on top of `154112e` (Session #30 close).

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.
Node 20 via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -10    # expect 3 Session #31 commits on top of 154112e
npm install
npm run regression:full  # expect 676 pass / 10 skipped / 1 todo / 689 total
```

Expected flake: parallel ENOTEMPTY in `replay-route.test.ts`. If it
surfaces, re-run — or isolate via
`npx vitest run tests/integration/replay-route.test.ts` (10/10 pass
solo). CF#27 fixes this at the `afterEach` layer — strong candidate
for Session #32 Option B.

On-disk migration sanity: optionally run once to converge data dir —
`npm run migrate:profiles-v1-to-v2`. For v2a the transform is
identity, so re-runs report `noop=3` on seeded data.

## Phase 5 status post-#31

| Step | Title | Status |
|---|---|---|
| 1 | Replay API | ✅ #25 |
| 2 | Replay UI | ✅ #26 |
| 3a | Filter schema + SQL builder backend | ✅ #28a |
| 3b | Gallery filter UI | ✅ #29 |
| 4 | Profile CMS | ✅ #30 |
| 5a | Canonical payload migration + mode=edit backend | ✅ #27a |
| 5b | PromptLab UI | ✅ #27b |
| 6 | AppProfileSchema v2 migration + preserve-edits UI | ✅ #31 |

**Phase 5 CLOSED.** Session #32 is the first polish-backlog session.

## Session #32 scope — two candidates

### Option A: Polish batch (bro picks 2-3 CFs)

Remaining backlog (CF#10-27, some dropped mid-Session #31 since no
longer load-bearing):

| # | Item | Effort | Notes |
|---|---|---|---|
| 27 | **Parallel test cleanup ENOTEMPTY race fix** | ~1h | Top candidate. Surfaced on every full regression run. Isolated retry proves tests are correct; race is in `afterEach` rmSync concurrent teardown of `data/assets/{profile}/{date}/` across parallel workers. Fix options: mutex around teardown, retry-with-backoff in `afterEach`, or isolate the 4 known tests to a single pool. |
| 26 | `/api/profiles/:id/export` backend endpoint deprecation | ~30min | Unused post-#30 (F4 client-wrap uses `GET /:id` directly). Drop the route + one integration test teardown. Clean backend-touching commit. |
| 16 | Custom date picker for Gallery filter bar | ~2h | CF#16. 4-radio preset UX limits power users to today/7d/30d/all. |
| 19 | Tag autocomplete + `/api/assets/tags` distinct endpoint | ~2h | CF#19. Free-text entry works but users don't discover existing tags. |
| 11 | Side-by-side diff panel in PromptLab | ~2h | CF#11. Current inline `diff-words` is word-level; side-by-side reads better at the line level. |
| 10 | Tree view via `parentHistoryId` in PromptLab history sidebar | ~3h | CF#10. Linear list loses branch structure. |
| 12 | PromptLab standalone entry point | ~1h | CF#12. Currently only reachable via AssetDetailModal → [Edit & replay]. |
| 21 | Profile import UI | ~3h | CF#21. Sibling to F4 export. Validates `{schemaVersion, profile, notes}` envelope + resolves asset-ID gap. |
| 22 | 3-way merge UI for profile conflicts | ~4h | CF#22. v2+ polish. |
| 23 | Bulk profile operations (multi-select delete/export) | ~2h | CF#23. |
| 24 | Profile list search/filter (>15 profiles trigger) | ~1.5h | CF#24. |
| 25 | Read-only profile view route (shareable permalink) | ~1.5h | CF#25. |

Estimate: bundle = 4-6 hours per bro's picks. Recommend starting
with CF#27 since it unblocks every future regression run.

Still-deferred (not bumped into Session #32 candidate list unless
bro pulls):

- **CF#1** HTTP capability test (needs live provider key)
- **CF#5** Component + hook tests (needs jsdom)
- **CF#6** `RATE_LIMIT` error code
- **CF#7 / #9 / #18** Visual UI smoke at office (bro self-smoke)
- **CF#8** `replay-service.ts` 257 LOC over soft cap
- **CF#14** Cursor-based pagination migration
- **CF#15** Tag `asset_tags` JOIN table (post-v1 dogfood trigger)
- **CF#17** Full Gallery DOM mount test (needs jsdom)
- **CF#20** Preserve-edits on 409 — **RESOLVED in Session #31 as Step 6**

### Option B: Phase 6 kickoff

Phase 6 scope is not yet defined. If bro wants to push forward, this
session would be a scoping session — review dogfood findings +
refinements from real profile usage + land a PLAN doc for Phase 6.

Estimate: 1-2 hours of scoping + optional deferred-feature selection.
Best if bro has accumulated 2+ weeks of dogfood input since Session
#28.

### Option C: Mixed — CF#27 flake fix + 1 fast CF

Lightest option. Kill the parallel flake (unblocks every regression
run) + knock out one of CF#26 / CF#12 / CF#24. ~2-3 hours total.

**Recommendation:** Option A with CF#27 first, then bro-pick 1-2 more.
Phase 5 is closed; dogfood-driven polish is the highest-ROI work
right now. Option B (Phase 6 kickoff) is best saved until there's
concrete scope from real usage.

## Carry-forwards (status at end of Session #31)

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
| 12 | 27b-new | PromptLab standalone entry | polish backlog |
| 14 | 28a-new | Cursor-based pagination migration | Session #32+ |
| 15 | 28a-new | Tag `asset_tags` JOIN table (DECISIONS §C1) | post-v1 dogfood trigger |
| 16 | 28a-new | Custom date picker | polish backlog |
| 17 | 29-new | Full Gallery DOM mount test (needs jsdom) | covered by URL round-trip unit |
| 18 | 29-new | Visual UI smoke Step 3b | bro self-smoke at office |
| 19 | 29-new | Tag autocomplete + `/api/assets/tags` distinct endpoint | polish backlog |
| 20 | 30-new | Preserve-edits on 409 VERSION_CONFLICT | ✅ RESOLVED (Session #31 Step 6) |
| 21 | 30-new | Profile import UI | polish backlog |
| 22 | 30-new | 3-way merge UI for profile conflicts | v2+ polish |
| 23 | 30-new | Bulk profile operations (multi-select delete/export) | polish backlog |
| 24 | 30-new | Profile list search/filter (trigger: >15 profiles) | polish backlog |
| 25 | 30-new | Read-only profile view route | polish backlog |
| 26 | 30-new | `/api/profiles/:id/export` backend endpoint deprecation | Session #32 Option A candidate |
| 27 | 30-new | Parallel test cleanup ENOTEMPTY race fix | Session #32 Option B/C top candidate |
| 28 | 31-new | v3 migration pattern test placeholder | activates when v3 lands |

## v3 schema trigger watch

Session #31 established the migration-on-read pattern for v3+ without
adding v3 itself. Triggers that would warrant Session #32+ invoking
a v3 schema migration:

- New required field on AppProfile
- Removal/rename of a field clients depend on
- Semantic change to `visual.*` color fields outside hex
- Any other shape change to the storage schema

Pattern for v3 (see `DECISIONS §F.1`):
1. Add `V3Schema = AppProfileBodyFields.extend({ version: <v3> })`.
2. Extend the union + `migrateToV2` into a pipeline (two
   unidirectional forward-only steps: V1→V2 + V2→V3).
3. Rename + run `scripts/migrate-profiles-v2-to-v3.ts` (idempotent
   one-off).
4. Activate the v3 test placeholder in
   `tests/unit/app-profile-migration.test.ts` — "case 6: migration
   fn fills v3-only required field default".

## Pre-alignment Qs for Session #32 kickoff

- **Q-32.A** Scope pick: Option A (polish batch, bro picks 2-3 CFs) /
  Option B (Phase 6 kickoff — needs dogfood input) / Option C (CF#27
  flake + 1 fast CF)?
- **Q-32.B** If Option A/C: CF#27 first? (unblocks every future
  regression run, cheap to ship). Second pick from the top three:
  CF#26 (export endpoint deprecation, 30min), CF#16 (date picker,
  2h), CF#19 (tag autocomplete, 2h)?
- **Q-32.C** If Option B: what's the dogfood learning batch driving
  Phase 6 scope? Needs a concrete feature list to plan from.

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN / DECISIONS §F section when creating files.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits
  up-front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro.
- Show evidence before claiming done (HANDOFF rule #7).
- **If Session #32 touches any UI — run the Preview MCP smoke before
  declaring done.** Session #31 verified its UI changes this way;
  keep the pattern.

## Session #32 estimate

- **Option A (polish batch 2-3 items)**: 4-6 hours.
- **Option B (Phase 6 scoping)**: 1-2 hours + optional feature land.
- **Option C (CF#27 flake + 1 fast CF)**: 2-3 hours.

Bro picks at Session #32 kickoff.

---

*Session #31 closed 2026-04-24 — Phase 5 Step 6 CLOSED (AppProfileSchema v2
migration via union + transform; preserve-edits-on-409 banner +
Overwrite & Save + Discard state machine). Phase 5 fully closed. Next:
Session #32 Option A/B/C pick. Handoff file = `HANDOFF-SESSION32.md`
(this file).*
