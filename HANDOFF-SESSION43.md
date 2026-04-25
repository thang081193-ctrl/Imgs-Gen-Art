# Session #43 Handoff — Phase C3 Enforcement + audit

Paste at the start of S#43 to resume cleanly on any PC. Per PLAN-v3 §7
row 7 (~2h, backend-heavy + 1 standalone frontend dialog). C3 =
**`checkPolicy()` enforcement + preflight route + audit-blob writer +
override-with-reason dialog (component only — wizard mounting defers
to D1+).**

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #42 — 2026-04-25)

- **Phase C2 shipped + pushed.** Commit `b887118` on `origin/main`. 23
  files / +1757 LOC of new code + ~57 LOC of seam edits. 
- **Regression:** **905 pass / 13 skipped / 1 todo / 919 total** (was
  876/890 → +29 = 28 new C2 tests + 1 home-page seam bump after
  Banner mounted).
- **What landed (C2):**
  - `cheerio@1.2.0` pinned (no caret).
  - `src/server/services/policy-rules/sources.ts` — 3 URL/platform
    config (`PolicyScrapeSource[]` w/ `contentSelector`).
  - `src/server/services/policy-rules/scraper.ts` (282 LOC) —
    `scrapePlatform` + `scrapeAll`. fetch + cheerio → SHA-256 hash +
    excerpt + change detection. 30s timeout, 1 retry on 5xx, no retry
    on 4xx, 1s host delay, polite UA.
  - `src/server/asset-store/settings-repo.ts` — generic kv accessor.
    Wired into `context.ts` via `getSettingsRepo()`.
  - `src/server/routes/policy-rules.ts` + `.body.ts` —
    `GET /api/policy-rules/status` + `POST /api/policy-rules/rescrape`
    (validateBody + strict body). Mounted in `app.ts`.
  - `scripts/scrape-policy-rules.ts` + `npm run scrape-policy-rules`
    CLI mirror.
  - `src/client/api/policy-rules-hooks.ts` —
    `usePolicyRulesStatus()` (with refetch) +
    `useRescrapePolicyRules()` (state-machine).
  - `src/client/components/PolicyRulesBanner.tsx` — Home-top strip.
    14d staleness, sessionStorage dismiss, Refresh CTA → toast result.
    Mounted above existing Home content.
  - 3 synthetic `<main>`-block fixtures under
    `tests/fixtures/policy-rules/` (Q-42.K LOCKED — committed snapshots).
  - 28 new tests (12 scraper + 6 banner + 10 integration route).
  - Schema delta: `ScrapedPolicyRuleFileSchema` gains optional
    `sourceUrl`, `contentHash`, `contentExcerpt`. Still `.strict()`.
- **Q-42.* all locked** (PLAN-v3 §J entries to add): Q-42.A cheerio
  1.2.0 pinned. B 3 URLs accepted, real fetch deferred (synthetic
  fixtures used). C selector default `main`. D per-platform partial
  failure. E **ping mode** (canonical decision — see HANDOFF-S42 Q-42.E
  rationale). F UA + 1s + 30s + 1 retry 5xx. G mount path
  `/api/policy-rules`. H banner Home-top + 14d + sessionStorage
  dismiss. I unguarded local POST. J both CLI + HTTP. K committed
  fixtures. L skip preview MCP per host-env bug. M push at start —
  done; 3 carry-forward commits (a84807e + ae22981 + e7c8f9b) reached
  origin before C2 fired.

## Current repo state (verify before firing C3)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main                      # nothing new on origin if local in sync
git log --oneline -5                      # b887118 (S#42 C2) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 905 / 919 (or 905 + N new C3 tests)

# Verify C2 surface area still loads cleanly:
fnm exec --using=20 bash -lc "node -e \"
const { POLICY_SOURCES } = require('./dist/server/services/policy-rules/sources');
console.log('sources', Object.keys(POLICY_SOURCES));
\""   # only after npm run build; otherwise run via tsx.
```

`data/policy-rules/scraped/` is still empty on a fresh clone (the
scraper writes there only when bro fires `POST /rescrape` or the CLI).
`merged.cache.json` is regenerated whenever the loader runs.

---

## Priority pick — S#43: Phase C3 Enforcement + audit

### Goal

Ship `checkPolicy(input)` — the function the wizard's preflight badge
(D1+) and the batch finalizer call to evaluate a profile + batch
context against the merged hand-curated + scraped rules. Returns a
`PolicyDecision` with severity-bucketed violations. Wire two
consumers: a `POST /api/policy-rules/preflight` HTTP endpoint
(wizard's preflight call) and `finalizeBatch()` (writes the decision
to `batches.policy_decision_json` for audit). Plus: standalone
`PolicyOverrideDialog` React component that captures bro's "proceed
anyway" reason — used by D-phase wizard, NOT mounted into a wizard
this session (wizard ships in D1).

### Deliverables

1. **PolicyDecision schema** — `src/core/schemas/policy-decision.ts`
   (NEW). Zod, `.strict()`. Top-level shape:
   ```ts
   { decidedAt, ruleSetVersion?, ok: boolean,
     violations: PolicyViolation[],
     overrides?: PolicyOverride[] }
   ```
   `PolicyViolation`: `{ ruleId, severity, kind, message, details?:Record<string,unknown> }`. `PolicyOverride`: `{ ruleId, reason, decidedBy, decidedAt }`. `ok` is `true` iff no `severity:"block"` violation remains unoverridden.

2. **Per-kind checker functions** —
   `src/server/services/policy-rules/checkers/` (NEW dir, 6 files):
   - `text-area-ratio.ts` — **DEFERRED** kind in v2 (image analysis
     not in stack yet). Emits a single `severity:"warning"` violation
     `text-area-pending` so bro sees "manual review required" until
     D-phase ships sharp+OCR. Q-43.C tracks the upgrade path.
   - `keyword-blocklist.ts` — case-insensitive (default) substring
     match against `input.prompt + input.copyTexts.join(" ")`. Emits 1
     violation per matched keyword; Q-43.E tracks aggregation.
   - `aspect-ratio.ts` — checks `input.assetAspectRatio` against the
     allow-list (`"16:9" | "1:1" | …`). Skips if `assetAspectRatio`
     not provided (preflight-time = unknown → no violation).
   - `file-size-max.ts` — checks `input.assetFileSizeBytes` against
     `maxBytes`. Skips if not provided.
   - `resolution-min.ts` — checks `input.assetWidth/height` against
     min. Skips if not provided.
   - `claim-regex.ts` — runs the rule's regex (with optional flags)
     against `input.prompt + input.copyTexts.join(" ")`.
   Each checker exports `(rule, input) => PolicyViolation | null`.

3. **`checkPolicy()` aggregator** —
   `src/server/services/policy-rules/check-policy.ts` (~130 LOC).
   - Loads merged rules via `getPolicyRules(input.platform)`.
   - Dispatches by `rule.pattern.kind` to the per-kind checker.
   - Aggregates violations + applies overrides → final
     `PolicyDecision`.
   - Pure function: `(input, options?) => PolicyDecision`. `options`
     optionally accepts a pre-resolved `rules` array for tests.

4. **Preflight HTTP route delta** —
   `src/server/routes/policy-rules.ts` (delta +~70 LOC) +
   `.body.ts` (delta +~50 LOC). Adds `POST
   /api/policy-rules/preflight` with body:
   ```json
   { "platform": "meta",
     "prompt": "string?",
     "copyTexts": ["string", …]?,
     "assetWidth": 1024?,
     "assetHeight": 768?,
     "assetFileSizeBytes": 102400?,
     "assetAspectRatio": "16:9"?,
     "overrides": [{ "ruleId", "reason" }]? }
   ```
   Returns `PolicyDecision`. No DB writes — pure evaluation.

5. **`batches.policy_decision_json` writer** —
   `src/server/asset-store/batch-repo.ts` delta (~30 LOC): add
   `updatePolicyDecision(batchId, decision)` SQL upsert. Wire into
   `finalizeBatch.ts` (~30 LOC delta) — when caller passes
   `policyDecision`, the finalizer writes it before
   `updateStatus`. Q-43.G tracks the input-gathering question
   (where finalizeBatch's caller obtains `PolicyDecision`).

6. **`PolicyOverrideDialog` component** —
   `src/client/components/PolicyOverrideDialog.tsx` (~120 LOC).
   Standalone modal: opens with a list of unmet `severity:"warning"`
   violations + a textarea per violation for the override reason.
   Returns `PolicyOverride[]` on confirm. NOT mounted into any wizard
   this session — wizard ships in D1+. Q-43.H tracks where it gets
   mounted later.

7. **Hook for the dialog** —
   `src/client/api/policy-rules-hooks.ts` delta (~40 LOC): add
   `usePolicyPreflight()` (state-machine over POST /preflight).

8. **Tests**:
   - `tests/unit/policy-checkers.test.ts` (~200 LOC) — per-kind
     checker round-trips: hit + miss + skip-when-input-missing for
     each of the 6 kinds.
   - `tests/unit/check-policy.test.ts` (~120 LOC) — aggregator:
     no-rules → ok, single-block → ok=false, override-clears-warning,
     override-cannot-clear-block, hand-curated takes precedence over
     scraped (smoke).
   - `tests/integration/policy-rules-preflight-route.test.ts` (~100 LOC)
     — POST /preflight happy + body validation + override propagation.
   - `tests/unit/finalize-batch-policy.test.ts` (~80 LOC) — finalizer
     writes `policy_decision_json` when supplied; absent decision =
     no write (NULL stays NULL).
   - `tests/unit/policy-override-dialog.test.tsx` (~100 LOC) — modal
     renders 1 textarea per warning, confirm returns
     `PolicyOverride[]`, cancel returns `null`.

### LOC budget

| File                                                                | Budget |
|---------------------------------------------------------------------|--------|
| src/core/schemas/policy-decision.ts                                 | ~120  |
| src/server/services/policy-rules/checkers/text-area-ratio.ts        | ~30   |
| src/server/services/policy-rules/checkers/keyword-blocklist.ts      | ~35   |
| src/server/services/policy-rules/checkers/aspect-ratio.ts           | ~25   |
| src/server/services/policy-rules/checkers/file-size-max.ts          | ~20   |
| src/server/services/policy-rules/checkers/resolution-min.ts         | ~25   |
| src/server/services/policy-rules/checkers/claim-regex.ts            | ~30   |
| src/server/services/policy-rules/check-policy.ts                    | ~130  |
| src/server/services/policy-rules/index.ts (delta)                   | +10   |
| src/server/routes/policy-rules.ts (delta)                           | +70   |
| src/server/routes/policy-rules.body.ts (delta)                      | +50   |
| src/server/asset-store/batch-repo.ts (delta)                        | +30   |
| src/server/asset-store/finalize-batch.ts (delta)                    | +30   |
| src/client/api/policy-rules-hooks.ts (delta)                        | +40   |
| src/client/components/PolicyOverrideDialog.tsx                      | ~120  |
| tests/unit/policy-checkers.test.ts                                  | ~200  |
| tests/unit/check-policy.test.ts                                     | ~120  |
| tests/integration/policy-rules-preflight-route.test.ts              | ~100  |
| tests/unit/finalize-batch-policy.test.ts                            | ~80   |
| tests/unit/policy-override-dialog.test.tsx                          | ~100  |
| **Total**                                                           | **~1365 LOC** |

All source files ≤ 250 soft cap. Heaviest = `check-policy.ts` (~130).

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-43.A — Where checkPolicy runs (preflight vs finalize vs both)**
- *Pre-filled:* **both**. Preflight route runs at wizard-time (before
  generation kicks off) — surfaces violations early so bro can
  override or fix. Finalize runs at batch-completion — writes the
  audit-trail snapshot to `batches.policy_decision_json` so the
  Gallery / replay flow can show "this batch was generated under
  ruleset X, decision Y" later.
- *Recommend:* both. Cost is shared check-policy.ts; the boundaries
  differ only in input-gathering and side-effects.

**Q-43.B — PolicyDecision shape**
- *Pre-filled:* `{ decidedAt: ISO, ruleSetVersion?: string, ok:
  boolean, violations: PolicyViolation[], overrides?: PolicyOverride[]
  }`. `ruleSetVersion` reserved for D-phase (when rule-set hashing is
  added so audit can pin "rules at time of decision").
- *Recommend:* lock as-is; bump shape in C3 only if a downstream lane
  surfaces a need.

**Q-43.C — text-area-ratio handling in v2**
- *Pre-filled:* **defer with warn-pending stub**. The kind is part of
  the schema (C1 ships it) but real evaluation needs sharp + OCR
  (image analysis), which v2 hasn't added yet. The stub emits
  `severity:"warning"` `text-area-pending` so the rule is *visible* in
  the wizard UI (D1+) without blocking. Real check lands in
  D-phase or a dedicated session after sharp ships.
- *Alternative:* skip the kind entirely (don't emit any violation).
  Hides the rule from the wizard until D-phase — risk: bro forgets
  the rule exists.
- *Recommend:* warn-pending stub.

**Q-43.D — Override semantics**
- *Pre-filled:*
  - `severity:"warning"` violations CAN be overridden via
    `PolicyOverride` (with required reason text).
  - `severity:"block"` violations CANNOT be overridden — bro must
    edit the input until the violation clears.
- *Alternative:* allow overriding blocks too (with a stronger reason
  + admin gate). Adds complexity for zero current threat.
- *Recommend:* lock as-is.

**Q-43.E — Multi-match aggregation (e.g. 3 keywords matched)**
- *Pre-filled:* one violation per matched keyword (so the UI can
  highlight each in the diff). Rule-level violations stay 1:1 with
  rule + match instance.
- *Alternative:* one violation per rule, with a `matchedTerms[]`
  array.
- *Recommend:* one-per-match. Simpler downstream; UI groups by ruleId.

**Q-43.F — Preflight input shape (what does the wizard send)**
- *Pre-filled:*
  ```ts
  { platform: PolicyPlatform,
    prompt?: string,
    copyTexts?: string[],
    assetWidth?: number,
    assetHeight?: number,
    assetFileSizeBytes?: number,
    assetAspectRatio?: string,
    overrides?: PolicyOverride[] }
  ```
  All asset-* fields optional — at preflight-time the asset doesn't
  exist yet, so size/resolution checks skip. They're populated post-
  generation when finalizeBatch runs.
- *Recommend:* lock as-is.

**Q-43.G — Where finalizeBatch gets its PolicyDecision**
- *Pre-filled:* the workflow runner (the call site of
  `finalizeBatch`) is responsible for assembling the decision from
  the asset metadata + the at-batch-time prompt/copy text. v2 wires
  this in S#44+ (D1 Meta backend). For C3, `finalizeBatch` accepts an
  optional `policyDecision: PolicyDecision` param + writes when
  supplied; existing callers pass `undefined` → no behavior change.
- *Alternative:* finalizer computes the decision itself (would need
  to re-fetch all asset metadata + reconstruct prompt). Heavier; the
  runner already has the inputs.
- *Recommend:* runner-supplied + finalizer-as-writer.

**Q-43.H — Where PolicyOverrideDialog gets mounted**
- *Pre-filled:* **NOT mounted in C3**. The wizard doesn't exist yet
  (Home page lane CTAs still toast "Wizard cho lane sẽ ship ở D1+").
  C3 ships the dialog as a standalone component + tests; D1+ Meta
  wizard mounts it. This keeps C3 frontend lean.
- *Alternative:* add a temporary mount on the SavedStyleDetail or
  PromptLab page. Yagni — D-phase wizard will replace it within 2
  sessions.
- *Recommend:* no mount in C3. Frontend deliverable = component +
  hook + unit test.

**Q-43.I — Test approach for size/resolution kinds**
- *Pre-filled:* synthetic `input` objects with hand-crafted
  `assetWidth/Height/FileSizeBytes/AspectRatio` numbers. NO real
  image involved — these checkers are pure number comparisons.
- *Recommend:* synthetic only.

**Q-43.J — Module path for checkers**
- *Pre-filled:* `src/server/services/policy-rules/checkers/` (sibling
  of loader/scraper). One file per kind so each can grow
  independently.
- *Alternative:* single `checkers.ts` file (~180 LOC). Heavier file,
  worse merge surface if bro adds a 7th kind.
- *Recommend:* per-kind files.

**Q-43.K — Carry-forward push from S#42**
- Local main is **at origin/main** (b887118 just pushed). No
  unpushed commits at S#43 start.
- *Recommend:* nothing to push. Push C3 at session close.
- **STATUS: AUTO-RESOLVED.**

**Q-43.L — Visual smoke vs preview MCP host-env bug**
- *Pre-filled:* skip preview MCP per `preview_mcp_node_env.md`
  (better-sqlite3 ABI mismatch unresolved). Override-dialog has unit
  tests; integration test for `/preflight` is primary evidence. Bro
  can `fnm exec --using=20 bash -lc "npm run dev"` manually to
  eyeball if needed.
- *Recommend:* same playbook as S#42.

---

## Estimate

- S#43 scope: **~2h** per PLAN-v3 §7 row 7.
- Pre-align Qs: ~5-10 min (Q-43.A–L; K auto-resolved).
- Schema (PolicyDecision + PolicyViolation + PolicyOverride): ~10 min.
- 6 per-kind checker files + claim-regex flag handling: ~30 min.
- check-policy aggregator + override application: ~15 min.
- Preflight route + body schema + mount: ~15 min.
- finalizeBatch + batch-repo `updatePolicyDecision` wiring: ~10 min.
- Override dialog + hook: ~20 min.
- Tests (per-kind + aggregator + route + finalize + dialog): ~30 min.
- Regression + commit + push: ~10 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. **No new runtime deps without asking** — C3
  doesn't need any new dep (cheerio + zod + better-sqlite3 already in
  place).
- Show evidence before claiming done (HANDOFF rule #7) — for C3
  that means: regression green + per-kind checker hits/misses
  asserted + integration test confirms POST /preflight returns the
  expected decision shape + finalize-batch test writes
  policy_decision_json end-to-end.
- Node: `fnm exec --using=20 bash -lc "…"`.
- C3 is ~90% backend + 1 standalone frontend dialog. Preview MCP
  optional; integration test is primary evidence per
  `preview_mcp_node_env.md`.
- **Memory updated at S#42 close**: `phase_status.md` rolled to "S#42
  closed; S#43 = Phase C3 Enforcement".

---

## Carry-forward (defer unless C3 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment.
6. `client/api/hooks.ts` (256 LOC) + `services/policy-rules/scraper.ts`
   (282 LOC) — both over 250 soft cap. Split when content grows.
7. **From S#39:** PLAN-v3 §3 still says `services/grok.ts`; should
   point to `services/llm/` + `services/prompt-assist/` +
   `services/policy-rules/`.
8. **From S#40:** preview MCP host-env bug retry log added to memory;
   `npm rebuild better-sqlite3` against system Node + VS C++
   toolchain might fix; out of scope per `preview_mcp_node_env.md`.
9. **From S#40:** hand-curated → AI-curated diff workflow (UX sketch
   only, lands in D-phase or carry-forward).
10. **From S#41:** consider promoting `PolicyRulesLoaderError` to its
    own ErrorCode union member. C3 introduces enforcement-side errors
    (`PolicyOverrideRejected`, `PolicyDecisionInvalid`) — group these
    together if C3 needs to discriminate at the route layer.
11. **From S#41:** structured rule auto-extraction — defer per Q-42.E
    LOCKED.
12. **From S#42:** loader.ts:234 unused `eslint-disable no-console`
    directive — pre-existing warning. Sweep when bro cleans lint.
13. **From S#42:** real-world fixture refresh — synthetic fixtures
    used for unit tests. When bro fires the first manual scrape,
    capture real `<main>` blocks if they differ in shape from the
    synthetics.
14. **From S#42:** `scrapeAll` is sequential with 1s host delay —
    parallelize with per-host serialization if the source list grows
    on different hosts.
15. **From S#43:** text-area-ratio real check (sharp + OCR) — Q-43.C
    upgrade path. Lands in D-phase or a dedicated session.
16. **From S#43:** `ruleSetVersion` field on PolicyDecision is
    reserved (placeholder); D-phase fills it once rule-set hashing
    ships.

## Out of scope (this session)

- Wizard Step 4 mounting (D1+).
- Mounting `PolicyOverrideDialog` on a real call site (D1+).
- text-area-ratio image-analysis check (sharp + OCR — D-phase).
- `ruleSetVersion` hashing.
- Workflow-runner integration (D1+ wires `policyDecision` into
  `finalizeBatch` calls).
- Override admin gate (no auth model in v2).
- Diff-viewer UI for hand-curated vs scraped (carry-forward).
- Any Meta Ads / Google Ads / ASO wizard work (D/E/F sessions).

---

## Remaining sessions after S#43 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 8 | S#44    | **D1 Meta Ads backend**     | 2h  |
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after C3:** ~10.5h across 5 sessions. PLAN-v3
closes after S#48 + 1 week of bro dogfooding.

---

*Session #42 closed 2026-04-25 with C2 scraper + ping shipped:
905/919 green, commit `b887118` on `origin/main` (push complete). S#43
= Phase C3 Enforcement + audit per PLAN-v3 §7 row 7. Pre-align Qs
Q-43.A–L pre-filled; Q-43.K auto-resolved (nothing unpushed). Bro skim
+ fire. Next: HANDOFF-SESSION44.md for D1 Meta Ads backend drafted at
S#43 close.*
