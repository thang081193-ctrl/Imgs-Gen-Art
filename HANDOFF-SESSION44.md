# Session #44 Handoff — Phase D1 Meta Ads backend

Paste at the start of S#44 to resume cleanly on any PC. Per PLAN-v3 §7
row 8 (~2h, backend-only). D1 = **wire the workflow runner integration
for checkPolicy → finalizeBatch audit, plus the Meta-lane-specific
backend pieces (input-shape mapper + runner call-site).** Wizard
mounting (D2 = S#45) lifts `PolicyOverrideDialog` into the actual
preflight call site.

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #43 — 2026-04-25)

- **Phase C3 shipped + pushed.** Commit `2aec7f4` on `origin/main`. 24
  files / +1713 LOC. C3 enforcement layer wired end-to-end (schema +
  6 checkers + aggregator + preflight route + finalize-batch audit
  writer + standalone override dialog).
- **Regression:** **951 pass / 13 skipped / 1 todo / 965 total** (was
  905/919 → +46 = 21 checker + 7 aggregator + 7 preflight route + 4
  finalize-batch-policy + 7 dialog).
- **What landed (C3):**
  - `src/core/schemas/policy-decision.ts` — strict zod schemas for
    PolicyDecision + Violation + Override.
  - `src/server/services/policy-rules/checkers/` — 6 per-kind files +
    types + index. text-area-ratio is a deferred `warn-pending` stub
    (Q-43.C); keyword-blocklist + claim-regex emit one-violation-per-
    match (Q-43.E).
  - `src/server/services/policy-rules/check-policy.ts` — pure
    aggregator. Loader-driven by default, `options.rules` for tests.
    Override semantics: warning overridable, block unconditional
    (Q-43.D); override row preserved in audit blob even targeting a
    block (visibility).
  - `POST /api/policy-rules/preflight` route + strict body schema.
  - `batch-repo.updatePolicyDecision()` + `finalizeBatch({…,
    policyDecision?})` — audit-blob writer, opt-in (existing callers
    pass `undefined` = no behavior change).
  - `usePolicyPreflight()` state-machine hook +
    `PolicyOverrideDialog.tsx` (NOT mounted; D2 lifts it into the Meta
    wizard).
- **Q-43.* all locked**: A both-call-sites; B `{decidedAt,
  ruleSetVersion?, ok, violations, overrides?}`; C deferred stub; D
  warning overridable / block unconditional; E one-per-match; F asset-
  * optional; G runner-supplied / finalizer-as-writer; H not-mounted;
  I synthetic inputs; J per-kind files; K AUTO-RESOLVED (nothing
  unpushed at S#43 start); L preview MCP skipped.

## Current repo state (verify before firing D1)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main                      # nothing new on origin if local in sync
git log --oneline -5                      # 2aec7f4 (S#43 C3) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 951 / 965 (or 951 + N new D1 tests)

# Verify C3 surface area still loads cleanly:
fnm exec --using=20 bash -lc "node -e \"
const { checkPolicy } = require('./dist/server/services/policy-rules/check-policy');
console.log('checkPolicy', typeof checkPolicy);
\""   # only after npm run build; otherwise run via tsx.
```

---

## Priority pick — S#44: Phase D1 Meta Ads backend

### Goal

Wire the **workflow-runner integration** so a Meta Ads run actually
fires `checkPolicy(input, options)` at batch start, threads the result
through to `finalizeBatch`, and surfaces a structured 4xx-style
preflight failure to the SSE stream when `decision.ok === false`
(without overrides). Also: assemble `PolicyCheckInput` from the
profile + ad-production input shape (the per-platform mapping is the
Meta-lane-specific work; D-phase E/F sessions add Google Ads + Play
mappers next to it).

This is **backend-only** — D2 (S#45) lifts `PolicyOverrideDialog` into
the wizard frontend + adds the preflight badge.

### Deliverables

1. **`PolicyCheckInput` builder** —
   `src/server/services/policy-rules/build-check-input.ts` (~80 LOC).
   Pure: `(profile, adProductionInput, prompt, copyTexts) =>
   PolicyCheckInput`. For Meta v1: `platform: "meta"`, `prompt`,
   `copyTexts`, `assetAspectRatio` from `WorkflowRunParams.aspectRatio`.
   `asset{Width,Height,FileSizeBytes}` ARE NOT KNOWN at runner-start
   — they get filled by a separate post-asset hook (Q-44.B tracks).

2. **Runner integration** — `src/workflows/ad-production/run.ts`
   delta (~50 LOC). At batch start (after `batchRepo.create` but
   before the first concept loop):
   - Call `checkPolicy(input, { overrides })` where `overrides` comes
     from a new `policyOverrides?: PolicyOverride[]` field on
     `WorkflowRunParams` (~10 LOC delta on the type).
   - If `decision.ok === false`, emit `type:"policy_blocked"` SSE
     event + finalize the batch with status `"error"` AND
     `policyDecision: decision`. RETURN early.
   - If `decision.ok === true` and `decision.violations.length > 0`,
     emit `type:"policy_warned"` SSE event (informational; runner
     proceeds). Decision is held + passed into the terminal
     `finalizeBatch` call so the audit blob lands.
   - Decision is passed into ALL three terminal `finalizeBatch` calls
     (completed / aborted / error) so the audit blob is consistent
     across paths.

3. **SSE event schema delta** —
   `src/core/dto/workflow-events.ts` (or wherever the SSE union
   lives) adds two new variants: `{type:"policy_blocked", decision:
   PolicyDecision, batchId}` + `{type:"policy_warned", decision,
   batchId}`. Q-44.D tracks whether to fold into the existing `error`
   variant or keep separate.

4. **Test fixture for Meta-lane policy enforcement** —
   `data/policy-rules/hand-curated/meta.json` delta — add 1
   block-severity rule + 1 warning rule (Q-44.E LOCKED template) so
   integration tests can exercise both paths against real merged
   loader output.

5. **Tests**:
   - `tests/unit/build-check-input.test.ts` (~80 LOC) — profile +
     input → expected PolicyCheckInput shape; aspectRatio derivation;
     copyTexts assembly.
   - `tests/integration/ad-production-policy.test.ts` (~150 LOC) —
     full SSE-stream trace asserting:
     - block decision → `policy_blocked` event, `finalizeBatch`
       called with `status:"error"` + `policyDecision`.
     - warning-only → `policy_warned` event, batch proceeds, terminal
       `finalizeBatch` writes decision.
     - clean (no violations) → no policy_* event, batch proceeds, no
       decision written (Q-44.F LOCKED — clean batches don't pollute
       audit column with empty decisions).
     - override clears warning → batch proceeds same as clean path.
   - `tests/unit/ad-production-run-policy.test.ts` (~100 LOC) — runner
     in isolation with stubbed checkPolicy, asserts decision threads
     through to all 3 finalizeBatch call sites.

### LOC budget

| File                                                                | Budget |
|---------------------------------------------------------------------|--------|
| src/server/services/policy-rules/build-check-input.ts               | ~80   |
| src/workflows/ad-production/run.ts (delta)                          | +50   |
| src/core/dto/workflow-events.ts (delta)                             | +30   |
| data/policy-rules/hand-curated/meta.json (delta)                    | +20   |
| tests/unit/build-check-input.test.ts                                | ~80   |
| tests/integration/ad-production-policy.test.ts                      | ~150  |
| tests/unit/ad-production-run-policy.test.ts                         | ~100  |
| **Total**                                                           | **~510 LOC** |

All source files comfortably under 250 soft cap.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-44.A — Which workflow gets the wiring first?**
- *Pre-filled:* `ad-production` only. It's the workflow the Meta
  wizard targets (PLAN-v3 §6.2). `artwork-batch` / `style-transform`
  / `aso-screenshots` defer to E/F sessions when their lanes ship.
- *Recommend:* lock as-is. Avoids rewiring 4 runners.

**Q-44.B — Asset-* metadata at runner-start vs post-asset**
- *Pre-filled:* runner-start preflight has `aspectRatio` only;
  per-asset checks (`fileSizeBytes`, `width`, `height`) defer to a
  POST-asset hook in D2/E/F. v2 ships preflight at runner-start +
  per-batch terminal write — per-asset gating is a P3 follow-up.
- *Alternative:* run checkPolicy per-asset post-write. Heavier (3+
  re-checks per batch); current cost is paid once.
- *Recommend:* runner-start only. Per-asset hook lands when bro hits
  the first false-pass on size/resolution.

**Q-44.C — Where does `policyOverrides` enter `WorkflowRunParams`?**
- *Pre-filled:* new optional field
  `policyOverrides?: PolicyOverride[]` on the params type. POST
  /api/workflows/:id/run body schema adds it as `.optional()`.
  Wizard-supplied list ships verbatim through to the runner.
- *Recommend:* lock as-is.

**Q-44.D — SSE event type for policy outcomes**
- *Pre-filled:* two new variants `{type:"policy_blocked", decision,
  batchId}` + `{type:"policy_warned", decision, batchId}`. Reason:
  the wizard frontend needs to discriminate (open override dialog on
  block vs banner-strip on warning). Folding into `error` would
  conflate stack failures with policy gates.
- *Alternative:* single `policy_outcome` variant with
  `{decision}` and let the client read `decision.ok` + violation
  severities.
- *Recommend:* two variants for client clarity. UI reads the variant,
  not the decision shape.

**Q-44.E — Hand-curated Meta seed for D1 tests**
- *Pre-filled:* add 2 rules to `data/policy-rules/hand-curated/
  meta.json`:
  - 1 `severity:"block"`, `kind:"keyword-blocklist"`,
    keywords: ["miracle"], category "claims"
  - 1 `severity:"warning"`, `kind:"keyword-blocklist"`,
    keywords: ["unbeatable"], category "claims"
  Q-44.E LOCKED — bro can swap real Meta language later; placeholder
  is sufficient for integration coverage.
- *Recommend:* lock as-is.

**Q-44.F — Audit-blob policy when decision is empty (no violations)**
- *Pre-filled:* DO NOT write the column when `decision.violations.
  length === 0` AND `decision.overrides === undefined`. Reason:
  audit column is for non-trivial decisions; empty decisions add
  noise + force `JSON.parse` on read for zero benefit. The runner
  passes `policyDecision: undefined` in this case.
- *Alternative:* always write so every batch has a decision row.
  Simpler invariant; trades column noise for query consistency.
- *Recommend:* skip-on-empty. Storage cost negligible but UI churn
  matters more.

**Q-44.G — How does the runner get the `prompt` / `copyTexts` for
preflight?**
- *Pre-filled:* runner builds a "preflight prompt" by concatenating
  the FIRST concept's prompt-composer output (the runner has the
  feature-focus + profile + locale already; running the composer once
  for preflight is cheap). `copyTexts` = first concept's headline +
  body. Per-asset-call refines per-concept copy in D2/E/F.
- *Alternative:* runner builds a synthetic `prompt = profile.appName
  + featureFocus` without invoking the composer. Misses keyword/
  regex matches that only surface in composed prompts.
- *Recommend:* concept-0 composer output. Q-44.G tracks the per-
  concept-pre-flight upgrade if v2 dogfooding finds gaps.

**Q-44.H — Block-decision SSE: emit `error` after `policy_blocked`?**
- *Pre-filled:* yes, runner finalizes with `status:"error"` then
  emits one `error` event with `code:"PolicyBlocked"` + the decision
  inline. Mirrors how other terminal failures surface
  (PreconditionFailed, etc.). The wizard treats `policy_blocked` as
  the "open override dialog" trigger; `error` is the terminal-of-the-
  stream.
- *Recommend:* lock as-is. Consistent with other error paths.

**Q-44.I — Carry-forward push from S#43**
- Local main is **at origin/main** (2aec7f4 just pushed). No
  unpushed commits at S#44 start.
- *Recommend:* nothing to push. Push D1 at session close.
- **STATUS: AUTO-RESOLVED.**

**Q-44.J — Visual smoke vs preview MCP host-env bug**
- *Pre-filled:* skip preview MCP per `preview_mcp_node_env.md`. D1
  is backend-only; integration test SSE-stream assertion is primary
  evidence. D2 (S#45) re-evaluates if frontend wizard work needs the
  preview.
- *Recommend:* same playbook as S#42/S#43.

**Q-44.K — Should we update PLAN-v3 §3 architecture doc this session?**
- *Pre-filled:* defer per S#39 carry-forward §7. PLAN-v3 §3 still
  references `services/grok.ts`; should point to `services/llm/` +
  `services/prompt-assist/` + `services/policy-rules/`. v3 doc rev is
  an end-of-D-phase task once all lanes are shipping.
- *Recommend:* defer.

---

## Estimate

- S#44 scope: **~2h** per PLAN-v3 §7 row 8.
- Pre-align Qs: ~5-10 min (Q-44.A–K; I auto-resolved).
- `build-check-input.ts` + unit test: ~25 min.
- `WorkflowRunParams` delta + SSE event types: ~15 min.
- `ad-production/run.ts` integration (3 terminal sites + emit events
  + early-return on block): ~30 min.
- `data/policy-rules/hand-curated/meta.json` seed delta: ~5 min.
- Integration test (SSE trace + 3 paths): ~30 min.
- Runner unit test (stubbed checkPolicy): ~15 min.
- Regression + commit + push: ~10 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- No new runtime deps. D1 doesn't need any (zod + better-sqlite3 +
  policy-rules service all already in place).
- Show evidence before claiming done (HANDOFF rule #7) — for D1
  that means: regression green + integration test SSE trace asserts
  all 3 paths (block → policy_blocked + error + finalize-with-
  decision; warning → policy_warned + proceed + finalize-with-
  decision; clean → no policy event + finalize-without-decision).
- Node: `fnm exec --using=20 bash -lc "…"`.
- D1 = ~95% backend (1 schema delta on the SSE events crosses into
  `core/dto`, but the wizard consumption ships in D2). Preview MCP
  skipped per `preview_mcp_node_env.md`.
- **Memory updated at S#43 close**: `phase_status.md` rolled to "S#43
  closed; S#44 = D1 Meta Ads backend".

---

## Carry-forward (defer unless D1 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment.
6. `client/api/hooks.ts` (256) + `services/policy-rules/scraper.ts`
   (282) + `client/api/policy-rules-hooks.ts` (242, near soft cap) —
   split when content grows further.
7. **From S#39:** PLAN-v3 §3 still says `services/grok.ts`; should
   point to `services/llm/` + `services/prompt-assist/` +
   `services/policy-rules/`.
8. **From S#40:** preview MCP host-env bug — `npm rebuild
   better-sqlite3` against system Node + VS C++ toolchain may fix.
9. **From S#40:** hand-curated → AI-curated diff workflow (UX sketch
   only).
10. **From S#41:** consider promoting `PolicyRulesLoaderError` to
    its own ErrorCode union member if D-phase enforcement handlers
    need to discriminate. C3 introduced none — `BadRequestError` from
    `validateBody` covers preflight 400s.
11. **From S#41:** structured rule auto-extraction — defer per
    Q-42.E LOCKED.
12. **From S#42:** loader.ts:234 unused `eslint-disable no-console`
    directive — pre-existing warning. Sweep when bro cleans lint.
13. **From S#42:** real-world fixture refresh — synthetic fixtures
    used for unit tests. When bro fires the first manual scrape,
    capture real `<main>` blocks if shape differs.
14. **From S#42:** `scrapeAll` is sequential with 1s host delay —
    parallelize with per-host serialization if sources grow.
15. **From S#43:** text-area-ratio real check (sharp + OCR) — Q-43.C
    upgrade path. Lands in D-phase or dedicated session.
16. **From S#43:** `ruleSetVersion` field on PolicyDecision is
    reserved placeholder; D-phase fills it once rule-set hashing
    ships.
17. **From S#44:** per-asset policy gating (Q-44.B follow-up) — runs
    checkPolicy after each asset to catch resolution/file-size
    violations. Defers until v2 dogfooding finds the first false-pass.
18. **From S#44:** D2 (S#45) wizard mounts `PolicyOverrideDialog` +
    surfaces the preflight badge from `usePolicyPreflight()`. SSE
    event consumption (block/warning) lifts there too.

## Out of scope (this session)

- Wizard frontend / preflight badge UI (D2 = S#45).
- `PolicyOverrideDialog` mounting on a real call site (D2).
- text-area-ratio image-analysis check (sharp + OCR — D-phase).
- `ruleSetVersion` hashing.
- Per-asset policy gating.
- Google Ads / Play ASO mappers (E/F sessions).
- Override admin gate (no auth model in v2).

---

## Remaining sessions after S#44 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after D1:** ~8.5h across 4 sessions. PLAN-v3 closes
after S#48 + 1 week of bro dogfooding.

---

*Session #43 closed 2026-04-25 with C3 enforcement shipped: 951/965
green, commit `2aec7f4` on `origin/main` (push complete). S#44 = Phase
D1 Meta Ads backend per PLAN-v3 §7 row 8. Pre-align Qs Q-44.A–K
pre-filled; Q-44.I auto-resolved (nothing unpushed). Bro skim + fire.
Next: HANDOFF-SESSION45.md for D2 Meta Ads frontend drafted at S#44
close.*
