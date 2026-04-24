# Session #32 Handoff — Phase 6 single-session close-out

Paste at the start of Session #32 to resume cleanly on any PC.

Session #31 closed Phase 5 Step 6 (AppProfileSchema v2 migration +
preserve-edits-on-409 UI). Phase 5 all steps shipped.

**Session #32 = Phase 6 single-session close-out.** Drain the polish
backlog in one pass so v1 is ship-ready end of session. ~6-8 hours
focused work. No option-picker — scope locked at kickoff via the
pre-alignment Qs below.

---

## Where we stopped (end of Session #31 — 2026-04-24)

- **Phase 5 CLOSED ✅** — all 8 steps (1/2/3a/3b/4/5a/5b/6) shipped.
  v1 feature-complete: 4 workflows (Gemini NB Pro/Flash + Imagen 4),
  provider-key mgmt + health cache, cost tracking, replay
  API+UI, Gallery filters (8 facets + chips + URL sync), Profile CMS
  (CRUD + editor + delete state machine + export), PromptLab (editor
  + diff + history), schema v2 + preserve-edits-on-409.
- **Regression at S#31 close: 676 pass / 2 failed (CF#27 flake) /
  10 skipped / 1 todo / 689 total.** Isolated retry on the failed
  tests: 10/10 pass. CF#27 is the one infra bug blocking a clean
  full-regression run.
- **Git tree:** 3 Session #31 commits on top of `154112e`:
  - `bf07738 feat(profile-schema): Phase 5 Step 6 — v2 migration …`
  - `f47f1e0 feat(migrate): scripts/migrate-profiles-v1-to-v2.ts …`
  - `86e8da7 feat(cms): preserve-edits-on-409 UI + Session #31 close`
  - Plus a reframe commit for this handoff (tail of S#31 chain).
  NOT YET PUSHED. Run `git log --oneline -10` post-pull to confirm.

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.
Node 20 via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -10    # expect 4 Session #31 commits on top of 154112e
npm install
npm run regression:full  # expect 676 pass / 689 total; 2 CF#27 flake acceptable
```

## Phase status post-#31

| Phase | Scope | Status |
|---|---|---|
| 1 | Core runtime boundary + Hono + SQLite + asset store | ✅ v2.x |
| 2 | Template extraction + determinism | ✅ |
| 3 | Key mgmt + profiles + CRUD + watermark + workflows + SSE | ✅ |
| 4 | Provider adapters (Gemini + Vertex) + cost + compatibility + live smoke | ✅ |
| 5 | Replay + Gallery filters + Profile CMS + PromptLab + v2 schema | ✅ S#25-31 |
| **6** | **v1 ship polish — drain backlog + release close-out** | **Session #32 target** |

## Phase 6 scope — single session, 6-8 hours

Bundle the polish CFs that must land before v1 ship. Structure:

### F1 — CF#27 parallel ENOTEMPTY race fix (MUST ship first) — ~1h

4 tests (`edit-and-run` / `replay-route` / `workflows-full` /
`workflows-routes`) race each other's `afterEach` rmSync on
`data/assets/{profile}/{date}/` under parallel workers. Solo-isolated
10/10 pass; parallel 2 fail.

**Recommended fix:** retry-with-backoff wrapper in each test's
`afterEach` cleanup (3 attempts, 50ms backoff). Alternative: isolate
the 4 to a single `poolOptions.threads.singleThread: true` group in
`vitest.config.ts`. Retry is cheaper + doesn't leak into unrelated
tests. Unblocks every future full-regression run.

### F2 — CF#26 `/api/profiles/:id/export` endpoint deprecation — ~30min

Unused post-S#30 (F4 client-wrap uses `GET /:id` directly). Delete
the route, drop its coverage in `profiles-routes.test.ts`, remove
stale header-comment reference. Clean backend-only diff.

### F3 — CF#16 Custom date picker for Gallery filter bar — ~2h

4-radio preset (today / 7d / 30d / all) covers common cases but power
users can't pick arbitrary ranges. Add a `FilterBarDateSection`
custom picker — two date inputs (`<input type="date">`) wired to the
existing filter schema's `dateFrom`/`dateTo` fields (already present
in schema, just not exposed in UI). URL sync round-trip pattern
already covered by `gallery-filter-url.ts`.

### F4 — CF#19 Tag autocomplete + `/api/assets/tags` distinct endpoint — ~2h

Free-text entry works but users don't discover existing tags. Ship:

- New route `GET /api/assets/tags` returning
  `{ tags: Array<{ tag: string; count: number }> }` — SELECT DISTINCT
  against the JSON `tags` column (same LIKE-scan layer as filter;
  DECISIONS §C1 post-v1 trigger not tripped yet).
- Hook `useAssetTags()` that fetches + caches per session.
- `FilterBarTagsSection` autocomplete dropdown — existing free-text
  input becomes a combobox with matching suggestions; Enter/comma/Tab
  still commit.

### F5 — CF#12 PromptLab standalone entry — ~1h

Currently only reachable via `AssetDetailModal → [Edit & replay]`.
Add TopNav entry "PromptLab" → routes to `/promptlab` without a
seed asset. Empty state prompts "Pick a source asset from Gallery
or Replay to start editing." `navigator.Page` extension + TopNav +
PromptLab empty-state branch.

### F6 — Session close + ship-readiness checklist — ~30min

- Final regression run (expect 676 + new tests from F1-F5, minus
  CF#27 flake which F1 removed).
- Live smoke (`test:live:smoke-all`) — confirm 11 pairs still pass.
  Billable; ~$0.92 budget. Run ONLY with bro's explicit go.
- PHASE-STATUS.md — Phase 6 row filled, "v1 READY" declared.
- DECISIONS.md §G — Phase 6 rationale (why these 5, why now).
- HANDOFF-SESSION33.md — post-ship support plan (bug-fix flow,
  deferred feature list for v2+ roadmap).
- Commit chain: ~5 commits (one per F) or 2 bundled commits
  (infra+backend / frontend+docs) — bro picks at kickoff.

## Out of scope (explicitly deferred to v2+ roadmap)

| # | Item | Rationale |
|---|---|---|
| 1 | HTTP capability test (needs live key) | Keep 11-pair live smoke as coverage floor. |
| 5 | Component + hook tests (needs jsdom) | Preview MCP smoke is the v1 substitute. |
| 6 | `RATE_LIMIT` error code | Not observed in dogfood; add when real. |
| 7/9/18 | Office visual-smoke passes | Already bro self-smoke cadence. |
| 8 | `replay-service.ts` 257 LOC cap | 7 LOC over soft cap; not load-bearing. |
| 10 | Tree view via parentHistoryId | Linear list is usable; tree polish is v2+. |
| 11 | Side-by-side diff panel | Inline word-diff is usable; line-level is v2+. |
| 14 | Cursor-based pagination migration | Offset works to ~10k assets; v2+ trigger. |
| 15 | `asset_tags` JOIN table | DECISIONS §C1 dogfood trigger not tripped. |
| 17 | Gallery DOM mount test | URL round-trip unit covers contract. |
| 21 | Profile import UI | Client round-trips export; manual import via disk copy works for v1. Ship when a real user hits it. |
| 22 | 3-way merge UI | Preserve-edits solves the common case; 3-way is v3 schema territory. |
| 23 | Bulk profile operations | <10 profiles in dogfood — trigger not tripped. |
| 24 | Profile list search/filter | Trigger was ">15 profiles"; not tripped. |
| 25 | Read-only profile view route | Share via export envelope works for v1. |

Explicit deferral list = "v2+ roadmap seed". Next real feature scope
emerges from bro's dogfood findings post-v1.

## v3 schema trigger watch (unchanged from S#31)

Phase 6 does NOT touch AppProfileSchema. Triggers for a v3 migration
remain:

- New required field on AppProfile
- Removal/rename of field clients depend on
- Semantic change to `visual.*` color fields outside hex
- Any other shape change to storage schema

Pattern for v3 when triggered — see `DECISIONS §F.1`.

## Pre-alignment Qs for Session #32 kickoff

- **Q-32.A** Phase 6 scope confirm: F1-F5 bundle (CF#27 flake + CF#26
  deprecation + CF#16 date picker + CF#19 tag autocomplete + CF#12
  PromptLab entry) + F6 close? Or swap any of F2-F5 for another CF
  (CF#10/11/21/24/25 are the other short-effort candidates)?
- **Q-32.B** F1 fix shape: retry-with-backoff in each test's
  `afterEach` (recommended, 3 attempts × 50ms) vs single-thread pool
  for the 4 race-prone tests vs mutex around teardown?
- **Q-32.C** F4 endpoint path: `GET /api/assets/tags` (flat) vs
  `GET /api/assets/facets/tags` (under a facets namespace if we
  anticipate more distinct-value endpoints later — e.g.
  `facets/providers`, `facets/models`)?
- **Q-32.D** F5 PromptLab empty state: CTA to `/gallery` or inline
  asset-picker (a dropdown fetched from `/api/assets?limit=20`)?
- **Q-32.E** F6 live smoke: run or skip? Billable $0.92. Skip-safe
  if no provider-surface changes land in F1-F5 (none planned).
- **Q-32.F** Commit grouping: 5 per-F commits vs 2 bundled
  (infra+backend F1+F2+F4 / frontend+docs F3+F5+F6)?

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN / DECISIONS §F (S#31) / DECISIONS §G (S#32 new) when
  creating files.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits
  up-front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro.
- Show evidence before claiming done (HANDOFF rule #7).
- **Preview MCP smoke required** for any UI surface change
  (F3/F4/F5 all touch UI). Pattern locked in Session #31.

## Session #32 estimate

- **F1 flake fix**: ~1h
- **F2 endpoint deprecation**: ~30min
- **F3 date picker**: ~2h
- **F4 tag autocomplete**: ~2h
- **F5 PromptLab entry**: ~1h
- **F6 close + smoke + docs**: ~30min

Total: **~7 hours** focused. Budget 8h for safety + Preview MCP
rounds + commit discipline. Single-session ship.

If bro's time window is shorter: drop F3 or F4 (they're parallelable
from each other but both meaningful UX gaps). F1+F2+F5+F6 is the
~3-hour minimum viable Phase 6.

---

*Session #31 closed 2026-04-24. Next: Session #32 = Phase 6
single-session v1 ship polish (F1 flake + F2 deprecation + F3 date
picker + F4 tag autocomplete + F5 PromptLab entry + F6 close).
Handoff file = `HANDOFF-SESSION32.md` (this file). Post-Session #32,
write HANDOFF-SESSION33.md for post-ship support flow.*
