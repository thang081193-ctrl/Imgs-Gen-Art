# Session #41 Handoff — Phase C1 Policy schema + hand-curated seed

Paste at the start of S#41 to resume cleanly on any PC. Backend-only
session per PLAN-v3 §7 row 5. C1 scope = **schema + loader + seed**;
scraper (C2 = S#42) and enforcement (C3 = S#43) are out-of-scope.

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #40 — 2026-04-25)

- **Phase B2 frontend shipped + committed.** Commit `11d2d17` on `main`
  (NOT yet pushed; local main ahead 3). 13 files, +1886 / −40.
- **Regression:** **843 pass / 13 skipped / 1 todo / 857 total** (vs
  S#39 baseline 811/825 → +32 from 14 hooks + 15 panel + 3 integration).
- **What landed (B2):**
  - `src/client/api/prompt-assist-hooks.ts` — 3 state-machine hooks
    (`useReverseFromImage` / `useIdeaToPrompt` / `useTextOverlayBrainstorm`)
    + typed `PromptAssistError` + `parseOverlayLines` helper.
  - `src/client/components/prompt-assist/` — 5 components: Panel
    (collapsible, 3 tabs), Pill, Dropzone (HTML5 drag/drop, 5 MB cap),
    IdeaForm (textarea + lane select), OverlayModal (parses 5 [tone]
    lines + Use-as-prompt action).
  - `src/client/utils/active-profile.ts` — `localStorage.activeProfileId`
    slot + CustomEvent-driven `useActiveProfileId` hook.
  - `Profiles.tsx` — ★ icon button per row to set / clear active.
  - `PromptLab.tsx` — panel mounted on right rail top, DiffViewer
    pushed to middle column under PromptEditor (Q-40.B). PromptEditor
    gains `prefillRequest` prop (nonce-based) so "Use this prompt"
    populates editor textarea (Q-40.D wired properly — handoff claim
    "zero new wiring" was wrong; +13 LOC delta).
- **Decisions locked S#40** (PLAN-v3 §J entries to add): Q-40.A through
  Q-40.J (B2 layout + UX + hook shapes). Q-40.K resolved — Profiles
  page got the missing wire-up.
- **Visual smoke skipped** — preview MCP host-env bug (better-sqlite3
  ABI mismatch) recurred; tried 2 launch.json variants (absolute Node
  20 path, cmd.exe .bat wrapper with PATH prepend) → both failed
  because npm/concurrently → tsx.cmd shim re-resolves PATH-default
  Node. Memory `preview_mcp_node_env.md` updated with retry log.
  **Integration test** mounts real PromptLab + verifies suggest →
  editor textarea via `prefillRequest` nonce, so React-level wiring
  is proven. Bro can manually verify visual via `fnm exec --using=20
  bash -lc "npm run dev"` if desired before S#41.

## Current repo state (verify before firing C1)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main                      # if pushed; else just git log
git log --oneline -4                      # expect 11d2d17 (S#40 B2) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 843 / 857 (or 843 + N new C1 tests)
```

Current policy-rules state: **nothing exists yet**. `policy-rules/`
directory is greenfield. `batches.policy_decision_json` column does
not exist yet (Q-37.I locked the spec but no migration shipped).
`settings` table exists (S#37 created it) but no policy keys are
seeded — `policy_rules.lastScrapedAt` slot is open.

---

## Priority pick — S#41: Phase C1 Policy schema

### Goal

Lock the policy-rule data shape + load path. Ship the directory
layout (`policy-rules/scraped/` + `policy-rules/hand-curated/`) with
hand-curated seed JSON for all 3 platforms, the `PolicyRule` Zod
schema, the boot-time loader/merger, and the audit-trail column on
`batches`. **No scraping, no enforcement, no UI.** When S#42 lands,
the scraper just writes into the directory the loader already
expects.

### Deliverables

1. **Schema** — `src/core/schemas/policy-rule.ts` (NEW). Zod schema
   matching PLAN-v3 §4.1:
   - `PolicyPattern` discriminated union — 6 kinds locked in §4.1.1
     (`text-area-ratio` / `keyword-blocklist` / `aspect-ratio` /
     `file-size-max` / `resolution-min` / `claim-regex`).
   - `PolicyRule` object — `id`, `platform` (`'meta'|'google-ads'|'play'`),
     `format?`, `category`, `description`, `severity` (`'warning'|'block'`),
     `pattern`, `sourceUrl?`, `lastReviewedAt`, `source` (`'scraped'|
     'hand-curated'`).
   - `PolicyRuleFileSchema` — wrapper `{ scrapedAt?, rules: [...] }` for
     scraped; `{ rules: [...] }` for hand-curated.
2. **Hand-curated seed** — `policy-rules/hand-curated/`:
   - `meta.json` — 3-5 stub rules (text density, claim regex, aspect
     ratio for feed/reels). Stamped `source: 'hand-curated'`,
     `lastReviewedAt: 2026-04-25`.
   - `google-ads.json` — 3-5 stub rules (keyword blocklist, file-size
     max, resolution-min for responsive display).
   - `play-aso.json` — 3-5 stub rules (screenshot aspect, store-page
     keyword blocklist, file-size).
   - Q-41.D: stubs not deeply researched — just enough to exercise
     each `PolicyPattern` kind end-to-end. Real rules harvest in C2
     (scraper) + manual review.
3. **Loader + merger** — `src/server/services/policy-rules/loader.ts`
   (NEW):
   - `loadPolicyRules(): Map<platform, PolicyRule[]>` — read both
     layers, validate via Zod, merge per §4.2 (hand-curated wins on
     `id` collision; union otherwise). Cache in-memory; refresh
     callable via `refreshPolicyRules()`.
   - `getPolicyRules(platform): PolicyRule[]` — convenience reader.
   - On id collision **within the same layer** (e.g. two scraped
     rules both `meta-ads-text-density-001`) → throw at load time
     (Q-41.H). Across layers → silent override.
4. **Cache file** — `policy-rules/merged.cache.json` is a build/boot
   artifact (Q-41.E: gitignore it). Loader writes after a successful
   merge so other tools (lint, future CI) can read without re-loading
   sqlite/repo.
5. **Migration** — `scripts/migrations/2026-04-25-policy-decisions.sql`
   (NEW):
   - `ALTER TABLE batches ADD COLUMN policy_decision_json TEXT NULL`.
   - Seed `settings` row: `INSERT OR IGNORE INTO settings (key, value)
     VALUES ('policy_rules.lastScrapedAt', '')` so C2's bi-weekly
     check has a slot.
   - No `-- @no-fk-checks` directive needed — column add is FK-safe.
6. **Tests:**
   - `tests/unit/policy-rule-schema.test.ts` — Zod validation: every
     `PolicyPattern` kind round-trips, missing required fields fail,
     unknown `severity` fails, etc. ~120 LOC.
   - `tests/unit/policy-rules-loader.test.ts` — loader merges
     correctly: hand-curated overrides scraped on id, union otherwise,
     same-layer id collision throws, missing layer files = empty
     array. ~140 LOC.
   - `tests/integration/policy-decisions-migration.test.ts` —
     migration adds the column, seed key lands in settings, loader
     reads the seed JSON files end-to-end on a fresh DB. ~80 LOC.

### LOC budget

| File | Budget |
|------|--------|
| core/schemas/policy-rule.ts                           | ~110 |
| server/services/policy-rules/loader.ts                | ~130 |
| server/services/policy-rules/index.ts                 | ~15  |
| policy-rules/hand-curated/meta.json                   | ~60  |
| policy-rules/hand-curated/google-ads.json             | ~60  |
| policy-rules/hand-curated/play-aso.json               | ~60  |
| scripts/migrations/2026-04-25-policy-decisions.sql    | ~10  |
| .gitignore (delta — add merged.cache.json)            | +1   |
| tests/unit/policy-rule-schema.test.ts                 | ~120 |
| tests/unit/policy-rules-loader.test.ts                | ~140 |
| tests/integration/policy-decisions-migration.test.ts  | ~80  |
| **Total**                                             | **~786 LOC across 11 files** |

All source files ≤ 250 soft cap. Heaviest = `loader.ts` (130). JSON
seed files don't count toward LOC budget materially.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-41.A — Where does `policy-rules/` live**
- *Pre-filled:* repo root, alongside `data/`, `scripts/`, `vendor/`.
  Treats it like `data/templates/` — content the app reads at boot but
  not source code. Deploy artefact = ship the dir.
- *Alternative A:* `src/server/services/policy-rules/seed/` — keeps
  it next to the loader. Works but mixes data into source tree (we
  already split data out for templates/profiles).
- *Alternative B:* `data/policy-rules/` — co-locates with other
  bro-curated data. Symmetrical with `data/templates/` precedent.
- *Recommend:* `data/policy-rules/` (alternative B) — matches the
  existing `data/templates/` precedent, signals "bro-edits-this".
  Adjust loader + seed paths if bro picks this.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.B — `cheerio` dep**
- *Pre-filled:* **defer**. Cheerio only needed for the scraper (C2 =
  S#42). C1 just locks the schema + loader; no HTML parsing. Saves a
  dep bump this session; dep request happens at S#42 start with bro's
  approval per "no new deps without asking" rule.
- *Recommend:* defer.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.C — `settings` table seed strategy**
- *Pre-filled:* one new row in this migration:
  `('policy_rules.lastScrapedAt', '')` — empty string sentinel for
  "never scraped". C2 banner logic checks `value === '' || (now -
  parseISO(value)) > 14 days`.
- *Alternative:* don't seed; C2 inserts the row first time. Riskier —
  if C2 ships before the row exists, the bi-weekly check has no slot
  to read.
- *Recommend:* seed in migration.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.D — Hand-curated seed depth**
- *Pre-filled:* 3-5 stub rules per platform, picked to **exercise
  every PolicyPattern kind** end-to-end (so loader + future
  enforcement smoke tests have real data). Stubs flagged with
  `description: "stub - replace with researched rule (C2)"` so bro
  can grep + replace when scraper-fed real data lands.
- *Alternative:* zero stubs, only the schema. Cleaner but loader test
  has nothing meaningful to load.
- *Recommend:* 3-5 stubs per platform.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.E — `merged.cache.json` gitignored**
- *Pre-filled:* yes, gitignore. It's a derived artefact; loader
  rewrites on every boot. Committing it would create merge-conflict
  hell when scraper updates land.
- *Recommend:* gitignore.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.F — `batches.policy_decision_json` column type**
- *Pre-filled:* `TEXT NULL`. Stored as JSON string; reader does
  `JSON.parse()` lazily. Matches existing pattern (e.g.
  `replay_payload_json`).
- *Recommend:* `TEXT NULL`.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.G — Zod schema strictness**
- *Pre-filled:* `z.object({...}).strict()` for `PolicyRule` —
  unknown keys throw. Rationale: hand-curated JSON is bro-edited;
  catching typos at load time beats silent mis-mergers later.
  Scraper output goes through the same gate, so a scraper bug that
  emits extra fields surfaces immediately.
- *Alternative:* permissive (default) so future fields don't break
  old rule files. Trade-off: typos slip through.
- *Recommend:* strict, with bumped schema version when fields are
  added.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.H — Same-layer id collision policy**
- *Pre-filled:* throw `PolicyRulesLoaderError` at load time. Bro's
  hand-curated file with two `meta-ads-text-density-001` entries is
  a typo, not intent. Across layers (hand-curated overrides scraped
  on the same id) is intentional and silent.
- *Recommend:* throw within layer; silent across layers.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.I — Loader caching strategy**
- *Pre-filled:* in-memory map, populated once at module load.
  `refreshPolicyRules()` exposed for C2's "rescrape" handler to
  invalidate without a server restart. No file-watching (overkill
  for v2; bro restarts dev server when editing hand-curated JSON).
- *Recommend:* in-memory cache with explicit refresh.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.J — Where loader is called from**
- *Pre-filled:* lazy on first `getPolicyRules(platform)` call (NOT
  app boot). Reasons: (1) avoid coupling app boot to disk I/O for a
  feature C2/C3 hasn't shipped yet; (2) tests can mount the app
  without real seed JSON. C2 banner check + C3 enforcement both
  trigger the lazy load via `getPolicyRules`.
- *Recommend:* lazy.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-41.K — Carry-forward push from S#39 / S#40**
- Local main is **ahead 3** (175b9d4 + e66fd6a + 11d2d17). Bro wants
  to push to origin at S#41 start (after regression confirms green),
  or hold pushing until C-phase landing? PLAN-v3 doesn't gate on
  push.
- *Recommend:* push at S#41 start to keep origin honest.
- **STATUS: OPEN — bro decide before firing C1.**

---

## Estimate

- S#41 scope: **~1h** per PLAN-v3 §7.
- Pre-align Qs: ~5 min (bro skim Q-41.A/B/C/D/E/F/G/H/I/J + decide K).
- Schema (1 file): ~15 min.
- Loader + index (2 files): ~15 min.
- Hand-curated seed JSON (3 files): ~10 min.
- Migration: ~5 min.
- Tests (2 unit + 1 integration): ~20 min.
- Regression + commit: ~5 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. **No new runtime deps without asking** —
  expected new deps: zero (cheerio defers to C2).
- Show evidence before claiming done (HANDOFF rule #7) — for C1
  that means: regression green + loader test loads real seed JSON
  end-to-end + migration test confirms `batches.policy_decision_json`
  column exists on a fresh DB.
- Node: `fnm exec --using=20 bash -lc "…"`.
- C1 is backend-only — no preview MCP needed.

---

## Carry-forward (defer unless C1 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment (cosmetic).
6. Split hooks.ts (256 LOC, 6 over soft cap).
7. **From S#39:** consolidate provider-agnostic seam doc into
   PLAN-v3 §3 (currently §3 still says `services/grok.ts`; should
   point to `services/llm/` + `services/prompt-assist/`).
8. **From S#40:** preview MCP host-env bug retry log added to memory;
   no fix attempted further. If bro wants a real fix, it's likely
   `npm rebuild better-sqlite3` against the system Node version with
   a Visual Studio C++ toolchain installed — out of scope per
   `preview_mcp_node_env.md`.
9. **From S#40:** hand-curated → AI-curated diff workflow (shows what
   the scraper added between two scrapes for bro to approve) — UX
   sketch only, lands in C2 or D-phase if requested.

## Out of scope (this session)

- Scraper (C2 = S#42 — `scripts/scrape-policy-rules.ts` + cheerio dep).
- Bi-weekly banner UI (C2 frontend — Home banner).
- `POST /api/policy-rules/rescrape` endpoint (C2).
- `checkPolicy()` enforcement function (C3 = S#43).
- Wizard Step 4 preflight badge (C3 frontend).
- Audit-trail blob writers (C3 — when batches finalize).
- Override dialog UX (C3).
- Any Meta Ads / Google Ads / ASO wizard work (D/E/F sessions).

---

## Remaining sessions after S#41 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 6 | S#42    | **C2 Scraper + ping**       | 2h  |
| 7 | S#43    | **C3 Enforcement + audit**  | 2h  |
| 8 | S#44    | **D1 Meta Ads backend**     | 2h  |
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after C1:** ~14.5h across 7 sessions. PLAN-v3
closes after S#48 + 1 week of bro dogfooding.

---

*Session #40 closed 2026-04-25 with B2 frontend shipped + committed:
843/857 green, commit `11d2d17` on local main (push pending bro
authorization — 3 commits ahead). S#41 = Phase C1 Policy schema per
PLAN-v3 §7 row 5. Pre-align Qs pre-filled — bro skim + fire. Next:
HANDOFF-SESSION42.md for C2 Scraper + ping drafted at S#41 close.*
