# Mega-Session Handoff — Phases D1 → F2 (S#44 consolidated)

Paste at the start of S#44 to drive the **entire remaining PLAN-v3
roadmap** (D1 + D2 + E + F1 + F2) in one session. Approach B (per
S#43-close concern resolution): single session, but **5 mandatory
checkpoint gates** — regression must be green + commit + push BEFORE
moving to the next phase. If any phase blows budget or hits an
unresolvable Q, halt and resume next session.

This supersedes `HANDOFF-SESSION44.md` (D1-only draft from S#43
close). All cross-session Qs (X-1 to X-8) and per-phase Qs are
**LOCKED to bro-confirmed recommends** — no pre-align round needed.
Bro reads + fires.

---

## Where we stopped (end of Session #43 — 2026-04-25)

- **Phase C3 shipped + pushed.** Commit `2aec7f4` on `origin/main`. C3
  enforcement layer wired end-to-end:
  - `PolicyDecision` schema + 6 per-kind checkers + `checkPolicy()`
    pure aggregator.
  - `POST /api/policy-rules/preflight` route.
  - `batch-repo.updatePolicyDecision()` + `finalizeBatch({…,
    policyDecision?})` audit-blob writer.
  - `usePolicyPreflight()` hook + standalone `PolicyOverrideDialog`
    (NOT mounted — D2 lifts it).
- **Regression: 951 / 13 skipped / 1 todo / 965 total.** All Q-43.A–L
  LOCKED (Q-43.K auto-resolved).
- **Carry-forward push from S#43:** `8653e99` (HANDOFF-S44 D1-only
  draft, now superseded by this mega-handoff).

## Current repo state (verify before firing Phase 1)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5                      # 8653e99 + 2aec7f4 on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 951 / 965 baseline before Phase 1 mutates
```

---

## Cross-session locks (X-1 to X-8) — LOCKED 2026-04-25

| # | Decision | Locked recommend |
|---|----------|------------------|
| **X-1** | Per-lane workflows | **Meta = wire existing `ad-production`** (already targets Meta ads since S#15). **Google = NEW `google-ads`** workflow added to `WORKFLOW_IDS`. **Play = wire existing `aso-screenshots`** (S#23). All 3 reuse `build-check-input.ts` (single mapper file w/ per-platform helpers). |
| **X-2** | SSE policy events | Platform-agnostic — `policy_blocked` + `policy_warned` carry `{decision: PolicyDecision, batchId}`. Wizard dispatches off `decision`, not event type. |
| **X-3** | `policyOverrides` on `WorkflowRunParams` | Single optional field shared across all 4 workflows. Runners that don't enforce ignore it. |
| **X-4** | Wizard chassis | Generic `<PolicyAwareWizard config={...}>` ships in D2 (Phase 2). Reused by E/F2 with different lane configs. ~40% LOC saved across 3 wizards. |
| **X-5** | Lane CTA on Home | D2 replaces the toast for Meta lane. E/F2 do their own lanes. Pattern: `router.push("/wizard/<lane>")`. |
| **X-6** | Hand-curated rule seeds | Each lane gets 2 placeholder rules (1 block keyword + 1 warning keyword) for integration coverage. Bro replaces with real policy text during dogfood. |
| **X-7** | E (Google Ads) split | Full-vertical 1 phase (~2h per PLAN-v3 §7). Re-evaluate split if D2 chassis lands cleanly enough that E reuse drops scope. |
| **X-8** | Play ASO workflow | Reuse existing `aso-screenshots` (S#23) — F1 wires policy-rules layer; F2 = wizard mount. Same D1 pattern. |

---

# Phase 1 / D1 — Meta Ads backend (~2h)

## Goal

Wire the **`ad-production` workflow runner** to fire `checkPolicy` at
batch start, thread the decision through to all 3 terminal
`finalizeBatch` calls (completed / aborted / error), and emit policy
SSE events. Backend-only — D2 mounts the wizard.

## Deliverables

1. **`build-check-input.ts`** —
   `src/server/services/policy-rules/build-check-input.ts` (~80 LOC).
   Pure mapper with per-platform helpers:
   - `buildMetaCheckInput(profile, adProductionInput, runParams,
     prompt, copyTexts) => PolicyCheckInput`
   - `buildGoogleAdsCheckInput(...)` (E placeholder, NOT impl in D1)
   - `buildPlayCheckInput(...)` (F1 placeholder, NOT impl in D1)
   - `platform: "meta"`, `prompt`, `copyTexts`,
     `assetAspectRatio` from `WorkflowRunParams.aspectRatio`.
   - `asset{Width,Height,FileSize}` NOT supplied at runner-start
     (Q-44.B — per-asset hook deferred to v3).

2. **`WorkflowRunParams` delta** — add
   `policyOverrides?: PolicyOverride[]` (optional). POST
   `/api/workflows/:id/run` body schema mirrors. ~10 LOC.

3. **SSE event types** —
   `src/core/dto/workflow-events.ts` (or wherever the SSE union
   lives) adds 2 variants:
   ```ts
   { type: "policy_blocked"; decision: PolicyDecision; batchId: string }
   { type: "policy_warned"; decision: PolicyDecision; batchId: string }
   ```
   ~30 LOC delta.

4. **`ad-production/run.ts` integration** — ~50 LOC delta:
   - After `batchRepo.create`, run concept-0 prompt-composer once →
     get `prompt` + `copyTexts` for preflight.
   - Call `checkPolicy(buildMetaCheckInput(...), {overrides})`.
   - `decision.ok === false` → emit `policy_blocked` SSE → call
     `finalizeBatch({status:"error", policyDecision: decision})` →
     emit `error` event with `code:"PolicyBlocked"` → return early.
   - `decision.violations.length > 0` (warnings only) → emit
     `policy_warned` → proceed normally; pass `policyDecision` into
     all 3 terminal `finalizeBatch` calls.
   - `decision` clean (no violations + no overrides) → no policy
     event; pass `policyDecision: undefined` to finalize calls
     (Q-44.F skip-on-empty).

5. **Hand-curated Meta seed delta** —
   `data/policy-rules/hand-curated/meta.json` adds 2 rules:
   - `severity:"block"`, `kind:"keyword-blocklist"`, keywords:
     `["miracle"]`, category `"claims"`.
   - `severity:"warning"`, `kind:"keyword-blocklist"`, keywords:
     `["unbeatable"]`, category `"claims"`.

6. **Tests**:
   - `tests/unit/build-check-input.test.ts` (~80 LOC) — mapper
     round-trip per platform helper.
   - `tests/unit/ad-production-run-policy.test.ts` (~100 LOC) —
     runner stubs `checkPolicy`, asserts decision threads through 3
     finalize sites.
   - `tests/integration/ad-production-policy.test.ts` (~150 LOC) —
     SSE-stream assertions:
     - block → `policy_blocked` + `error`, decision in audit blob.
     - warning → `policy_warned`, batch proceeds, decision in audit.
     - clean → no policy event, decision NOT in audit (Q-44.F).
     - override clears warning → same as clean path.

## Per-phase Qs (Q-44.A–K) — LOCKED

| Q | Decision |
|---|----------|
| Q-44.A | `ad-production` only (X-1: Meta = ad-production) |
| Q-44.B | runner-start preflight; per-asset gating deferred |
| Q-44.C | `policyOverrides?: PolicyOverride[]` on WorkflowRunParams |
| Q-44.D | 2 SSE variants (blocked + warned) — discriminate at frontend |
| Q-44.E | Hand-curated meta seed: 1 block "miracle" + 1 warning "unbeatable" |
| Q-44.F | Skip audit-blob write on empty decision |
| Q-44.G | Concept-0 composer output as preflight prompt |
| Q-44.H | Block path: `policy_blocked` → `finalize(error)` → `error` event |
| Q-44.I | AUTO-RESOLVED — nothing unpushed at S#44 start |
| Q-44.J | Skip preview MCP per host-env bug |
| Q-44.K | Defer PLAN-v3 §3 doc rev to end of D-phase |

## LOC budget

| File | Budget |
|------|--------|
| `services/policy-rules/build-check-input.ts` | ~80 |
| `core/dto/workflow-events.ts` (delta) | +30 |
| `workflows/ad-production/run.ts` (delta) | +50 |
| `data/policy-rules/hand-curated/meta.json` (delta) | +20 |
| `WorkflowRunParams` + body schema delta | +10 |
| 3 test files | ~330 |
| **Phase 1 total** | **~520 LOC** |

## ✅ Checkpoint Gate 1 (REQUIRED before Phase 2)

```bash
fnm exec --using=20 bash -lc "npm run regression:full"
# expect ~951 + (~10-15 new D1 tests) = ~961-966 / ~975-980 total
git add -A && git commit -m "feat(workflows): D1 Meta — checkPolicy wired into ad-production runner"
git push origin main
```
**STOP if regression fails or unresolvable Q surfaces.** Resume next
session with phase-specific handoff (or fix-then-continue).

---

# Phase 2 / D2 — Meta Ads frontend + wizard chassis (~2.5h)

## Goal

Build the **generic `<PolicyAwareWizard>` chassis** (X-4 LOCKED), mount
it for the Meta lane, lift `PolicyOverrideDialog` into the preflight
call site (Q-43.H carry-over), replace the Home Meta-lane CTA toast
with router push (X-5 LOCKED). Frontend-only.

## Deliverables

1. **`<PolicyAwareWizard>` chassis** —
   `src/client/components/PolicyAwareWizard.tsx` (~200 LOC).
   Props-driven: `{laneConfig: LaneWizardConfig, onSubmit:
   (input) => Promise<void>}`. Handles:
   - Step list rendering (Step 1 inputs → Step 2 review → Step 3
     preflight → Step 4 run).
   - `usePolicyPreflight()` integration on Step 3.
   - `PolicyOverrideDialog` mount when `decision.violations.length >
     0` and bro clicks "Resolve overrides".
   - SSE consumption via existing `useWorkflowRun` hook (extend to
     expose policy events).

2. **`LaneWizardConfig` type** —
   `src/client/lane-wizards/types.ts` (~50 LOC). Shape:
   ```ts
   {
     workflowId: WorkflowId,
     platform: PolicyPlatform,
     stepFields: StepFieldsRenderer,
     buildPreflightInput: (formState) => PolicyPreflightInput,
     buildRunInput: (formState, overrides) => WorkflowRunRequest,
   }
   ```
   Used by D2/E/F2.

3. **Meta lane config** —
   `src/client/lane-wizards/meta-config.ts` (~120 LOC).
   - Step 1: profile pick + featureFocus + conceptCount/variants.
   - Step 2: aspect ratio + locale.
   - Step 3: preflight badge (calls `usePolicyPreflight`).
   - Step 4: run + SSE pane.

4. **Wizard route** —
   `src/client/pages/MetaWizard.tsx` (~50 LOC). Mounts
   `<PolicyAwareWizard config={metaConfig} />` at
   `/wizard/meta-ads`.

5. **Home CTA replacement** —
   `src/client/pages/Home.tsx` delta (~10 LOC). Meta lane CTA card
   `onClick` → `router.push("/wizard/meta-ads")` (replace toast).
   Keep the toast for Google/Play CTAs until E/F2 ship.

6. **`useWorkflowRun` extension** —
   `src/client/api/workflow-run-hook.ts` delta (~30 LOC). Surfaces
   `policyEvent: PolicyEvent | null` alongside existing `events[]` so
   wizard can react.

7. **Tests**:
   - `tests/unit/policy-aware-wizard.test.tsx` (~150 LOC) — chassis
     renders steps, preflight badge fires, override dialog opens on
     `policy_blocked`.
   - `tests/unit/meta-config.test.ts` (~50 LOC) — mapper builds
     correct PolicyPreflightInput from form state.
   - `tests/unit/home-page-meta-cta.test.tsx` delta (~30 LOC) — CTA
     click invokes router push.

## Per-phase Qs (Q-45.A–E) — LOCKED

| Q | Decision |
|---|----------|
| Q-45.A | Chassis API: `<PolicyAwareWizard config={laneConfig}>` (X-4) |
| Q-45.B | SSE consumption: extend `useWorkflowRun` to expose `policyEvent` |
| Q-45.C | Override-dialog UX: modal (already built in C3) |
| Q-45.D | Preflight badge: manual button + auto-fire on Step-3 mount |
| Q-45.E | Home Meta CTA: `router.push("/wizard/meta-ads")` (X-5) |

## LOC budget

| File | Budget |
|------|--------|
| `components/PolicyAwareWizard.tsx` | ~200 |
| `lane-wizards/types.ts` | ~50 |
| `lane-wizards/meta-config.ts` | ~120 |
| `pages/MetaWizard.tsx` | ~50 |
| `pages/Home.tsx` (delta) | +10 |
| `api/workflow-run-hook.ts` (delta) | +30 |
| 3 test files | ~230 |
| **Phase 2 total** | **~690 LOC** |

## ✅ Checkpoint Gate 2 (REQUIRED before Phase 3)

```bash
fnm exec --using=20 bash -lc "npm run regression:full"
git add -A && git commit -m "feat(wizard): D2 Meta — PolicyAwareWizard chassis + Meta lane mount"
git push origin main
```

---

# Phase 3 / E — Google Ads lane (full-vertical, ~2h)

## Goal

Add **NEW `google-ads` workflow** (text-only ads — headlines + bodies,
no image gen), wire policy enforcement same pattern as D1, mount via
the chassis from D2.

## Deliverables

1. **`WORKFLOW_IDS` delta** —
   `src/core/design/types.ts` adds `"google-ads"` to the const
   array (~1 LOC). Color variant assignment (~5 LOC) — recommend
   `"sky"` (unused).

2. **`google-ads` workflow** —
   `src/workflows/google-ads/` new dir:
   - `index.ts` — workflow registration (~30 LOC).
   - `input-schema.ts` — `{headlineCount, descriptionCount,
     featureFocus}` zod (~25 LOC).
   - `prompt-composer.ts` — text-only prompts (~60 LOC).
   - `run.ts` — runner (~120 LOC). LLM-only (Gemini text via existing
     `prompt-assist` adapter — no image-gen step). Calls
     `checkPolicy(buildGoogleAdsCheckInput(...))` at batch start;
     same SSE event pattern as D1.
   - `types.ts` (~20 LOC).

3. **`buildGoogleAdsCheckInput`** —
   `services/policy-rules/build-check-input.ts` delta (~30 LOC).
   `platform: "google-ads"`, `prompt = headlines.join(" | ")`,
   `copyTexts = descriptions`. No asset-* (text-only).

4. **Hand-curated Google Ads seed** —
   `data/policy-rules/hand-curated/google-ads.json` new file (~25
   LOC):
   - 1 block "lawsuit" (legal risk)
   - 1 warning "click here" (Google Ads style discouragement)

5. **Google lane config** —
   `src/client/lane-wizards/google-config.ts` (~100 LOC). Same
   `LaneWizardConfig` shape as Meta; different fields + mapper.

6. **Google wizard route** —
   `src/client/pages/GoogleWizard.tsx` (~30 LOC). Mounts
   `<PolicyAwareWizard config={googleConfig}>` at
   `/wizard/google-ads`.

7. **Home CTA delta** —
   `pages/Home.tsx` (~5 LOC). Replace Google toast with
   `router.push("/wizard/google-ads")`.

8. **Tests**:
   - `tests/unit/google-ads-prompt-composer.test.ts` (~60 LOC).
   - `tests/unit/google-ads-run-policy.test.ts` (~100 LOC) —
     runner stubs `checkPolicy`, threads decision through finalize.
   - `tests/integration/google-ads-policy.test.ts` (~120 LOC) —
     full SSE assertion.
   - `tests/unit/google-config.test.ts` (~50 LOC) — chassis
     mapper.

## Per-phase Qs (Q-46.A–E) — LOCKED

| Q | Decision |
|---|----------|
| Q-46.A | Input schema: `{headlineCount, descriptionCount, featureFocus}` (text-only) |
| Q-46.B | PolicyCheckInput: `prompt = headlines.join`, `copyTexts = descriptions` |
| Q-46.C | LLM-only via existing `prompt-assist` Gemini text adapter |
| Q-46.D | Seed: 1 block "lawsuit" + 1 warning "click here" |
| Q-46.E | Wizard reuses D2 chassis with `googleConfig` |

## LOC budget

| File | Budget |
|------|--------|
| `core/design/types.ts` (delta) | +5 |
| `workflows/google-ads/` (5 files) | ~255 |
| `services/policy-rules/build-check-input.ts` (delta) | +30 |
| `data/policy-rules/hand-curated/google-ads.json` | ~25 |
| `lane-wizards/google-config.ts` | ~100 |
| `pages/GoogleWizard.tsx` + Home delta | ~35 |
| 4 test files | ~330 |
| **Phase 3 total** | **~780 LOC** |

## ✅ Checkpoint Gate 3 (REQUIRED before Phase 4)

```bash
fnm exec --using=20 bash -lc "npm run regression:full"
git add -A && git commit -m "feat(workflows): E Google Ads — new workflow + lane wizard"
git push origin main
```

---

# Phase 4 / F1 — Play ASO backend (~2h)

## Goal

Wire **existing `aso-screenshots` workflow** (S#23) with the same
policy-enforcement pattern as D1. Backend-only — F2 mounts the wizard.

## Deliverables

1. **`buildPlayCheckInput`** —
   `services/policy-rules/build-check-input.ts` delta (~40 LOC).
   `platform: "play"`, `prompt = combined screenshot prompts`,
   `copyTexts = captions/titles`, asset-* derived from screenshot
   dimensions when available.

2. **`aso-screenshots/run.ts` integration** — ~50 LOC delta. Same
   pattern as D1: preflight at batch-start, SSE events, decision
   threaded through 3 finalize calls.

3. **Hand-curated Play seed** —
   `data/policy-rules/hand-curated/play-aso.json` new file (~25
   LOC):
   - 1 block "free download" (incentive against Play guidelines)
   - 1 warning "5 stars" (review-rating manipulation)

4. **Tests**:
   - `tests/unit/aso-screenshots-run-policy.test.ts` (~100 LOC).
   - `tests/integration/aso-screenshots-policy.test.ts` (~150
     LOC) — SSE assertion.
   - `tests/unit/build-check-input.test.ts` delta (~30 LOC) — Play
     mapper round-trip.

## Per-phase Qs (Q-47.A–C) — LOCKED

| Q | Decision |
|---|----------|
| Q-47.A | Reuse `aso-screenshots`; same wiring as D1 |
| Q-47.B | `prompt = combined screenshot prompts`, `copyTexts = captions`, asset-* from dimensions |
| Q-47.C | Seed: 1 block "free download" + 1 warning "5 stars" |

## LOC budget

| File | Budget |
|------|--------|
| `services/policy-rules/build-check-input.ts` (delta) | +40 |
| `workflows/aso-screenshots/run.ts` (delta) | +50 |
| `data/policy-rules/hand-curated/play-aso.json` | ~25 |
| 3 test files | ~280 |
| **Phase 4 total** | **~395 LOC** |

## ✅ Checkpoint Gate 4 (REQUIRED before Phase 5)

```bash
fnm exec --using=20 bash -lc "npm run regression:full"
git add -A && git commit -m "feat(workflows): F1 Play — checkPolicy wired into aso-screenshots"
git push origin main
```

---

# Phase 5 / F2 — Play ASO frontend (~2h)

## Goal

Mount `<PolicyAwareWizard>` for Play lane. Replace Home Play-lane CTA
toast.

## Deliverables

1. **Play lane config** —
   `src/client/lane-wizards/play-config.ts` (~110 LOC).
   `LaneWizardConfig` for ASO screenshots — fields: profile +
   screenshot count + locale + caption inputs.

2. **Play wizard route** —
   `src/client/pages/PlayWizard.tsx` (~30 LOC). Mounts
   `<PolicyAwareWizard config={playConfig}>` at `/wizard/play-aso`.

3. **Home CTA delta** —
   `pages/Home.tsx` (~5 LOC). Replace Play toast with
   `router.push("/wizard/play-aso")`.

4. **Tests**:
   - `tests/unit/play-config.test.ts` (~50 LOC) — chassis mapper.
   - `tests/unit/home-page-play-cta.test.tsx` delta (~20 LOC) —
     CTA click → router push.
   - `tests/integration/play-wizard-flow.test.tsx` (~120 LOC) —
     end-to-end Step 1 → Step 4 with stubbed SSE + override dialog
     interaction.

## Per-phase Qs (Q-48.A–B) — LOCKED

| Q | Decision |
|---|----------|
| Q-48.A | Reuse D2 chassis with `playConfig` |
| Q-48.B | Home Play CTA: `router.push("/wizard/play-aso")` (X-5) |

## LOC budget

| File | Budget |
|------|--------|
| `lane-wizards/play-config.ts` | ~110 |
| `pages/PlayWizard.tsx` + Home delta | ~35 |
| 3 test files | ~190 |
| **Phase 5 total** | **~335 LOC** |

## ✅ Checkpoint Gate 5 (FINAL — close session)

```bash
fnm exec --using=20 bash -lc "npm run regression:full"
git add -A && git commit -m "feat(wizard): F2 Play — wizard mount + Home CTA replacement"
git push origin main
# Then: update memory + draft HANDOFF-DOGFOOD.md (carry-forward)
```

---

## Mega-session totals

| Phase | LOC | Time | Cumulative |
|-------|-----|------|------------|
| D1 | ~520 | 2h | 2h |
| D2 | ~690 | 2.5h | 4.5h |
| E | ~780 | 2h | 6.5h |
| F1 | ~395 | 2h | 8.5h |
| F2 | ~335 | 2h | 10.5h |
| **Total** | **~2720** | **10.5h** | — |

---

## Working style (mega-session enforcement)

- Bro is bro. VN/EN, concise.
- **Cross-session locks (X-1 to X-8) + per-phase Qs are LOCKED — no
  re-align rounds.** If a hidden Q surfaces mid-phase, halt + ask
  ONE clarifying question, then proceed.
- **Checkpoint gate enforcement:** regression must pass + commit must
  push BEFORE next phase. Failure → halt session, leave a phase-
  specific handoff for the next session.
- <300 content LOC hard cap per file (250 soft).
- **No new runtime deps across all 5 phases.** Stack is stable —
  Hono + zod + better-sqlite3 + react-query are sufficient.
- Show evidence per HANDOFF rule #7: regression-green test count +
  SSE trace + integration assertions per phase.
- Node: `fnm exec --using=20 bash -lc "…"`.
- Preview MCP skipped per `preview_mcp_node_env.md`. D2/F2 frontend
  evidence = vitest+jsdom unit tests + integration `<PolicyAwareWizard>`
  flow tests.
- **Commit per phase, push per phase.** No squash; preserve phase
  granularity for revertability.

---

## Carry-forward (defer beyond this session)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment.
6. `client/api/hooks.ts` (256) + `services/policy-rules/scraper.ts`
   (282) + `policy-rules-hooks.ts` (242) — soft cap 250 watch.
7. **From S#39:** PLAN-v3 §3 architecture revision — schedule
   end-of-D-phase doc rev (post Phase 5).
8. **From S#40:** preview MCP host-env bug — `npm rebuild
   better-sqlite3` against system Node + VS C++ may fix.
9. **From S#40:** hand-curated → AI-curated diff workflow.
10. **From S#41:** `PolicyRulesLoaderError` → ErrorCode union — keep
    deferred (no D-phase need).
11. **From S#42:** `loader.ts:234` lint `no-console` — sweep when
    bro cleans lint.
12. **From S#42:** Real-world fixture refresh — capture real `<main>`
    blocks during first manual scrape.
13. **From S#42:** `scrapeAll` parallelize with per-host
    serialization if sources grow.
14. **From S#43:** text-area-ratio sharp+OCR check (Q-43.C upgrade).
15. **From S#43:** `ruleSetVersion` rule-set hashing.
16. **From mega-session:** Per-asset policy gating (Q-44.B follow-up)
    — runs `checkPolicy` after each asset to catch resolution/file-
    size violations. Defers until v2 dogfood finds first false-pass.
17. **From mega-session:** `WORKFLOW_IDS` color variant assignment
    for `google-ads` — recommended `"sky"` LOCKED (extend if bro
    prefers another).
18. **Post-mega-session:** 1 week dogfood — bro fires real batches
    across Meta/Google/Play, captures false-positives + false-
    negatives in policy enforcement, opens cleanup PR (consider
    `/schedule` agent in 2 weeks for the follow-up).

## Out of scope (entire mega-session)

- text-area-ratio image-analysis (sharp + OCR — D-phase post-mega).
- `ruleSetVersion` hashing (D-phase post-mega).
- Per-asset policy gating (deferred to dogfood follow-up).
- Override admin gate (no auth model in v2).
- Diff-viewer UI for hand-curated vs scraped.
- Real-world Meta/Google/Play policy text — placeholders ship; bro
  swaps during dogfood.

---

## Session close ritual (after Checkpoint Gate 5)

1. Update `phase_status.md` memory: "S#44 mega closed, all PLAN-v3
   D/E/F shipped. Total commits: 5. Regression: NNN/MMM."
2. Update `MEMORY.md` index entry.
3. Draft `HANDOFF-DOGFOOD.md` — 1-week soak window guidance, what
   metrics to capture (false-positives, override-frequency,
   regression on real Meta/Google/Play scrapes after first manual
   `npm run scrape-policy-rules`).
4. Offer `/schedule` agent in 2 weeks to triage dogfood findings →
   cleanup PR.

---

*Mega-handoff drafted 2026-04-25 at S#43 close. All cross-session
locks + per-phase Qs LOCKED to bro-confirmed recommends. 5 mandatory
checkpoint gates enforce regression-green + push-per-phase
discipline. Halt + leave per-phase handoff if any gate fails. Bro
fires when ready. PLAN-v3 closes after Checkpoint Gate 5 + 1-week
dogfood window.*
