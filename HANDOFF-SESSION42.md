# Session #42 Handoff — Phase C2 Scraper + bi-weekly ping

Paste at the start of S#42 to resume cleanly on any PC. Per PLAN-v3 §7
row 6 (~2h, backend + thin frontend banner). C2 = **change-detection
scraper + freshness ping**; enforcement (C3 = S#43) and audit blob
writers stay out-of-scope.

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #41 — 2026-04-25)

- **Phase C1 shipped + committed.** Commit `a84807e` on `main`. 10 files,
  +990 LOC. Ahead 1 vs origin (only `a84807e` unpushed; older S#40 line
  already on origin via `f49bea8`).
- **Regression:** **876 pass / 13 skipped / 1 todo / 890 total** (was
  843/857 → +33 from 21 schema unit + 12 loader unit).
- **What landed (C1):**
  - `src/core/schemas/policy-rule.ts` (118 LOC) — Zod, `.strict()`,
    discriminated union of 6 PolicyPattern kinds (`text-area-ratio`,
    `keyword-blocklist`, `aspect-ratio`, `file-size-max`,
    `resolution-min`, `claim-regex`). `ScrapedPolicyRuleFileSchema`
    requires `scrapedAt`; `HandCuratedPolicyRuleFileSchema` does not.
  - `src/server/services/policy-rules/loader.ts` (244 LOC) — lazy on
    first `getPolicyRules(platform)` call, in-memory cache + explicit
    `refreshPolicyRules()`, hand-curated overrides scraped silently on
    shared id, same-layer dup throws `PolicyRulesLoaderError`. Asserts
    `rule.platform` matches its file + `rule.source` matches its layer
    dir. Writes `data/policy-rules/merged.cache.json` (gitignored).
  - `src/server/services/policy-rules/index.ts` — barrel.
  - `data/policy-rules/hand-curated/{meta,google-ads,play-aso}.json` —
    4 + 3 + 4 = 11 stubs covering every PolicyPattern kind.
  - `tests/unit/policy-rule-schema.test.ts` (21) — round-trip + strict
    + kebab-case + URL/date validation.
  - `tests/unit/policy-rules-loader.test.ts` (12) — merge precedence,
    same-layer collision, missing layer, source/platform mismatch,
    cache write toggle, refresh re-reads disk, malformed JSON, real
    seed end-to-end.
- **Migration NOT shipped this session** — handoff Q-41.C/F was
  redundant. S#37's `2026-04-25-saved-styles.sql` already added
  `batches.policy_decision_json TEXT` + seeded
  `settings ('policy_rules.lastScrapedAt', '1970-01-01T00:00:00Z')`.
  Verified live on `data/images-gen-art.db` before firing C1.
- **Q-41.* all locked** (PLAN-v3 §J entries to add): Q-41.A (data dir
  layout) → alt B `data/policy-rules/`. Q-41.B → defer cheerio. C/F →
  redundant. D → 3-5 stubs/platform with `stub - replace with researched
  rule (C2)` tag. E → cache gitignored. G → `.strict()`. H → throw
  same-layer; silent cross-layer. I → in-memory + `refreshPolicyRules`.
  J → lazy. K → resolved auto.

## Current repo state (verify before firing C2)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main                      # nothing new on origin if
git log --oneline -5                      # a84807e (S#41 C1) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 876 / 890 (or 876 + N new C2 tests)

# Verify C1 surface area still loads cleanly:
fnm exec --using=20 bash -lc "node -e \"
const { getPolicyRules } = require('./dist/server/services/policy-rules');
console.log('meta', getPolicyRules('meta').length);
\""   # only after npm run build; otherwise run via tsx.
```

`data/policy-rules/scraped/` exists as an **empty dir**; loader returns
empty array per platform until C2 writes the first file. `merged.cache.json`
is regenerated whenever the loader runs.

---

## Priority pick — S#42: Phase C2 Scraper + ping

### Goal

Ship the change-detection scraper that fetches each platform's public
policy page, hashes the relevant section, and writes a per-platform
file under `data/policy-rules/scraped/`. When the hash differs from the
prior scrape, the bi-weekly Home banner alerts bro to review the diff
and promote new rules into `hand-curated/`. **No structured rule
extraction** — that path is too brittle for v2; the scraper's value is
freshness + diffability, not auto-rules. Hand-curated stays canonical.

### Deliverables

1. **Cheerio dep** — `npm i cheerio@^1.1.0` (latest stable line; pin
   exact version after install). Pure HTML parsing; no JS execution.
2. **Sources config** — `src/server/services/policy-rules/sources.ts`
   (NEW). Per-platform `{ url, contentSelector, label }` array. v2
   ships 1 URL/platform; future adds extend the array. Selectors target
   the main content region (e.g., `<main>` or a known wrapper) so
   header/footer churn doesn't trigger false-positive change pings.
3. **Scraper core** — `src/server/services/policy-rules/scraper.ts`
   (NEW). Public API:
   - `async scrapePlatform(platform, opts?): Promise<ScrapeResult>` —
     fetch URL → cheerio extract → SHA-256 hash → return
     `{ scrapedAt, sourceUrl, contentHash, contentExcerpt, changedFromPrev }`.
     Writes `data/policy-rules/scraped/<file>.json` with shape
     `{ scrapedAt, rules: [], sourceUrl, contentHash, contentExcerpt }`
     (rules array intentionally empty — see Q-42.E).
   - `async scrapeAll(opts?): Promise<{ ok: ScrapeResult[]; failed: Array<{ platform, error }> }>` —
     parallel-safe per-platform; partial success allowed. Updates
     `settings.policy_rules.lastScrapedAt` to **the latest successful
     platform's timestamp** at the end.
   - 1s delay between requests to the same host (Q-42.E). Polite UA
     `ImagesGenArt/0.1 policy-scraper`. 30s timeout, 1 retry on 5xx,
     no retry on 4xx.
4. **Schema delta** — `ScrapedPolicyRuleFileSchema` gains optional
   `sourceUrl`, `contentHash`, `contentExcerpt` fields (still
   `.strict()` so unknowns throw). Loader stays compatible — these are
   metadata, not rules. ~10 LOC delta on `policy-rule.ts`.
5. **HTTP route** — `src/server/routes/policy-rules.ts` +
   `policy-rules.body.ts` (NEW pair).
   - `GET /api/policy-rules/status` → `{ lastScrapedAt, daysSince,
     stalenessThresholdDays: 14, isStale: boolean, perPlatform:
     [{ platform, scrapedAt, contentHash }] }`. Reads
     `settings.policy_rules.lastScrapedAt` + scraped JSON files.
   - `POST /api/policy-rules/rescrape` → triggers `scrapeAll`,
     returns the same shape as the scraper output. On success,
     `refreshPolicyRules()` so the merged cache and hot consumers
     pick up the new scraped files.
   - Mount in `src/server/app.ts` next to other routes (Q-42.G).
6. **CLI entry** — `scripts/scrape-policy-rules.ts` (NEW). Imports the
   same `scrapeAll` for cron / dev manual trigger. `npm run
   scrape-policy-rules` script in `package.json`.
7. **Home banner** — `src/client/components/PolicyRulesBanner.tsx`
   (NEW). Minimal strip at Home page top: "Policy rules last scraped
   X days ago — [Refresh now]". Visible only when `isStale === true`.
   Per-session dismiss via `sessionStorage.policyBannerDismissed` (no
   localStorage — bro should re-see it on next session). Refresh CTA
   triggers POST + inline spinner + toast on result.
8. **Banner data hooks** — `src/client/api/policy-rules-hooks.ts`
   (NEW). `usePolicyRulesStatus()` (GET status, refetch on demand) +
   `useRescrapePolicyRules()` (state-machine like prompt-assist hooks).
9. **Wire-up** — `src/client/pages/Home.tsx` mounts `PolicyRulesBanner`
   above existing content (~5 LOC delta).
10. **Test fixtures** — `tests/fixtures/policy-rules/{meta,google-ads,play}.html`
    (NEW). 3 captured snippets (just the `<main>` block of each
    platform's policy page, ~3-5 KB each). Committed so tests don't
    hit network.
11. **Tests**:
    - `tests/unit/policy-rules-scraper.test.ts` — fixture-fed scraper
      asserts hash stability, change detection vs prior file, partial
      success, timeout/retry path (mocked fetch). ~150 LOC.
    - `tests/unit/policy-rules-banner.test.tsx` — renders only when
      stale, dismiss persists, refresh triggers POST + toast on
      success/failure. ~100 LOC.
    - `tests/integration/policy-rules-rescrape-route.test.ts` — POST
      with mocked `scrapeAll` updates settings, returns expected
      shape; GET status reads settings + per-platform files. ~100 LOC.

### LOC budget

| File                                                           | Budget |
|----------------------------------------------------------------|--------|
| package.json (cheerio dep + script)                            | +2    |
| src/core/schemas/policy-rule.ts (delta)                        | +10   |
| src/server/services/policy-rules/sources.ts                    | ~80   |
| src/server/services/policy-rules/scraper.ts                    | ~180  |
| src/server/services/policy-rules/index.ts (re-export delta)    | +5    |
| src/server/routes/policy-rules.ts                              | ~90   |
| src/server/routes/policy-rules.body.ts                         | ~40   |
| src/server/app.ts (mount)                                      | +2    |
| scripts/scrape-policy-rules.ts                                 | ~70   |
| src/client/api/policy-rules-hooks.ts                           | ~80   |
| src/client/components/PolicyRulesBanner.tsx                    | ~90   |
| src/client/pages/Home.tsx (mount)                              | +5    |
| tests/fixtures/policy-rules/{meta,google-ads,play}.html        | (data) |
| tests/unit/policy-rules-scraper.test.ts                        | ~150  |
| tests/unit/policy-rules-banner.test.tsx                        | ~100  |
| tests/integration/policy-rules-rescrape-route.test.ts          | ~100  |
| **Total**                                                      | **~1004 LOC across 13 source files + 3 HTML fixtures + 1 dep** |

All source files ≤ 250 soft cap. Heaviest = `scraper.ts` (~180).

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-42.A — Cheerio dep + version**
- *Pre-filled:* `cheerio@^1.1.0` (or whatever `npm view cheerio version`
  prints at the time bro fires). Pin the exact resolved version after
  install. No transitive runtime concerns (cheerio is server-only).
- *Recommend:* approve dep + pin to latest 1.x stable.
- **STATUS: LOCKED 2026-04-25 — bro approved cheerio dep.**

**Q-42.B — Source URLs (1 per platform v2)**
- *Pre-filled:*
  - meta: `https://www.facebook.com/business/help/980593475366490`
    (text-overlay 20% rule).
  - google-ads: `https://support.google.com/adspolicy/answer/6008942`
    (prohibited content overview).
  - play: `https://support.google.com/googleplay/android-developer/answer/9866151`
    (graphic asset specs).
- *Alternative:* multi-URL/platform now (e.g., 3 URLs each). Adds
  parsing complexity + 3× the failure surface; defer to D-phase if a
  specific platform's rule lives across pages.
- *Recommend:* 1/platform v2; expand only when bro hits a missing rule.
- **STATUS: LOCKED 2026-04-25 — 3 pre-filled URLs accepted. Em sẽ
  sanity-check Meta redirect khi fire (capture canonical URL into
  fixture if it 30x).**

**Q-42.C — Content selector per platform**
- *Pre-filled:* fixture-driven. After bro confirms URLs at S#42 start,
  curl each + capture the page HTML into `tests/fixtures/...`, then
  pick a selector that uniquely brackets the policy text (e.g., `main
  article`, `[role=main]`, or a platform-specific class). Selector
  goes into `sources.ts`.
- *Recommend:* defer until fixture capture; use `main` as the
  zero-config default and override per platform if needed.
- **STATUS: PRE-FILLED — bro confirm (em sẽ pick selectors during fire,
  flag any that don't bracket cleanly).**

**Q-42.D — Failure mode (partial success)**
- *Pre-filled:* per-platform independence. If meta succeeds + google
  fails, write `meta.json` + skip `google-ads.json`; settings'
  `lastScrapedAt` updates to meta's timestamp. The banner stays
  "stale" (>14 days) only if NO platform has scraped recently.
- *Alternative:* all-or-nothing. Cleaner but a single flaky network
  blocks the freshness signal.
- *Recommend:* per-platform partial.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.E — Scrape mode (change-detection ping vs structured extraction)**
- *Pre-filled:* **change-detection ping**. Scraper writes
  `{scrapedAt, sourceUrl, contentHash, contentExcerpt, rules: []}`.
  Hand-curated stays the canonical rule source; bro promotes new
  rules manually after diffing the excerpt. Reasoning: structured
  extraction of Meta/Google/Play policy pages is famously brittle
  (their layouts change on a release-train cadence); v2 ships
  freshness + diffability, not pretend-rules.
- *Alternative:* structured extraction — cheerio parsers per platform
  emit real `PolicyRule` arrays. Bigger session (~+1.5h), much higher
  maintenance burden, output rarely matches reality without manual
  cleanup anyway.
- *Recommend:* ping mode for v2; revisit in D/E/F when bro is
  closer to the lanes that actually consume the rules.
- **STATUS: LOCKED 2026-04-25 — bro chose ping after LOC tradeoff
  walk-through. Reasoning: structured parsers ~3× LOC (3 platform-
  specific parsers + id-stabilizer + pattern-kind dispatcher = ~700
  LOC vs ~260 LOC ping); brittle when platforms reflow HTML;
  auto-extracted rules ~50% noise → bro reviews anyway. Hand-curated
  stays canonical; scraper's job is freshness alert. Upgrade path =
  "ping + targeted parser for a single section bro frequently misses"
  if needed in C3+ dogfood, NOT all-in structured.**

**Q-42.F — UA + rate limit**
- *Pre-filled:* UA `ImagesGenArt/0.1 policy-scraper
  (https://github.com/thang081193-ctrl/Imgs-Gen-Art)`. 1s delay between
  requests (current scope = 3 hosts so order doesn't matter much).
  30s timeout, 1 retry on 5xx, no retry on 4xx.
- *Recommend:* pre-filled OK — public help pages, polite UA enough.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.G — Route mount path**
- *Pre-filled:* `app.route("/api/policy-rules", createPolicyRulesRoute())`
  in `src/server/app.ts`. Endpoint shape: `GET /api/policy-rules/status`
  + `POST /api/policy-rules/rescrape`.
- *Recommend:* matches existing pattern (assets, profiles, …).
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.H — Banner UX**
- *Pre-filled:* Home page top, visible only when
  `(now - lastScrapedAt) > 14 days`. Per-session dismiss via
  `sessionStorage.policyBannerDismissed` (so bro re-sees it next
  session). Click "Refresh now" → POST → spinner → toast (success
  with platform list / error with message). No badge or Home-card
  takeover.
- *Alternative:* persistent dismiss until next stale window — risks
  bro forgetting to ever look.
- *Recommend:* per-session dismiss.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.I — POST endpoint guarding**
- *Pre-filled:* unguarded for v2 (local-only app, no public exposure).
  POST shape: `{platforms?: PolicyPlatform[]}` body; omit → all 3.
  Response: `{ok: ScrapeResult[], failed: [{platform, error}]}`.
- *Alternative:* require admin token from settings. Adds friction for
  zero current threat.
- *Recommend:* unguarded local.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.J — CLI entry**
- *Pre-filled:* `scripts/scrape-policy-rules.ts` + `npm run
  scrape-policy-rules`. CLI is the safer cron path; HTTP endpoint is
  the safer "click from UI" path. Both call the same `scrapeAll`.
- *Recommend:* both.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.K — Test fixture freshness**
- *Pre-filled:* fixtures are committed snapshots; tests assert against
  them. When real pages change, scraper output's `contentHash` will
  differ from the fixture-derived expected hash → fixture refresh is
  a manual carry-forward (not automated). Bro reviews + recommits
  fixture during periodic dogfood passes.
- *Alternative:* live fetch in tests (network flake → red CI).
- *Recommend:* committed fixtures.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.L — Visual smoke vs preview MCP host-env bug**
- *Pre-filled:* skip preview MCP per `preview_mcp_node_env.md` (better-
  sqlite3 ABI mismatch unresolved). Banner has unit tests + integration
  test for the underlying route; React-level wiring is proven without
  visual smoke. Bro can `fnm exec --using=20 bash -lc "npm run dev"`
  manually to eyeball.
- *Recommend:* same playbook as S#40.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-42.M — Carry-forward push from S#41**
- Local main is **ahead 1** vs origin (`a84807e` C1 only). Push at
  S#42 start so bro's git is honest before adding C2 commits?
- *Recommend:* push at S#42 start.
- **STATUS: OPEN — bro decide before firing C2.**

---

## Estimate

- S#42 scope: **~2h** per PLAN-v3 §7 row 6.
- Pre-align Qs: ~5-10 min (Q-42.A–L; M open).
- Cheerio dep + sources config: ~10 min.
- Scraper core (180 LOC, fixture-driven): ~30 min.
- Schema delta + loader compat: ~5 min.
- HTTP route + body schemas + mount: ~15 min.
- CLI script: ~5 min.
- Banner component + hooks + Home wire: ~25 min.
- Fixtures (3 captures + selector tuning): ~10 min.
- Tests (unit scraper + unit banner + integration route): ~25 min.
- Regression + commit + push: ~10 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. **No new runtime deps without asking** —
  expected new dep: `cheerio` (Q-42.A).
- Show evidence before claiming done (HANDOFF rule #7) — for C2
  that means: regression green + scraper test asserts hash stability
  + change detection on fixtures + integration test confirms POST
  triggers `scrapeAll` and updates settings end-to-end.
- Node: `fnm exec --using=20 bash -lc "…"`.
- C2 is ~80% backend + thin frontend banner. Preview MCP optional;
  integration test is primary evidence per `preview_mcp_node_env.md`.
- **Memory updated at S#41 close**: `phase_status.md` rolled to "S#41
  closed; S#42 = Phase C2 Scraper".

---

## Carry-forward (defer unless C2 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment.
6. Split `client/api/hooks.ts` (256 LOC, 6 over soft cap).
7. **From S#39:** PLAN-v3 §3 still says `services/grok.ts`; should
   point to `services/llm/` + `services/prompt-assist/` +
   `services/policy-rules/` after architecture revision.
8. **From S#40:** preview MCP host-env bug retry log added to memory;
   `npm rebuild better-sqlite3` against system Node + VS C++
   toolchain might fix; out of scope per `preview_mcp_node_env.md`.
9. **From S#40:** hand-curated → AI-curated diff workflow (UX sketch
   only, lands here in C2 banner OR D-phase).
10. **From S#41:** consider promoting `PolicyRulesLoaderError` to its
    own ErrorCode union member instead of subclassing
    `ExtractionError` — only matters if C3 enforcement handlers need
    to discriminate by class.
11. **From S#41:** structured extraction (the rejected alternative in
    Q-42.E). Revisit if hand-curated maintenance becomes painful.

## Out of scope (this session)

- `checkPolicy()` enforcement function (C3 = S#43).
- Wizard Step 4 preflight badge (C3 frontend).
- Audit-trail blob writers (C3 — when batches finalize).
- Override dialog UX (C3).
- Diff-viewer UI for scraped vs hand-curated (D/E/F or carry-forward).
- Any Meta Ads / Google Ads / ASO wizard work (D/E/F sessions).
- Multi-URL/platform scraping (carry-forward Q-42.B alt).
- Structured rule auto-extraction (carry-forward Q-42.E alt).

---

## Remaining sessions after S#42 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 7 | S#43    | **C3 Enforcement + audit**  | 2h  |
| 8 | S#44    | **D1 Meta Ads backend**     | 2h  |
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after C2:** ~12.5h across 6 sessions. PLAN-v3 closes
after S#48 + 1 week of bro dogfooding.

---

*Session #41 closed 2026-04-25 with C1 schema + loader + seed shipped:
876/890 green, commit `a84807e` on local main (push pending — 1 commit
ahead). S#42 = Phase C2 Scraper + ping per PLAN-v3 §7 row 6. Pre-align
Qs Q-42.A–L pre-filled; Q-42.M (push timing) open. Bro skim + fire.
Next: HANDOFF-SESSION43.md for C3 Enforcement + audit drafted at S#42
close.*
