# PHASE-STATUS — Images Gen Art

Current phase: **Phase 3 — IN PROGRESS ⏳** (Steps 1-8 of 9 shipped, 345/345 regression green (full suite), client Workflow + Gallery pages live, SSE wire proved end-to-end in browser, dispatcher post-abort grace window fix, 3 new dispatcher tests locked)
Last updated: 2026-04-23 (interim hotfixes between Session #16 and #17 — browser smoke happy path + deep-link CTA PASS in Chrome; 2 client hotfixes landed: cancel race guard + EventLog memoization. Cancel mid-flight flow still pending manual verify — Mock at 20ms/image finishes too fast for human click.)

## Phase 3 Summary

| Step | Title | Status |
|---|---|---|
| 1 | Templates loader + cache (`src/server/templates/`) | ✅ Session #10 — 3 files + 9 tests |
| 2 | Workflow types + dispatcher core + abort registry + precondition | ✅ Session #10 — 5 files + 14 tests |
| 3 | First workflow: `artwork-batch` (Mock) | ✅ Session #11 — 5 workflow files + 2 server updates + 23 tests |
| 4 | `workflow-runs` route + SSE streaming + cancel | ✅ Session #12 — 3 route files + app.ts mount + 11 integration tests |
| 5 | Profiles + templates + providers routes | ✅ Session #13 — 4 route files + 2 repo helpers + 35 integration tests |
| 6 | Keys + assets + profile-assets routes | ✅ Session #14 — 5 route files + multipart helper + profile-assets-repo + 54 tests |
| 7 | 3 remaining workflows (ad-production / style-transform / aso-screenshots) | ✅ Session #15 — 21 workflow files + 2 shared helpers + 4 test files + registry wire (45 new tests) |
| 8 | Client Workflow page + Gallery + SSE wire | ✅ Session #16 — 21 client files + 1 server fix (dispatcher grace window) + 1 server extension (assets batchId filter) + 3 dispatcher tests |
| 9 | DTO audit + full integration + PHASE-STATUS close | ⏳ Session #17 entry point |

## Completed in Session #16 (Phase 3 Step 8 — client Workflow page + Gallery + SSE wire)

### Scope decisions locked Session #16 (6 from bro's opening + 4 bonus refinements)

- **Q1 — Form-builder strategy = (a) hand-crafted sidecar per workflow.** 4 workflows × dedicated React component in `src/client/workflows/{wf}.tsx`; registry in `src/client/workflows/index.ts` maps WorkflowId → descriptor `{id, Component}`. Rejected (b) Zod `._def` introspection (fragile across Zod versions) and (c) `zod-to-json-schema` dep (each form still needs custom field UX — enum dropdowns, chip-picker with grey-out, screenshot picker — so the generic renderer wins little). Zero new npm deps.
- **Q2 — SSE transport = `fetch` + ReadableStream (via extended `useSSE`).** Native `EventSource` auto-reconnects (violates "no resume in v1" per PLAN §6.4) and doesn't support POST with body. Extended Phase 1 `useSSE` hook in-place (bonus A) with: `method?: "GET"|"POST"` + `body?: unknown` + `onEvent?` callback + imperative `abort()` in the return value. Pre-existing GET+no-body callers unaffected (no call sites except CONTRIBUTING example).
- **Q3 — style-transform source picker = dropdown + empty-state CTA** (refined). Screenshots listed from `profile.assets.screenshotUrls[]` (URL → asset-id via `/^\/api\/profile-assets\/([^/]+)\/file$/` regex). Empty state renders `<EmptyScreenshotState>` card: "No screenshots uploaded for {name}. Upload in Profile Manager (Phase 5)". Form still renders fully — user fills other fields — submit disabled via `onInputChange(null, "Pick a source screenshot")` returned by `parseInput`. Rule: form doesn't block render on missing data; error surfaces as a yellow hint line + disabled Run button.
- **Q4 — ASO targetLangs = chip-picker with model-aware grey-out + auto-deselect on model switch.** Reads `model.capability.supportedLanguages` to set `supportedLangs` Set; unsupported chips render `disabled` with `title="Not supported by {displayName}"`. When model switches (`modelId` ref tracks prior value), any already-picked langs not in the new model's set auto-deselect + toast "Removed {lang} — not supported by {newModel}" (variant=warning). If all picked langs become unsupported → fallback to `["en"]`. Preserves user intent without silent validity breaks.
- **Q5 — Gallery = default sort createdAt DESC + workflow-color chips + profile dropdown + batchId exact-match search + pagination 50/page (no tag filter).** Server `GET /api/assets` already serves `createdAt DESC`. Tag filter deferred — needs `?tags[]=` array query shape, which the current Zod schema doesn't support (would need `.extend` + repo multi-condition WHERE). Phase 3 polish or Phase 5.
- **Q6 — Cancel UX = confirm dialog w/ progress context (always) + aborted toast w/ Gallery CTA link** (refined). Confirm dialog body: `"{completedCount}/{total} assets generated. {remaining} remaining will be skipped."` — single path, cost-aware. Aborted toast: `"Batch aborted. {N}/{M} assets saved to Gallery."` + `[View in Gallery →]` CTA that calls `navigator.go("gallery", { batchId })` to deep-link. Toast auto-dismisses at 6s.

### Pre-code alignment resolutions (bro-approved before first edit)

- **Bonus A — Verified useSSE signature mismatch before coding.** Phase 1 shipped `useSSE(url, { enabled? })` — GET only, no body, no onEvent, no imperative abort. Extended the hook in-place (per bro's rule "If mismatch → extend existing hook, don't create new"). Back-compat preserved: omitting `method`/`body`/`onEvent` → GET fetch identical to prior behavior. Adds `abort: () => void` to return value (stable ref via `useRef`). Refs hold `body` + `onEvent` so their changes don't re-trigger the effect — captured at start-time inside `streamEvents()`.
- **Bonus B — Tokens + disabled variant.** Intentionally NOT adding a "disabled" column to `ColorVariantClasses` (would break `design-tokens.test` 5-variant guard). Chip disabled state uses ad-hoc Tailwind in `aso-screenshots.tsx`: `"border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed"` — visually distinct, not a color-variant axis. Rule 1 (no template interpolation) still satisfied via static classname literals.
- **Bonus C — Gallery batchId search = exact match via server `?batchId=` query + "Batch not found" heuristic.** Required server-side extension (3 files, ~4 LOC each): `AssetListFilter.batchId?` in types, WHERE clause in `asset-repo.list`, `batchId` in `AssetListQuerySchema` + `coerceQuery`. Validate-on-blur + Enter keypress commits. UI shows yellow "Batch not found — 0 assets." when filter applied + result count is 0. Clear button resets.
- **Bonus D — Per-workflow Concept shape in image_generated.** Asset card currently renders canonical `AssetDto` (workflowId badge, size, seed) — workflow-specific concept fields (ad's `featureFocus`, style's `styleDnaKey`, aso's `layoutId`) live on the `concept_generated` event but are NOT embedded in AssetDto. For Phase 3 MVP, the detail modal exposes `variantGroup` (encodes layout+copyKey-ish info per writer) + tags; richer per-workflow rendering lands with Phase 5 Replay UI (needs replayPayload enrichment anyway). Noted as known-pending.
- **Bonus E — Cancel button placement = RunStatusBar component, shown only while `run.runState === "running"`.** Hidden when idle / complete / aborted / error. No stale button ever appears post-batch.

### New client files (21 files, ~1860 LOC, all under 300 hard cap)

**Router + toast + nav (5 files):**
- `src/client/navigator.ts` (21) — `Page = "home"|"workflow"|"gallery"`, `NavParams = {batchId?}`, `Navigator` interface.
- `src/client/components/TopNav.tsx` (57) — sticky top-nav w/ 3 NavLink buttons + app title (also clickable home).
- `src/client/components/ToastHost.tsx` (117) — `useToastStack()` hook + `<ToastHost>` component + `<ToastItem>`. Auto-dismiss 6s. Variant-colored via COLOR_CLASSES badge. Optional CTA button. `type ShowToast` exported for prop-drilling.
- `src/client/components/ConfirmDialog.tsx` (76) — modal w/ Esc + backdrop dismiss, danger/indigo variant. Single path per Q6 refine.
- `src/client/App.tsx` (27, rewrite) — owns `page + params` state, toast stack; prop-drills `navigator` + `showToast` to pages. Route via `page === "x" && <X .../>`.

**Page-level components (8 files):**
- `src/client/components/WorkflowPicker.tsx` (39) — 4-card workflow picker themed per colorVariant (violet/blue/pink/emerald).
- `src/client/components/ProfileSelector.tsx` (47) — profiles dropdown with loading / error / empty states.
- `src/client/components/ProviderModelSelector.tsx` (107) — 2-dropdown (provider + provider-scoped models) + compat badge (derived from matrix lookup, reason + override tag + recommended tag).
- `src/client/components/TopLevelSelectors.tsx` (53) — aspectRatio + language selects scoped to model.capability. Disabled when model null.
- `src/client/components/RunStatusBar.tsx` (40) — progress bar (count/total) + Cancel button, color from workflow variant.
- `src/client/components/EventLog.tsx` (56) — scrollable event stream with auto-scroll + per-type color + summary line.
- `src/client/components/AssetFilterBar.tsx` (122) — profile dropdown + workflow chip toggles + batchId search w/ validate-on-blur + Clear + "Batch not found" hint.
- `src/client/components/AssetThumbnail.tsx` (41) — square card, lazy-load `/api/assets/:id/file`, error state w/ red border + errorMessage, workflow-badge overlay.
- `src/client/components/AssetDetailModal.tsx` (125) — full-asset inspector modal (img + metadata + download button + "filter by batch" CTA).

**Sidecar workflow forms (6 files):**
- `src/client/workflows/types.ts` (23) — `WorkflowFormProps` + `WorkflowFormDescriptor` types.
- `src/client/workflows/artwork-batch.tsx` (106) — group (8 keys) + subjectDescription + conceptCount + variantsPerConcept + seed.
- `src/client/workflows/ad-production.tsx` (90) — featureFocus (7-value enum) + conceptCount + variantsPerConcept + seed.
- `src/client/workflows/style-transform.tsx` (145) — sourceImageAssetId (extracted from profile screenshotUrls) + styleDnaKey (ANIME/GHIBLI/PIXAR) + conceptCount + variantsPerConcept + seed; empty-state CTA card.
- `src/client/workflows/aso-screenshots.tsx` (134) — targetLangs chip-picker (10 CopyLangs, max 3, model-aware grey-out + auto-deselect on model switch) + conceptCount + variantsPerConcept + seed.
- `src/client/workflows/index.ts` (13) — `WORKFLOW_FORMS` registry keyed by WorkflowId.

**Pages (3 files):**
- `src/client/pages/Home.tsx` (72, rewrite) — added onNav prop + 2 CTA buttons ("Run a workflow →" / "Open Gallery"). Health badge unchanged.
- `src/client/pages/Workflow.tsx` (187) — page composition: workflow picker → profile → provider/model → top-level selectors → form slot (dispatches to sidecar descriptor) → Run button → RunStatusBar during run → EventLog → ConfirmDialog. Runs orchestrated via `useWorkflowRun` hook.
- `src/client/pages/Gallery.tsx` (127) — filter bar + grid (2/4/6 col responsive) + pagination + detail modal. Deep-links from navigator.params.batchId.

**Custom hooks (2 extensions + 1 new):**
- `src/client/utils/use-sse.ts` (140, rewrite) — extended with method/body/onEvent/imperative abort. Refs for body + onEvent so caller rerenders don't retrigger the effect.
- `src/client/utils/use-workflow-run.ts` (122) — wraps useSSE with WorkflowEvent parsing + batch-state tracking. Emits toasts on complete/aborted w/ Gallery CTA. Returns `{runState, batchId, total, completedCount, events, start, cancel}`.
- `src/client/api/hooks.ts` (+90 extend) — `useWorkflows()`, `useProfiles()`, `useProfile(id|null)`, `useProviders()`, `useCompatibility()`, `useAssets(filter, refreshKey?)`; shared `useFetch<T>(path|null)` helper (one-shot GET + AbortController cleanup); `lookupCompat(matrix, wfId, pId, mId)` helper.

**Styles (1 extend):**
- `src/client/styles/index.css` — added `.input` component class (Tailwind `@apply`) for form inputs/selects. Avoids repeating the full class string at every `<input>` / `<select>` site (Rule 1 compliance — static classname literal, no template interpolation).

### Server-side fixes (2 files updated + 4 files extended)

- **`src/server/workflows-runtime/dispatcher.ts` — post-abort grace window fix.** Previous impl early-returned on ANY non-`aborted` event post-abort, which cut off the `error` frame that provider.generate throws when its AbortSignal listener fires. The workflow's next-iter abort check (which yields `aborted`) thus never ran because the for-await loop was already broken. New policy: allow up to POST_ABORT_GRACE=5 events after abort; terminate on `aborted` or `complete`; defensive-return only if workflow keeps yielding normal events past the grace window (truly unresponsive). Session #10 D2 intent preserved (workflow owns aborted emission, dispatcher is backstop).
- **Asset list filter — batchId support (4 files, ~4 LOC each):**
  - `src/server/asset-store/types.ts` — `AssetListFilter.batchId?: string` added.
  - `src/server/asset-store/asset-repo.ts` — WHERE clause in `list()` includes batch_id when filter.batchId set.
  - `src/server/routes/assets.body.ts` — `AssetListQuerySchema.batchId: z.string().min(1).optional()`.
  - `src/server/routes/assets.ts` — `coerceQuery` reads "batchId"; filter construction includes batchId when set.

### New tests (3 cases)

- `tests/unit/workflow-dispatcher.test.ts` (131, 3 cases) — NEW file. Locks the grace-window policy:
  1. Workflow emits `started → image_generated → abort → error → aborted` → dispatcher forwards all 4.
  2. Workflow emits `started → image_generated × 11 → abort` (no terminal) → dispatcher cuts off ≤ 7 events (2 pre-abort + 5 grace), never sees aborted.
  3. Workflow ignores abort and emits `complete` → dispatcher forwards complete within grace (no early cutoff).

### QA gate (Session #16 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 153 src files (+23 since Session #15), 0 violations
         largest client: Workflow.tsx 187 LOC (refactored — SSE logic extracted to use-workflow-run.ts)
         largest overall: keys.ts 262 LOC (unchanged)
test: 345/345 pass (34 files; full `regression:full` suite)
  breakdown: unit 231 + integration 101 + extraction 13
  prior:   342 (Session #15 baseline, full suite)
  new:     +3 (dispatcher grace-window policy tests)
  regression: clean; no pre-existing tests broken
build: vite bundle clean — 231.82 kB JS (70.63 kB gzip), 26.51 kB CSS
```

### Browser smoke (via curl — manual click-through pending by bro)

Could not click through UI from this shell, but verified the full wire end-to-end with curl:

1. **Dev server boots** — `npm run dev:server` + `npm run dev:client` in parallel; tsx watch compiles; vite serves index.html + TSX modules (react-refresh hot-inject working).
2. **API endpoints return data:** `GET /api/health`, `/api/workflows`, `/api/profiles` all respond with seeded chartlens/plant-identifier/ai-chatbot profiles + 4 workflows.
3. **SSE run happy path:** `POST /api/workflows/artwork-batch/run` with chartlens + mock + 1:1 + group=memory + 2 concepts × 1 variant + seed=42 → stream emits `started (total=2) → 2×(concept_generated + image_generated) → complete` with 2 AssetDto payloads. `replayClass=deterministic` on Mock.
4. **File stream:** `GET /api/assets/{id}/file` → 200 + `content-type: image/png` + `content-length: 5337`. Mock PNG valid.
5. **batchId filter:** `GET /api/assets?batchId=batch_FsHtU4lc6f` → returns only the 5 saved assets of that batch.
6. **Cancel E2E (mid-flight):** `POST /run` with 10 concepts × 4 variants = 40 total, DELETE `/runs/:batchId` at 50ms mark → stream terminates with `aborted` event `{completedCount: 5, totalCount: 40}`; DELETE returns 204; batch status="aborted" in DB. Grace-window fix verified live.

**Bro action item for session close:** Open http://localhost:5173 in Chrome/Edge, navigate Home → Workflow → pick artwork-batch → chartlens profile → mock provider → mock-fast → 1:1 → group=memory + subject="test" + conceptCount=2 → Run. Verify EventLog shows stream, toast fires on complete, "View in Gallery →" CTA deep-links to `/gallery` filtered by batchId. Also test Cancel mid-run on a larger batch.

### Known pending items (for Session #17 — Step 9)

1. **Full click-through browser smoke** — needs actual user-agent (Chrome/Edge) to finalize Step 8 sign-off per CLAUDE.md "Manual browser smoke required before session close". All 5 flows above are wire-proven via curl, but Q6 confirm dialog + toast CTA + deep-link behavior only truly validate in a real DOM.
2. **Integration tests for full workflow-cancel flow via HTTP** — Step 9 BOOTSTRAP-PHASE3 lists `tests/integration/workflows-cancel.test.ts` as a scope item. The curl smoke covered the wire live, but a vitest harness nailing `streamSSE + DELETE + aborted terminal event` in-process is missing. Should exercise the grace-window fix at the route layer.
3. **DTO-no-paths full sweep** — Step 9 `tests/integration/dto-no-paths.test.ts` walks every GET/POST route and checks response for banned keys. Per-route DTO mappers already enforce at write-time (spot checks in unit tests), but the tripwire test is missing.
4. **Per-workflow Concept metadata in Gallery** — AdConcept/StyleConcept/AsoConcept extension fields aren't surfaced on asset cards (Bonus D alignment). Phase 5 Replay UI embeds these via replayPayload enrichment anyway.
5. **Gallery tag filter** — bro-acknowledged deferral; needs Zod/asset-repo array query plumbing.
6. **Gallery total count** — `GET /api/assets` doesn't return `total`; pagination uses `currentCount === pageSize` heuristic to hide "Next" on the last full page. Will show "Next" enabled on exact-page-size edge case (benign). Consider adding `total: number` to response + pagination counter.
7. **Keys management UI** — endpoints live (Step 6), UI deferred per PLAN: "Client UI to manage them lands Phase 4 when real providers arrive".

## Next Session (#17) kickoff — Phase 3 Step 9

1. Read this file + `memory/MEMORY.md` to recover state. Verify baseline `npm run regression:full` = 345/345.
2. Read `BOOTSTRAP-PHASE3.md` Step 9 section (DTO audit + full integration + PHASE-STATUS close).
3. Add integration tests (est. ~20-30 new tests):
   - `tests/integration/workflows-full.test.ts` — one test per workflow, consume SSE to completion, assert event type sequence + DB persistence.
   - `tests/integration/workflows-cancel.test.ts` — exercise the dispatcher grace-window fix at the HTTP layer.
   - `tests/integration/profiles-crud.test.ts` — full CRUD with expectedVersion.
   - `tests/integration/keys-crud.test.ts` — gemini + vertex slot lifecycles.
   - `tests/integration/dto-no-paths.test.ts` — recursive scanner on all routes; banned keys list.
4. Manual browser E2E: run each of 4 workflows to completion + 1 cancel mid-batch.
5. Update PHASE-STATUS Phase 3 DONE. Document Phase 4 entry (real Gemini + Vertex adapters).
6. Est. 3-4h. Expected regression: ~370-380 tests passing.

**Carry-over from Session #16 pre-Step-9 checklist:**
- Seed profiles: already on disk (`data/profiles/*.json` × 3); `npm run seed:profiles` is idempotent.
- Gitignored runtime: `data/assets/`, `data/profile-assets/`, `data/keys.enc`, `keys/vertex-*.json` — all OK, won't leak.
- Browser-smoke validation deferred to bro — curl wire-proven but full UX (confirm dialog animation, toast CTA ripple, deep-link filter) needs a real DOM. **Updated 2026-04-23**: happy path + deep-link CTA verified in Chrome (see hotfixes section below); cancel mid-flight still pending.



## Interim hotfixes between Session #16 → #17 (2026-04-23, Opus 4.7 1M)

### Browser smoke — partial PASS in Chrome
Bro ran the Session #16 smoke list at http://localhost:5173:
- Workflow picker → **artwork-batch** → ai-chatbot profile → mock/mock-fast → 1:1 → Memory group → 4 concepts × 1 variant → **Run** → EventLog streamed `started → 4×(concept_generated + image_generated) → complete` → toast `"Batch complete — 4 asset(s) saved"` + CTA `"View in Gallery →"` → click CTA deep-linked Gallery with `batchId=batch_zhnZ7syfe3` pre-filled + filtered grid showing 4 items. ✅
- **Cancel mid-flight** — deferred: Mock at 20ms/image makes even 10×8=80 batches finish before a human click lands on the Cancel button. Needs either a slower-mock knob (env override `MOCK_DELAY_MS`) or the Step 9 `tests/integration/workflows-cancel.test.ts` harness exercising the dispatcher grace-window fix at HTTP layer.

### 2 client hotfixes (no regression re-run; server + tests untouched)
1. **`src/client/utils/use-workflow-run.ts`** — added `runStateRef` mirror of `runState`; `cancel()` early-returns when `runStateRef.current !== "running"`. Eliminates the benign `409 BATCH_NOT_RUNNING` Chrome DevTools was logging when a user's Cancel click arrived after the SSE `complete` event (race is unavoidable with 20ms Mock; server-side 409 is correct per Session #12 Q2, so the fix is client-side guard). Net +8 LOC (import `useRef`, ref + `useEffect` sync, guard line).
2. **`src/client/components/EventLog.tsx`** — wrapped `EventRow` with `React.memo`. Previously every new event appended to the list re-rendered all prior rows (80-image batches visibly stalled the UI under SSE flood). With memo + stable keys, only the new row renders. Net +1 LOC (import `memo`, wrap component).

### QA gate (interim)
```
lint: clean
typecheck:client: 0 errors
check-loc: 153 src files (unchanged), 0 violations
regression: NOT re-run (client-only changes, no server/test files touched) — Session #17 Step 1 to verify `npm run regression:full` = 345/345 on the updated tree.
```

### Carry-over items touched
- Known pending #1 (full click-through browser smoke) — happy path + deep-link CTA closed; cancel flow still open.
- No other Session #16 pending items affected.



## Completed in Session #15 (Phase 3 Step 7 — ad-production + style-transform + aso-screenshots)

### Scope decisions locked Session #15 (8 from bro's opening + 2 pre-code alignment resolutions)

- **Q1 — ad-production concept = (layoutId × copyKey) pair, feature-scoped:** `AdConcept` extends `Concept` with `{layoutId, copyKey, featureFocus}`. Selection: cartesian product of layouts-for-feature × copy-template langs, mulberry32 shuffle, pick top `conceptCount`. Input schema has `featureFocus: FeatureFocusSchema` (7-value enum from `@/core/templates`) + `conceptCount` (1-10) + `variantsPerConcept` (1-4) + optional `seed`.
- **Q2 — style-transform source via profile-asset ref, Mock SKIPS read:** `sourceImageAssetId: z.string().min(1)` must resolve to a `profile_asset` row with `kind="screenshot"` on THE SAME profile — checked inside `run()` BEFORE first yield so 400 BadRequestError bubbles via dispatcher "pump first event" pattern (Session #12). 3 guard-clauses: `SOURCE_ASSET_NOT_FOUND` / `SOURCE_ASSET_PROFILE_MISMATCH` / `SOURCE_ASSET_WRONG_KIND`. Mock provider ignores source bytes — integration tests verify WIRING (asset resolution + error paths), not pixel transformation.
- **Q3 — aso-screenshots targetLangs via CopyLangSchema, runtime-checked:** `targetLangs: z.array(CopyLangSchema).min(1).max(3)` — **resolution C**, using the 10-lang CopyLang enum as single source of truth (NOT a hardcoded list; see Pre-code Alignment below). Max 3 is cost control (targetLangs × conceptCount × variants grows exponentially). `run()` second-layer validator checks `targetLangs ⊆ model.capability.supportedLanguages` BEFORE any DB write — `th` slips through schema but trips the runtime check on Mock/Imagen (409 RuntimeValidationError, code `LANGUAGE_UNSUPPORTED`).
- **Q4 — Factory pattern: Session #11 verbatim.** Each workflow exports `createXxxRun(resolveDeps, options): (params) => AsyncGenerator<WorkflowEvent>`. Deps bundle: `{assetRepo, batchRepo, provider}` (+ `profileAssetsRepo` for style-transform). Production wiring lazy-resolves from `@/server/asset-store/context` + `@/server/providers/registry`; tests inject stub deps via `createXxxRun(() => ({...}))`. No deviation from artwork-batch's template.
- **Q5 — Replay-class via central helper, NOT hardcoded:** new `src/core/shared/replay-class.ts` exports `computeReplayClass(capability, asset)`. Returns `"deterministic"` ONLY when `capability.supportsDeterministicSeed === true` AND `asset.seed !== undefined` AND `asset.providerSpecificParams?.addWatermark === false` (explicit-false, NOT undefined; see Pre-code Alignment A). All 4 workflow asset-writers now call the helper. Phase 4 providers automatically classify correctly once their capability matures.
- **Q6 — Event types: 6 stay, NO new types.** `WorkflowEvent` union unchanged. Workflow-specific concept shapes (`AdConcept`, `StyleConcept`, `AsoConcept`) EXTEND `Concept` with extra fields. Event payload carries the extended shape via structural typing; client narrows via `asset.workflowId` in Phase 5+ UI. Rejected `style_applied` / `layout_generated` — would balloon the exhaustive switch + conflate state-transitions with content categories.
- **Q7 — Per-workflow seed-derivation salts (via `deriveSeed` in `@/core/shared/rand.ts`):**
  - `artwork-batch`: `concept.title`
  - `ad-production`: `` `${layoutId}:${copyKey}` ``
  - `style-transform`: `` `${styleDnaKey}:${sourceAssetId}:${serial}` `` (serial added so per-concept seeds are distinct within a batch — Q7 base salt augmented for uniqueness)
  - `aso-screenshots`: `` `${layoutId}:${targetLang}` `` (concept-level seed = `deriveSeed(batchSeed, layoutId)`; per-asset seed derived in runner)
- **Q8 — Explicit Mock `compatibilityOverrides` on all 3 new workflows.** Each `src/workflows/<wf>/overrides.ts` declares `{providerId:"mock", modelId:"mock-fast", forceStatus:"compatible", reason:"Mock provider accepts all workflow requirements for Phase 3 E2E testing"}`. Pinned even when declarative check already passes — defense against declarative-logic OR Mock-capability-flag regressions.

### Pre-code alignment resolutions (bro-approved before first edit)

- **Resolution C (Q3 lang enum):** Q3 decision listed `["en","vi","ja","ko","pt","es","de","fr","it","zh"]` but `data/templates/copy-templates.json` ships `[de,en,es,fr,it,ja,ko,pt,th,vi]` (has `th`, no `zh`). Picked **C — reuse `CopyLangSchema` from `src/core/templates/types`** over hardcoding either list. Single source of truth; schema v2 propagation free; runtime validator catches provider-unsupported langs (e.g. `th` → 409 on Mock/Imagen). Unit tests pin behavior: `th` parses OK, `zh` rejected, runtime check catches `th` downstream.
- **Resolution A (Q5 watermark semantics):** helper requires `addWatermark === false` explicitly — undefined → `best_effort`. This regressed artwork-batch's previous capability-only classifier, so `artwork-batch/asset-writer.ts` now passes `providerSpecificParams: { addWatermark: false }` explicitly (same as the 3 new workflows). Rationale: watermarking alters pixels in a way the provider can't reproduce later; treating absence as "false" would let future callers who forget the flag slip into a deterministic classification they don't have.

### New shared helpers (2 changes, 38 LOC)

- `src/core/shared/rand.ts` — **added `deriveSeed(batchSeed, salt): number`** (promoted from `src/workflows/artwork-batch/concept-generator.ts`). djb2-style hash × XOR with batchSeed, `>>> 0` normalize. Artwork-batch's `concept-generator.ts` re-exports from rand for back-compat.
- `src/core/shared/replay-class.ts` (NEW 42) — `computeReplayClass(capability, asset)` helper (Q5). 3-condition AND-gate for `"deterministic"`, else `"best_effort"`. Also re-exports via `src/core/shared/index.ts`.

### New workflow modules (3 folders × 7 files = 21 files, ~1650 LOC, all under 300 LOC hard cap)

Each folder mirrors artwork-batch's structure for parity + review ergonomics:

- **`src/workflows/ad-production/`** (~500 LOC total)
  - `types.ts` — `AdConcept` = `Concept & {layoutId, copyKey, featureFocus}`.
  - `input-schema.ts` — `AdProductionInputSchema` (strict, no aspectRatio/language).
  - `concept-generator.ts` — `cartesianPairs()` + `pickPairs()` (seeded shuffle) + `generateAdConcepts()`; throws when `featureFocus` has no layouts.
  - `prompt-composer.ts` — `buildAdPrompt()`; rotates `h/s` from `CopyEntry.h[variantIndex % 3]` so variants within a concept surface different headlines at the SAME seed.
  - `overrides.ts` — Mock compatibility override (Q8).
  - `asset-writer.ts` — `writeAdAsset()`; tags `[featureFocus, layoutId, copyKey]`, replayPayload embeds the triple.
  - `run.ts` — `createAdProductionRun()`; standard async-gen flow + batch-row lifecycle.
  - `index.ts` — factory wiring + `adProductionWorkflow` WorkflowDefinition.
- **`src/workflows/style-transform/`** (~500 LOC total)
  - `types.ts` — `StyleConcept` = `Concept & {styleDnaKey, sourceAssetId, serial}`.
  - `input-schema.ts` — `{sourceImageAssetId, styleDnaKey ∈ [ANIME|GHIBLI|PIXAR], conceptCount, variantsPerConcept, seed?}`.
  - `concept-generator.ts` — `generateStyleConcepts()`; serial-indexed seed derivation (1..N).
  - `prompt-composer.ts` — `buildStylePrompt()`; pulls `promptCues` + `renderStyle` from `StyleDnaFile`; variant-angle line only for `variantIndex > 0`.
  - `overrides.ts` — Mock override (Imagen correctly excluded by declarative check — no imageEditing).
  - `asset-writer.ts` — `writeStyleAsset()`; tags `[styleDnaKey, sourceAssetId]`.
  - `run.ts` — Q2 precondition (3 guard-clauses) BEFORE first yield; else standard flow.
  - `index.ts` — `styleTransformWorkflow` WorkflowDefinition (uses `getProfileAssetsRepo` in deps).
- **`src/workflows/aso-screenshots/`** (~550 LOC total)
  - `types.ts` — `AsoConcept` = `Concept & {layoutId}`.
  - `input-schema.ts` — `{conceptCount, variantsPerConcept, targetLangs: CopyLang[1..3], seed?}` (resolution C).
  - `concept-generator.ts` — `phoneUiLayoutIds()` (filter `hasPhoneUI=true`) + `pickAsoLayouts()` + `generateAsoConcepts()`.
  - `prompt-composer.ts` — `buildAsoPrompt()`; pulls localized h/s from `CopyTemplatesFile.templates[targetLang]`.
  - `overrides.ts` — Mock override.
  - `asset-writer.ts` — `writeAsoAsset()`; `variantGroup` encodes `${layoutId}:${targetLang}` tuple.
  - `run.ts` — 3-level loop `concepts × targetLangs × variants`; total = product; Q3 runtime validator check first.
  - `index.ts` — `asoScreenshotsWorkflow` WorkflowDefinition.

### Supporting edits

- `src/workflows/artwork-batch/concept-generator.ts` — drops local `deriveSeed`, imports from `@/core/shared/rand`, re-exports for back-compat.
- `src/workflows/artwork-batch/asset-writer.ts` — drops local `resolveReplayClass`, calls `computeReplayClass(capability, { seed, providerSpecificParams: { addWatermark: false }})`. Behavior unchanged for Mock (still `"deterministic"`); test `artwork-batch replayClass=deterministic` assertion still passes.
- `src/workflows/index.ts` — imports + exports + `ALL_WORKFLOWS` now lists all 4 (registration order = artwork-batch, ad-production, style-transform, aso-screenshots).
- `src/server/asset-store/index.ts` — `+export * from "./profile-assets-repo"` so `ProfileAssetsRepo` type is importable from the barrel (fixed a typecheck error during Step 7 wire-up).
- `tests/integration/workflows-routes.test.ts` — `GET /api/workflows` assertion updated from `toHaveLength(1)` to `toHaveLength(4)` + colorVariant map (artwork-batch=violet, ad-production=blue, style-transform=pink, aso-screenshots=emerald per PLAN §9.1).

### Tests added (4 files, 45 cases)

- `tests/unit/replay-class.test.ts` (6 cases) — all 6 classification branches (deterministic happy path + 5 negative paths: no-capability / no-seed / undefined-watermark / true-watermark / no-providerSpecificParams).
- `tests/unit/workflow-ad-production.test.ts` (15 cases) — cartesianPairs filter correctness + empty case, pickPairs determinism/diverging-seeds/clamping, generateAdConcepts happy + no-layouts throw, buildAdPrompt variant-rotation + phone-UI gate, input-schema banned-key guards × 3, runner happy + same-seed reproducibility + pre-aborted.
- `tests/unit/workflow-style-transform.test.ts` (11 cases) — generateStyleConcepts distinct-seeds + reproducibility, prompt composition + variant-angle gate, schema banned-keys, Q2 precondition × 3 (not-found / wrong-profile / wrong-kind), happy path with Mock skip-source behavior.
- `tests/unit/workflow-aso-screenshots.test.ts` (13 cases) — phoneUiLayoutIds filter, pickAsoLayouts determinism + empty-throw, generateAsoConcepts, prompt lang-specific headline, schema banned-keys + targetLangs bounds (empty/>3/non-CopyLang/th-accepted), Q3 runtime validator (th on Mock → throws), lang-matrix happy path, per-lang seed distinctness.

### QA gate (Session #15 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 130 src files (+32 since Session #14), 0 violations
         all new files under 300 hard cap — largest: aso-screenshots/run.ts ~195 LOC
test: 342/342 pass (33 files; full `regression:full` suite)
  breakdown: unit 228 + integration 101 + extraction 13
  prior:   297 (Session #14 baseline, full suite)
  new:     +45 net (6 replay-class + 15 ad-production + 11 style-transform + 13 aso-screenshots)
  regression: clean; no pre-existing tests broken
```

PLAN §7.4 compat matrix (end-to-end via `resolveCompatibility(ALL_WORKFLOWS, ALL_MODELS)`):

```
artwork-batch    × gemini/vertex/mock  → compatible (declarative)
ad-production    × gemini/vertex       → compatible (declarative); mock → compatible (override)
style-transform  × gemini              → compatible (declarative)
                 × vertex              → INCOMPATIBLE — missing supportsImageEditing ✅ correct
                 × mock                → compatible (override)
aso-screenshots  × gemini/vertex       → compatible (declarative); mock → compatible (override)
```

### Deviations / design notes

- **Q7 salt augmented for style-transform.** Literal Q7 salt `${styleDnaKey}:${sourceAssetId}` is constant across a batch's concepts, which would collapse all concept seeds to a single value. Added `:${serial}` (1..conceptCount) so per-concept seeds stay distinct while preserving Q7's deterministic-reproducibility intent for a fixed (batchSeed, pair, serial) triple.
- **Style-transform concepts are numbered "interpretations"** of a fixed (source, style) pair — no template data for alternative angles/takes/compositions exists in style-dna.json (3 styles × 5 fields each, no per-concept variation axis). Title format `${styleLabel} · #${serial}`. Phase 4 Gemini NB2 + Phase 5 prompt-cues extraction may provide richer axes.
- **ASO "layout source" = ad-layouts.json filtered by `hasPhoneUI=true`.** Current extracted data: 2-3 phone-UI layouts out of 29 (heavy on ad-variants). If ASO coverage needs broader ground, Phase 4 extract expansion OR a dedicated `screen-layouts.json` template. Concept-gen throws explicit error `no phone-UI layouts available` so the gap is loud, not silent.
- **`ImageProvider.generate` extension for style-transform source file NOT added.** Mock skips source read per Q2; real Phase 4 Gemini NB2 will need `sourceImageBytes?: Uint8Array` on `GenerateParams`. Tracked as Phase 4 known-pending, not Phase 3 blocker.
- **`WorkflowEvent.concept_generated` payload typed as base `Concept`** — AdConcept/StyleConcept/AsoConcept's extra fields ride via structural subtyping. Clients that want workflow-specific narrowing check `asset.workflowId` in Phase 5 UI (PLAN §9.1 locks workflowId ↔ concept-shape pairing).
- **`inputSchema` STILL not serialized** in GET /api/workflows — Session #12 deferral unchanged. Step 8 client form-builder picks its strategy (Zod introspection / hand-crafted sidecar / `zod-to-json-schema` dep).

### Known pending items (for Session #16 — Step 8)

1. **Client Workflow page** — form-builder for 4 workflows' input schemas (Zod → dynamic React form). Bro to pick strategy: sidecar descriptor per workflow vs runtime Zod inspection vs JSON-schema converter dep.
2. **SSE client integration** — EventSource subscribe + per-event-type handler (started/concept_generated/image_generated/error/aborted/complete) + cancel-button → `DELETE /api/workflows/runs/:batchId` wire.
3. **Gallery** — list assets via `GET /api/assets?profileId=...&workflowId=...`; thumbnail via `GET /api/assets/:id/file`; filter chips per workflow color.
4. **style-transform source picker** — upload screenshot first (Step 6 multipart already live) → select from profile's `screenshotAssetIds[]` in style-transform form. UI contract needs finalizing.
5. **Compatibility hints** — "Mock compatible / Imagen incompatible (no image editing)" on workflow × model pickers using `GET /api/providers/compatibility`.

## Completed in Session #14 (Phase 3 Step 6 — keys + assets + profile-assets routes)

### Scope decisions locked Session #14 (bro approved 8 questions + 2 bonus items)

- **Q1 — Multipart 10MB central helper:** single `src/server/middleware/multipart.ts` exports `parseMultipartUpload(c, opts?)` returning `{ok:true,data} | {ok:false,response}`. All upload routes call it, emit identical 400/413/415 flat-shape errors. MAX_UPLOAD_BYTES = 10MB constant.
- **Q2 — MIME allowlist:** explicit `["image/png", "image/jpeg", "image/webp"]`. Reject wildcard `image/*` (SVG = XSS risk via embedded scripts, GIF/BMP/TIFF = format/size problems). 415 shape: `{error:"UNSUPPORTED_MEDIA_TYPE", allowed:[], received}`. Vertex JSON upload overrides allowlist to `["application/json"]` — same helper, different opts.
- **Q3 — Upload `kind` via form field (not query/part name):** multipart body has `name="kind"` value `"logo"|"badge"|"screenshot"`, `name="expectedVersion"` value number, `name="file"` binary. Zod enum at route layer. Mapping: logo → `appLogoAssetId`, badge → `storeBadgeAssetId`, screenshot → `push(screenshotAssetIds)`.
- **Q4 — Upload mutation REQUIRES expectedVersion:** same optimistic-concurrency guard as PUT /profiles/:id. Order: parse multipart → Zod fields → tryLoadProfile → version check → file write → DB insert → profile save. Version check BEFORE file I/O so 409 leaves NO orphan. 409 body shape matches PUT: `{error:"VERSION_CONFLICT", message, currentVersion, expectedVersion}`.
- **Q5 — `POST /assets/:id/replay` NOT registered** (Phase 5 scope). Unregistered route = Hono default 404 (honest semantics). Rejected 501-stub because stubs lie to RPC types + non-standard `Link:#phase-5` headers. assets.ts Step 6 registers 4 endpoints only: `GET /`, `GET /:id`, `GET /:id/file`, `DELETE /:id`.
- **Q6 — `?include=` CSV from day 1:** `?include=replayPayload` today; `?include=replayPayload,tags` future-proof. Parser = `split(",").map(trim).filter(Boolean) → validate each via Zod enum`. Adding new options = extend enum, no API break.
- **Q7 — DELETE active slot → activeSlotId = null:** set null + 200 with `{deleted, deactivated, warning}` so UI prompts explicit reactivation. Rejected auto-activate-next (unpredictable order, silent state change, security surprise). **REVERSED Session #3 behavior** — slot-manager.ts patched lines 87-94. Non-active delete → 204 empty.
- **Q8 — POST /:id/test with optional `modelId` body:** default = `modelsByProvider(providerId)[0].id`. If explicit modelId provided, validate belongs to slot's provider (400 if not). Response includes full HealthStatus fields + slotId + modelId. Phase 3 Mock returns "ok"; gemini/vertex slots graceful-degrade to `status:"unknown"` with Phase 4 flag-comment (no route change when real providers arrive).
- **Bonus A — `ImageProvider.health(modelId, context?)` extended:** added `HealthCheckContext` + `VertexServiceAccount` types in `@/core/providers/types`. Optional 2nd arg carries `{apiKey, serviceAccount, skipCache}` so key-test bypasses active-slot registry. Mock accepts + ignores. Phase 4 gemini/vertex impls use it. Backward-compatible — existing callers (workflow.run → provider.generate chain) unchanged.
- **Bonus B — Test env isolation:** 3 env vars (`IMAGES_GEN_ART_KEYS_PATH`, `_VERTEX_DIR`, `_PROFILE_ASSETS_DIR`) gated by `process.env.X ?? defaultPath()` in store.ts + keys.ts + profile-assets.ts. Tests use `mkdtempSync(tmpdir())` scope so `data/keys.enc` / `/keys/` / `data/profile-assets/` never leak into real dirs. Pattern reusable for future dir-rooted state.

### New infrastructure (2 files, 238 LOC)

- `src/server/middleware/multipart.ts` (125) — `parseMultipartUpload(c, opts?)` via Web standard `FormData` (not Hono `parseBody`). Validates MIME + size, extracts fields record, returns `Uint8Array` + metadata. 3 flat-shape errors: 400 BAD_MULTIPART / 413 PAYLOAD_TOO_LARGE / 415 UNSUPPORTED_MEDIA_TYPE. `MAX_UPLOAD_BYTES` + `ALLOWED_UPLOAD_MIME` exported for test + per-route override.
- `src/server/asset-store/profile-assets-repo.ts` (113) — `createProfileAssetsRepo(db)` factory. Methods: `insert/findById/listByProfile/delete`. Kind guard rejects invalid enum at insert time + drift check at row→internal map. Wired into `context.ts` singleton alongside asset/batch repos.

### New route modules (5 files, 619 LOC)

- `src/server/routes/keys.ts` (262) — 5 endpoints. `GET /` returns `{gemini:{activeSlotId,slots:KeySlotDto[]}, vertex:{...VertexSlotDto[]}}` (DTO strips keyEncrypted + serviceAccountPath). `POST /` dispatches by Content-Type: JSON → gemini key via GeminiCreateBodySchema, multipart → vertex SA file (writes to `keys/vertex-{slotId}.json`). `POST /:id/activate` flips activeSlotId. `DELETE /:id` Q7 tri-state (204 non-active / 200 active-with-warning / 404 unknown) + unlinks Vertex SA file. `POST /:id/test` Q8 wire (Mock → "ok", unregistered providers → "unknown"). 3-arg `findSlotAnywhere(store, slotId)` walks both trees since slot records don't carry providerId.
- `src/server/routes/keys.body.ts` (31) — `GeminiCreateBodySchema` (`z.literal("gemini")` + label + key), `VertexFieldsSchema` (validates multipart fields record), `KeyTestBodySchema` (optional modelId, `passthrough()` for forward-compat).
- `src/server/routes/assets.ts` (131) — 4 endpoints. `GET /` with `?profileId=&workflowId=&limit=&offset=` (z.coerce + defaults). `GET /:id?include=replayPayload` attaches `replayPayload:null` placeholder (Phase 5 gets real build). `GET /:id/file` streams bytes with mime derived from ext (png fallback). `DELETE /:id` unlinks file + repo row.
- `src/server/routes/assets.body.ts` (24) — `AssetListQuerySchema` + `AssetIncludeOptionSchema` + `parseIncludeParam(raw)` CSV parser.
- `src/server/routes/profile-assets.ts` (171) — TWO subapps exported: `createProfileAssetsRoute()` mounted at `/api/profile-assets` (GET /:id/file, DELETE /:id) + `createProfileUploadAssetRoute()` mounted at `/api/profiles` (POST /:id/upload-asset multipart). Upload step order: parse → validate kind+expectedVersion → load profile → version check → file write → DB insert → mutate profile + save. `applyKindToProfile` per-kind mutation. Dual-mount at `/api/profiles` in app.ts (upload subapp BEFORE main profiles subapp for registration specificity).

### Supporting edits (7 files)

- `src/core/providers/types.ts` — `+HealthCheckContext` + `+VertexServiceAccount` interfaces; `ImageProvider.health(modelId, context?)` signature extended. Index sig on VertexServiceAccount round-trips GCP JSON extras.
- `src/server/providers/mock.ts` — `health(modelId, context?)` accepts + ignores context; returns fixed `status:"ok", message:"Mock provider — always healthy"`.
- `src/server/keys/slot-manager.ts` — **Q7 patch:** `removeSlot` lines 87-94: `activeSlotId === slotId ? null : activeSlotId` (reversed Session #3 `slots[0]?.id ?? null` fallback). Comment flags the policy reversal.
- `src/server/keys/store.ts` — `getDefaultKeysPath()` lazy + env-override via `IMAGES_GEN_ART_KEYS_PATH`. `loadStoredKeys`/`saveStoredKeys` dropped default-param, use getter instead (production default unchanged).
- `src/server/asset-store/asset-repo.ts` — `+deleteById(id)` (counter to `countByProfile` added Step 5). Both use `.run().changes > 0` boolean semantics.
- `src/server/asset-store/context.ts` — wire `_profileAssetsRepo` singleton; `getProfileAssetsRepo()` getter + reset cleanup.
- `src/server/app.ts` — mount order: upload subapp `/api/profiles` FIRST (for `POST /:id/upload-asset` specificity), main profiles subapp second, profile-assets at `/api/profile-assets`, keys, assets in sequence. STUB_DOMAINS trimmed to empty.

### Tests added (5 files, 800 LOC, 56 cases)

- `tests/unit/slot-manager.test.ts` (91, 7 cases) — pinned Q7 semantics BEFORE slot-manager patch. Cases: add auto-activate + idempotence, removeSlot non-active / active-sets-null / only-slot-null / unknown-no-op / vertex-parity.
- `tests/unit/profile-assets-repo.test.ts` (131, 8 cases) — round-trip insert/find/list/delete; kind guard rejects; caller-supplied uploadedAt honored.
- `tests/integration/keys-routes.test.ts` (288, 16 cases) — GET stripped DTOs × 2; POST gemini JSON × 3; activate × 2; DELETE Q7 × 3; test-endpoint × 3; Vertex multipart × 3 (write + 415 reject + active-delete file unlink).
- `tests/integration/assets-routes.test.ts` (216, 14 cases) — list + filter + 400; detail + ?include + 400-unknown-include; file stream + 404 orphan; delete + 404; replay-not-registered → 404 (Q5 proof).
- `tests/integration/profile-assets-routes.test.ts` (294, 11 cases) — upload logo/screenshot happy × 2; guards × 4 (version / missing profile / 415 / bad kind); GET file × 2; DELETE × 2; round-trip binary equality.

### QA gate result (Session #14 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 105 src files, 0 violations
         largest: keys.ts 262 LOC (under 300 hard cap, over 250 soft — acceptable)
test: 297/297 pass (29 files) — 2.55s
  prior:   247 (Session #13 baseline)
  removed:  -6 (3 profile-assets/assets/keys stub domains × 2 tests each)
  new:     +56 (7 slot-manager + 8 profile-assets-repo + 16 keys-routes
               + 14 assets-routes + 11 profile-assets-routes)
  net:     +50
```

### Deviations from plan

- **Vertex slot add — placeholder path workaround.** slot-manager.addVertexSlot assigns slotId internally, but the SA file path `keys/vertex-{slotId}.json` needs the ID up-front. Current impl creates slot with `vertexFilePath("pending")`, then rewrites `serviceAccountPath` in the returned store via spread before save. Ugly but functional. Cleanup: refactor slot-manager to accept caller-supplied id OR split id generation from slot creation. Deferred (not blocking Step 7).
- **`describe.skipIf` guards empty STUB_DOMAINS loop** — `tests/integration/app.test.ts` iterates STUB_DOMAINS in a for-loop inside a describe block; when array is empty vitest errors "No test found in suite". Guard = `describe.skipIf(STUB_DOMAINS.length === 0)(...)`. Future phases adding stubs reactivate the suite automatically.
- **Orphan file risk between multipart file-write + DB insert** — if process crashes between writeFileSync + getProfileAssetsRepo().insert, file stays, no row. Phase 5 `scripts/sweep-orphan-profile-assets.ts` reconciles.
- **Atomic profile JSON save** — saveProfile uses `writeFileSync` (no tmp+rename). Pre-existing Session #6 choice; not widened here. store.ts (keys) uses atomic tmp+rename. Inconsistent; revisit when profile CRUD hits concurrent-write scenarios.
- **Keys test endpoint Phase 3 degrade** — unregistered providers (gemini/vertex today) return `status:"unknown"`. Integration test asserts this; when Phase 4 registers real providers, status flips to "ok"/actual. Test flexible enough to survive either.

### Known pending items (for Session #15)

1. **`toAssetDetailDto` full shape** — `GET /assets/:id?include=replayPayload` returns `replayPayload: null` placeholder. Phase 5 lands the real build: parse stored replayPayload JSON + pair with FROZEN ProfileDto snapshot (needs `freezeProfileForReplay` at asset-write time — which currently doesn't embed profileSnapshot). Tracked in `src/server/asset-store/dto-mapper.ts:4` comment.
2. **AppProfileSchema.version still z.literal(1)** — PUT /profiles + upload-asset both run expectedVersion check but save() can't bump (literal blocks). Schema v2 migration widens to number + sets initial bump point. Until then, expectedVersion is always 1 → always passes. Defensive nonetheless (rejects fabricated higher values).
3. **Profile-asset DELETE leaves dangling reference** — removing a profile-asset via `DELETE /api/profile-assets/:id` does NOT back-update profile.assets.appLogoAssetId etc. GET /profile-assets/:id/file → 404; profile still points to dead id. Phase 5 UI cleanup job OR add automatic profile mutation on DELETE (needs expectedVersion too).
4. **Size-cap 413 not integration-tested** — unit-testable against the helper with small `maxBytes` override; skipped here because vitest >10MB Blob generation is slow + noisy. Single helper test can be added if contract tightens.
5. **`inputSchema` in GET /workflows STILL omitted** — Session #12 deferral carried forward. Step 7 adds 3 workflows' input schemas but GET response shape unchanged. Step 8 client form-builder decides serialization strategy.

## Next Session (#16) kickoff — Phase 3 Step 8

1. Read this file + `memory/MEMORY.md` to recover state. Verify baseline `npm run regression:full` = 342/342.
2. Read `BOOTSTRAP-PHASE3.md` Step 8 section (client Workflow page + Gallery + SSE wire).
3. Scope decisions for bro before coding:
   - **Form-builder strategy** — 4 workflows' input schemas are Zod objects. Pick ONE: (a) hand-crafted sidecar descriptor per workflow (highest control, duplicated); (b) runtime Zod `._def` inspection (no dep, fragile across Zod versions); (c) add `zod-to-json-schema` npm dep + generic renderer. Rec (c).
   - **SSE client transport** — native `EventSource` (simpler, auto-reconnect but we don't want it) vs `fetch` + ReadableStream (manual framing). Rec `fetch` — lets us hard-disable reconnect and abort cleanly via `AbortController` mirrored to the server-side DELETE `/runs/:batchId`.
   - **style-transform source picker UI** — dropdown from profile's `screenshotAssetIds[]` OR "click to upload new" inline affordance? Rec dropdown MVP + "manage assets" deep-link to a profile-asset manager page (Phase 5 scope).
   - **ASO targetLangs multi-select** — checkbox group (3 max, enforce client-side) OR chip-picker w/ `th` greyed out and tooltip "not supported by this model"? Rec chip-picker; read `provider.supportedLanguages` from `GET /api/providers/compatibility` to grey out.
   - **Gallery filter/sort** — default sort `createdAt DESC`; filter chips per workflow (color-coded per PLAN §9.1: violet/blue/pink/emerald); tag filter from asset.tags?
   - **Cancel UX** — in-flight batch progress shows "Cancel" button → DELETE /runs. Post-cancel SSE stream ends with `aborted` event; client dismisses spinner. Confirm pattern.
4. Implement Step 8. Est 4-5h (4 forms + SSE client + gallery + cancel wire).
5. After Step 8 ships, Step 9 is DTO audit + full integration tests across all 4 workflows.

**Pre-Step-8 quick sanity checks:**
- Run `node -e "fetch('http://localhost:3000/api/workflows').then(r=>r.json()).then(j=>console.log(j.workflows.map(w=>w.id)))"` → should print all 4 ids.
- Verify `GET /api/providers/compatibility` shows `style-transform × vertex:imagen-4.0-generate-001 → incompatible` (key integration proof).
- Run one mock batch E2E: `curl -N -X POST http://localhost:3000/api/workflows/ad-production/run -d '{"profileId":"...","providerId":"mock","modelId":"mock-fast","aspectRatio":"1:1","input":{"featureFocus":"restore","conceptCount":2,"variantsPerConcept":1,"seed":42}}'` — should stream started → 2×(concept_generated + image_generated) → complete SSE frames.

## Completed in Session #13 (Phase 3 Step 5 — profiles + templates + providers routes)

### Scope decisions locked Session #13 (bro approved 5 questions + 1 bonus)

- **Q1 — Version conflict 409 flat shape:** `{error:"VERSION_CONFLICT", message, currentVersion, expectedVersion}` (NOT nested under `details`). Matches Step 4 DELETE /runs precedent `{error, currentStatus}`. Field name `error` (not `code`) per PLAN §6.4 convention. Naming `expectedVersion` (not `attemptedVersion`) round-trips with request body field.
- **Q2 — DELETE profile hard-unlink + asset-count guard:** 409 `PROFILE_HAS_ASSETS` when `assetRepo.countByProfile(id) > 0`. Response includes `assetCount` so UI can prompt "this profile has 42 assets — delete them first". No soft-delete / recoverable trash. Added `countByProfile(profileId: string): number` to asset-repo.
- **Q3 — upload-asset NOT registered in Step 5:** Hono default 404 for unregistered routes (honest semantics). Rejected 501-stub because it lies to type system + non-standard header. Step 6 ships the real upload under profile-assets module.
- **Q4 — /providers/health 4 modes:** (none)→full matrix, `?provider=X`→single-provider subtree, `?provider=X&model=Y`→flat HealthStatus, `?model=Y` alone→400 `MODEL_REQUIRES_PROVIDER` (model IDs not globally unique across providers). Bonus 404s: `PROVIDER_NOT_FOUND` (no matches), `MODEL_NOT_FOUND` (provider exists, model doesn't).
- **Q5 — Templates read-only via Hono default 405/404:** only GET registered per template path. Non-GET methods fall through to Hono's default (empirically 404 for unmatched method). Paranoid test asserts 4xx + non-5xx so status flexibility survives any Hono internal change.
- **Bonus — typed `Hono<{Variables:{validatedBody:XxxBody}}>` reused** on profiles POST/PUT. First time body schemas reuse `AppProfileSchema.omit().extend().partial()` to keep storage schema as single source of truth.

### New route modules (4 files, 359 LOC)

- `src/server/routes/profiles.ts` (186) — 7 endpoints: `GET /` list → ProfileSummaryDto[]; `GET /:id` → ProfileDto; `POST /import` static path BEFORE `:id` routes; `GET /:id` + `GET /:id/export` (Content-Disposition attachment); `POST /` create with slugified id fallback via `shortId("profile", 8)`; `PUT /:id` version-guard + 409 flat; `DELETE /:id` asset-count guard + 409/404. `buildCreated` + `mergeUpdate` spread-only helpers keep version immutable. NOT registered: `POST /:id/upload-asset` (Step 6 owns it).
- `src/server/routes/profiles.body.ts` (35) — `ProfileCreateBodySchema` (= AppProfileSchema.omit({version,id,createdAt,updatedAt}) + optional id), `ProfileUpdateBodySchema` (= partial() + expectedVersion), `ProfileImportBodySchema` (= AppProfileSchema full).
- `src/server/routes/templates.ts` (38) — 6 GETs: `/artwork-groups`, `/ad-layouts`, `/country-profiles`, `/style-dna`, `/i18n`, `/copy` (URL-tidy vs file `copy-templates.json`). Only GET registered; Hono handles method-mismatch.
- `src/server/routes/providers.ts` (107, was 27) — extended with `/compatibility` (real `resolveCompatibility(ALL_WORKFLOWS, ALL_MODELS)` matrix) + `/health` (Q4 4-modes with Zod-esque query guard). `stubHealth()` per (provider, model) returns `{status:"ok", message:"stub..."}`.

### Supporting edits

- `src/server/profile-repo/enumerator.ts` (NEW 27) — `listProfiles(dir?)` reads dir + Zod-validates each; `deleteProfile(id, dir?)` unlinks + returns bool. Re-exported via index.ts barrel.
- `src/server/asset-store/asset-repo.ts` — `+countByProfile(profileId): number` prepared stmt.
- `src/server/app.ts` — mount `/api/profiles` + `/api/templates` before stubs.
- `src/server/routes/stubs.ts` — STUB_DOMAINS → `[assets, keys, profile-assets]` (3 left from 5).

### Tests added (3 files, 35 cases)

- `tests/integration/profiles-routes.test.ts` (363, 19 cases) — list + 3 seeded assertions; detail happy + 404; POST create/slugify/duplicate/partial × 4; PUT happy + 409 flat + 404 × 3; DELETE happy + 404 + 409 assets × 3; export Content-Disposition × 2; import round-trip + duplicate + malformed × 3. `TEST_PREFIX = "zz-test-{pid}-{ts}-"` for cross-file isolation.
- `tests/integration/templates-routes.test.ts` (72, 9 cases) — parametrized happy path × 6 (asserts schemaVersion:1 + top-level key); POST/DELETE 4xx × 2; unknown template → 404 × 1.
- `tests/integration/providers-routes.test.ts` (97, 7 cases) — compatibility matrix assert; health × 6 (no-filter, provider-only, both, model-alone 400, unknown-provider 404, unknown-model 404).

### QA gate (Session #13 final)

```
test: 247/247 pass (24 files) — 2.37s
  prior:   216; removed: -4 (profiles+templates stub tests); new: +35; net: +31
check-loc: 98 src files, 0 violations
```

### Deviations

- **PUT /profiles version bump blocked by schema v1 literal** — expectedVersion guard runs but save can't bump. Noted in code comment; schema v2 migration resolves. Tests assert 409 with currentVersion:1 + expectedVersion:99 (fabricated) to prove the guard.
- **POST /import creates at stored version** — body carries version literal(1) + preserves createdAt/updatedAt via `{touchUpdatedAt: false}`.

## Completed in Session #12 (Phase 3 Step 4 — workflows + workflow-runs routes)

### Scope decisions locked Session #12 (bro approved 4 questions + 2 bonus items)

- **Q1 — SSE framing:** pure `streamSSE` from `hono/streaming`. NO `Retry-After` (wrong semantic — batches don't have retry logic), NO custom event-id (resume explicitly not supported v1 per PLAN §6.4). Each frame = `{ event: workflowEvent.type, data: JSON.stringify(workflowEvent) }`. YAGNI — revisit Phase 4+ if needed.
- **Q2 — Cancel endpoint tri-state:** `DELETE /api/workflows/runs/:batchId` returns **204** (running batch → abort succeeds, no body), **409** BATCH_NOT_RUNNING + `currentStatus` (finished batch), **404** BATCH_NOT_FOUND (unknown id). Distinguishes "already done" from "never existed" so UI can show the right message; 404-conflation was rejected.
- **Q3 — Input validation split:** MIDDLEWARE `validateBody()` (shape check — required fields, correct types → 400) stays SEPARATE from dispatcher `checkPreconditions` (semantic — workflow exists, key active, compatibility → 400/401/404/409). Two concerns, two layers. Body schema colocated per patterns.md Session #2 convention: `workflows.body.ts` sibling.
- **Q4 — Stub removal:** `workflows` + `workflow-runs` removed from `STUB_DOMAINS`. Remaining 5 stubs: `profiles`, `assets`, `keys`, `templates`, `profile-assets`. Mount paths — TWO separate route files: `/api/workflows` (GET list + POST /:id/run) and `/api/workflows/runs` (DELETE cancel + ALL resume→501).
- **Bonus A — 3-layer abort wire:** `client disconnect → c.req.raw.signal → route's local AbortController → dispatcher → workflow.run's abortSignal → provider.generate abortSignal`. DELETE takes the same path via `abortBatch(batchId)` hitting the same registered controller.
- **Bonus B — Abort smoke relaxed:** pre-aborted signal variant (not mid-flight) is the reliable probe for the wire — Mock provider's 20ms/gen × 4 concepts = 80ms total runtime races any `setTimeout`-based abort. Mid-flight graceful-cleanup of `batch.status` is deferred (workflow authors own their own abort-path `updateStatus` per Session #11 Q1; Step 7 workflows must follow the artwork-batch pattern).

### New route module (3 files, 193 LOC)

- `src/server/routes/workflows.ts` (114) — `GET /` returns `{ workflows: [{id, displayName, description, colorVariant, requirement, compatibilityOverrides}] }`. `POST /:id/run` wires `validateBody(WorkflowRunBodySchema)` → creates local `AbortController` + attaches `c.req.raw.signal` listener + defensive pre-aborted sync check → calls `dispatch()` with `{ controller }` dep → **pumps first event via `generator.next()` BEFORE `streamSSE`** so precondition errors bubble as real HTTP 400/401/404/409 (Hono's `streamSSE` flushes `text/event-stream + 200` headers the moment the handler returns — any error inside the callback is silently logged and closes an empty stream). On happy path, `streamSSE` iterates remaining events, writes each as `{event, data}` frames, removes listener in `try/finally`. Typed `Hono<{Variables:{validatedBody: WorkflowRunBody}}>` so `c.get` resolves the parsed body without runtime cast.
- `src/server/routes/workflows.body.ts` (26) — `WorkflowRunBodySchema` (Zod): 5 required (`profileId`, `providerId`, `modelId`, `aspectRatio` via `AspectRatioSchema`, `input: z.unknown()`) + 1 optional (`language` via `LanguageCodeSchema`). `input: z.unknown()` because per-workflow shape is enforced downstream by precondition #8 (`workflow.inputSchema.parse`) — body layer only checks envelope keys.
- `src/server/routes/workflow-runs.ts` (53) — `DELETE /:batchId`: `isBatchActive()` → `abortBatch()` → 204; else `batchRepo.findById()` → 409 with `currentStatus` OR 404. `ALL /:batchId/resume` → 501 + `Resume: not-supported` header (defensive stub for any client that asks).

### Server-side supporting changes

- `src/server/app.ts` — mount order locked: `/api/workflows/runs` BEFORE `/api/workflows` (though Hono dispatches by full path + method — `DELETE /runs/:batchId` vs `POST /:id/run` are disjoint by method anyway, but reg-order keeps specificity explicit).
- `src/server/routes/stubs.ts` — `workflows` + `workflow-runs` removed from `STUB_DOMAINS`. Comment header updated to reflect "Phase 3 Step 4 shipped" status.

### Tests added (1 new file, 11 cases)

- `tests/integration/workflows-routes.test.ts` (NEW, 284 LOC):
  - **Setup:** `beforeAll(preloadAllTemplates)`, `beforeEach(reset + initAssetStore({ path: ":memory:" }))`, `afterEach(rmSync data/assets/chartlens)` to avoid unbounded PNG accumulation on repeated runs.
  - **Helpers:** `readSSE(res)` drains the full stream; `parseSSEEvents(raw)` splits `\n\n` blocks → `{event, data}[]`.
  - `GET /api/workflows` × 1 — returns artwork-batch with `id`, `colorVariant: "violet"`, non-empty `displayName`.
  - Body validation × 2 — missing `profileId` → 400, malformed JSON → 400.
  - Precondition errors × 3 — unknown workflow id → 404, unknown profileId → 404, banned input key (`aspectRatio` leaked into input) → 400.
  - SSE happy path × 1 — full stream: `started → concept_generated × 2 → image_generated × 2 → complete`; `Content-Type: text/event-stream`; `started.total === 2`; post-run DB assertion `batch.status === "completed"`, `successfulAssets === 2`.
  - Abort smoke × 1 — pre-aborted signal → response status < 600, stream drains, `GET /api/health` still 200 (no hung handler).
  - DELETE tri-state × 3 — unknown batchId → 404 BATCH_NOT_FOUND; pre-seeded finished batch → 409 BATCH_NOT_RUNNING + `currentStatus: "completed"`; `ALL /:batchId/resume` → 501 + `Resume: not-supported` header.

### QA gate result (Session #12 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 94 src files, 0 violations (up 8 from Session #11: 3 route files + 1 body schema + 4 modified don't count)
test: 216/216 pass (21 files) — 2.40s
  prior:   209 (Session #11 baseline)
  removed:  -4 (stub 501 tests for workflows + workflow-runs gone)
  new:    +11 (workflows-routes integration)
extract:all runtime: unchanged
```

### Deviations from plan

- **`GET /api/workflows` omits `inputSchema` serialization.** Plan sketch used `zodToJsonSchema(w.inputSchema)` which requires the `zod-to-json-schema` dep. Deferred — Step 8 client form-builder will decide: add the dep, hand-craft per-workflow JSON descriptors in a sidecar `formSchema.ts`, or read the Zod shape at runtime via `._def` inspection. Current response ships `id`, `displayName`, `description`, `colorVariant`, `requirement`, `compatibilityOverrides` (6 fields — enough for client workflow picker + compatibility warning UI).
- **`Hono<{Variables:{validatedBody: WorkflowRunBody}}>` generic** — first typed sub-app in the codebase. Needed because `new Hono()` defaults `Variables` to empty, making `c.get("validatedBody")` fail typecheck with `parameter of type 'never'`. `validator.ts` middleware's default `MiddlewareHandler<E=any>` is compatible with any concrete `E` so no middleware change needed. Pattern to reuse in Step 5 profiles route (also uses `validateBody`).
- **Pre-event pumping** — `generator.next()` called BEFORE `streamSSE(c, ...)` so `checkPreconditions` errors bubble to `errorHandler` as proper HTTP responses. Alternative (emit SSE error frame inside `streamSSE`) was rejected because it sends `text/event-stream + 200` headers — client gets a 200 with an empty stream instead of a 4xx JSON error. Trade-off: batch row for the failed precondition is created only AFTER the first yield (happens in `workflow.run.ts` line 61, NOT in `checkPreconditions`), so no DB pollution from preflight failures.

### Known pending items (for Session #13)

1. **`inputSchema` shape in GET response** — see deviation above. Step 5 profiles route doesn't need it, but Step 8 client definitely does. Decide then.
2. **Client-disconnect mid-flight cleanup** — if the client aborts while mocks are generating, workflow.run's try/finally in `run.ts` doesn't update `batch.status` on non-signal-aware interruption (e.g., writeSSE throws when reader closes). Current workaround: workflow authors are responsible for graceful cleanup per Session #10 D2. Step 7 workflows (ad-production/style-transform/aso-screenshots) must replicate artwork-batch's pattern; `CONTRIBUTING.md`-style guidance atop each run.ts is the reminder. If pattern becomes tedious, consider wrapping `dispatch()` with a generic "post-stream status stamp" helper in Step 7 scope.
3. **`data/assets/` grows on repeat integration-test runs** — `afterEach` cleans `chartlens` dir, but any test using a different profileId would leak. Keep the `ASSET_CLEANUP_DIR` pattern consistent when Step 6 lands profile-assets tests.
4. **Resume endpoint lives under workflow-runs** — `ALL /:batchId/resume` returns 501 with `Resume: not-supported` header. Plan §6.4 is clear "no resume v1"; endpoint exists only for graceful client rejection. Can remove if Step 8 client never asks.

---

## Completed in Session #11 (Phase 3 Step 3 — artwork-batch workflow)

### Scope decisions locked Session #11 (bro approved 7 questions)

- **Q1 — batch-repo shape:** single `updateStatus(batchId, patch)` method with runtime invariants (`completed` requires `completedAt`; `aborted` requires `abortedAt`; `error` neither required). Caller stamps timestamps — repo stays pure CRUD.
- **Q2 — concept count:** added `conceptCount: z.int().min(1).max(10).default(4)` to artwork-batch input schema. Shuffle via **mulberry32** from `src/core/shared/rand.ts` (NOT SHA-256 — reuses existing helper, pattern consistency with Phase 2 extract scripts).
- **Q3 — Mock asset write path:** `data/assets/{profileId}/{YYYY-MM-DD}/{assetId}.png` (PLAN §4 layout, not flat). Verified `data/assets/` auto-gitignored via `/data/*` pattern. No rollback on insert fail — orphan sweep deferred to Phase 5 tool.
- **Q4 — locale:** `params.language ?? "en"`. Language instruction line appended only when `locale !== "en"`.
- **Q5 — per-concept seed:** `Concept.seed` tightened from optional to REQUIRED. djb2-style `deriveSeed(batchSeed, salt)` produces deterministic unsigned 32-bit seed per concept. Enables Phase 5 replay of individual variants.
- **Q6 — workflowId enum vs string:** schema stays `TEXT`, TS type is `WorkflowId` union. New `asWorkflowId(raw)` guard in `src/core/design/types.ts` validates on read; asset-repo + batch-repo both cast via `rowTo*` helpers. Catches DB drift / stale schema versions per Rule 14 spirit.
- **Q7 — Mock replayClass:** `"deterministic"` (Mock has `supportsDeterministicSeed: true` + per-concept seed from Q5 + no watermark = all 3 PLAN §8.1 conditions met). Unlocks Phase 5 replay-UI smoke without needing real Imagen 4 key.

### New workflow module (`src/workflows/artwork-batch/`, 5 files, ~360 LOC)

- `input-schema.ts` (30) — `ArtworkBatchInputSchema` (Zod). Fields: `group` (8-key enum), `subjectDescription`, `conceptCount` (default 4), `variantsPerConcept` (default 1), `seed?`. `.strict()` enforces no extra keys — precondition #7 belt-and-suspenders at runtime.
- `concept-generator.ts` (56) — `pickConcepts` (mulberry32 seeded sort), `deriveSeed` (djb2 XOR), `generateConcepts` (composes both + stamps `Concept` shape).
- `prompt-builder.ts` (30) — `buildPrompt({ concept, profile, locale })`. Lines: tone → subject → creation prompt → palette → must-include → avoid → (conditional) language hint. Empty do/dont lists omit their lines.
- `asset-writer.ts` (110) — isolated file I/O + DB insert side effects so run.ts stays event-loop focused. Handles date-partitioned path, mkdir recursive, replay payload JSON, replay class derivation.
- `run.ts` (140) — `createArtworkBatchRun(resolveDeps, options)` factory → `(params) => AsyncGenerator<WorkflowEvent>`. Loads `getArtworkGroups()` at run time, creates batch row, iterates concepts × variants, handles abort (fast path pre-loop check + between-iteration check), per-variant try/catch emits `error` without halting batch, final `updateStatus` + `complete` event.
- `index.ts` (40) — production `WorkflowDefinition` with `run` bound to singleton deps (`getAssetRepo` / `getBatchRepo` / `getProvider("mock")`). Re-exports factory + helpers for test use. Registered in `src/workflows/index.ts` `ALL_WORKFLOWS`.

### Server-side supporting changes

- `src/server/asset-store/batch-repo.ts` — added `BatchTerminalStatus` + `BatchUpdatePatch` + `updateStatus()` with `assertValidPatch()` runtime guard. SQL uses `COALESCE(?, col)` so `null` patch fields preserve existing values.
- `src/server/asset-store/context.ts` (NEW, 44) — module-level singleton owning `OpenedDatabase` + `AssetRepo` + `BatchRepo`. `initAssetStore()` replaces `openAssetDatabase()` in server boot. `_resetAssetStoreForTests()` closes DB + drops refs. `asset-store/index.ts` barrel updated.
- `src/server/asset-store/asset-repo.ts` + `batch-repo.ts` — `rowTo*` calls `asWorkflowId()` on `workflow_id` column read (Q6).
- `src/server/asset-store/types.ts` — `AssetInternal.workflowId`, `AssetInsertInput.workflowId`, `BatchInternal.workflowId`, `BatchCreateInput.workflowId` all tightened from `string` → `WorkflowId`.
- `src/server/asset-store/dto-mapper.ts` — `imageUrl` now `asset.status === "completed" ? \`/api/assets/${id}/file\` : null` (Q3 refinement).
- `src/server/index.ts` — boot calls `initAssetStore()` in place of direct `openAssetDatabase()`. Template preload unchanged.

### Universal type changes

- `src/core/design/types.ts` — added `WORKFLOW_IDS` readonly array + `asWorkflowId(raw)` guard function. `WorkflowId` now derived from the array literal (single source of truth).
- `src/core/dto/workflow-dto.ts` — `Concept.seed` changed from `seed?: number` to `seed: number` (Q5). Applies to all 4 workflows; `ad-production` / `style-transform` / `aso-screenshots` (Step 7) must set a seed at concept-creation time.
- `src/core/dto/asset-dto.ts` — `AssetDto.imageUrl` widened to `string | null`; `AssetDto.workflowId` narrowed `string → WorkflowId`.

### Tests added (2 files touched / 1 new, 23 new cases)

- `tests/unit/asset-store.test.ts` — +6 cases under new `batch-repo — updateStatus (Phase 3)` block: completed/aborted/error transitions + missing-timestamp failures + unknown-id throw.
- `tests/unit/workflow-artwork-batch.test.ts` (NEW, 335, 17 cases):
  - `pickConcepts` × 3 (seed determinism, seed-divergence, count clamp to pool)
  - `deriveSeed` × 3 (same input → same output, different salts distinct, unsigned 32-bit invariant)
  - `generateConcepts` × 1 (end-to-end determinism + concept shape)
  - `buildPrompt` × 3 (en happy + vi language line + empty do/dont)
  - `ArtworkBatchInputSchema` × 2 (rejects aspectRatio + rejects language — Q7 guardrail)
  - `run()` happy × 3 (event sequence, disk + DB linkage, determinism across runs)
  - `run()` abort × 2 (pre-aborted + mid-flight with partial success + batch status = aborted)

### QA gate result (Session #11 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 86 src files, 0 violations (up 8 from Session #10: context.ts + 5 workflow files + 2 modified don't count)
test: 209/209 pass (20 files) — 2.25s
  prior:   186 (Session #10 baseline)
  new:      23 (6 batch-repo updateStatus + 17 workflow-artwork-batch)
extract:all runtime: 45ms (unchanged)
```

### Deviations from plan

- **`asset-writer.ts` split out of `run.ts`** — plan listed 4 files (input-schema, concept-generator, prompt-builder, run). Added a 5th (asset-writer) to keep `run.ts` under 150 LOC + make DB/FS side effects testable in isolation. Net LOC unchanged; single-responsibility gain.
- **Factory pattern `createArtworkBatchRun(resolveDeps)`** instead of direct `async *run()`. Needed because `ALL_WORKFLOWS` is built at module-import time but asset-store singleton is only initialized at server boot. Factory defers dep resolution. Tests bypass the factory and build their own instance with in-memory repos. Does NOT widen the `WorkflowDefinition.run` signature seen by dispatcher — it still sees `(params) => AsyncGenerator`.
- **`context.ts` singleton pattern** — new module. Boot path changes from `openAssetDatabase()` → `initAssetStore()`. All existing tests that called `openAssetDatabase({ path: ":memory:" })` directly still work (factory is exported independently).

### Known pending items (for Session #12)

1. **HTTP-layer integration smoke** — plan Step 3 listed no integration test; Step 4 plan includes `tests/integration/workflows-full.test.ts` smoke. First real end-to-end with SSE framing arrives Session #12.
2. **`getProvider("mock")` hardcoded** in `artworkBatchWorkflow.run`. Step 4 route handler will thread `providerId` from request body through dispatcher → `params.providerId`. Currently `params.providerId` is ignored inside run.ts (always uses mock). Acceptable for Phase 3 (Mock-only). **Must switch when real gemini/vertex providers land Phase 4** — change to `getProvider(params.providerId)` inside the factory's closure. Flagged here so the diff is obvious.
3. **Orphan PNG sweep** — if DB insert fails after file write, the PNG stays on disk. Phase 5 tool: `scripts/sweep-orphan-assets.ts` to reconcile `data/assets/` with `assets` table and unlink orphans.
4. **Concept description reuse** — every concept in a batch carries the same `description = input.subjectDescription`. Fine for Phase 3; Step 7 workflows (style-transform especially) may want per-concept description derivation.
5. **Batch `aborted` not emitted by dispatcher** — per Session #10 D2, dispatcher doesn't inject `aborted`. artwork-batch's run.ts emits it itself. Step 7 workflows must follow the same pattern; reminder locked in CONTRIBUTING-style comment atop run.ts.

## Next Session (#12) kickoff — Phase 3 Step 4

1. Read this file + `memory/MEMORY.md` to recover state. Verify baseline `npm run regression:full` = 209/209.
2. Read `BOOTSTRAP-PHASE3.md` Step 4 section (lines 125-155).
3. Scope decisions for bro before coding:
   - SSE framing — `streamSSE` from `hono/streaming` per plan. Any `Retry-After` or custom event-id shape needed?
   - Cancel endpoint path — `DELETE /api/workflows/runs/:batchId` per plan. Return 204 on successful abort, 404 if unknown/done. OK?
   - Route input validation — reuse `validateBody()` middleware? Or inline since dispatcher will validate via precondition anyway?
   - `workflow-runs` stub in `STUB_DOMAINS` — keep or remove? Plan says remove.
4. After alignment, implement Step 4 per plan. Est 2-3h.

---

## Completed in Session #10 (Phase 3 Steps 1-2)

### Step 1 — Templates loader + cache (3 files under `src/server/templates/`)

- `loader.ts` (77) — `loadTemplate<T>(name, schema, { baseDir? }): T`. Synchronous read + `JSON.parse` + `schema.safeParse`. Every I/O / parse / drift failure wrapped as `ExtractionError` with `{ template, path, cause|issues }` details. `TemplateName` union + `ALL_TEMPLATE_NAMES` readonly array + `DEFAULT_TEMPLATES_DIR` exported.
- `cache.ts` (79) — module-level `Map<TemplateName, unknown>` memo. 6 typed getters (`getArtworkGroups`, `getAdLayouts`, `getCountryProfiles`, `getStyleDna`, `getI18n`, `getCopyTemplates`). `preloadAllTemplates()` iterates `ALL_TEMPLATE_NAMES` via switch so every name is statically visited (adding a template forces a switch update). `_resetTemplateCacheForTests()` test-only export.
- `index.ts` (22) — barrel re-exports.
- Boot wiring: `src/server/index.ts` calls `preloadAllTemplates()` between `openAssetDatabase()` and `serve()` — fail-fast if any JSON missing/corrupted before binding HTTP listener.

### Step 2 — Workflow orchestration core (5 files)

- `src/workflows/types.ts` (48) — PLAN §6.3 shape. `WorkflowRunParams` (profile, providerId, modelId, aspectRatio, language?, input, abortSignal, batchId) + `WorkflowDefinition` (id, displayName, description, colorVariant, requirement, compatibilityOverrides, inputSchema, `run: (params) => AsyncGenerator<WorkflowEvent>`). Re-exports `Concept`, `WorkflowEvent`, `CompatibilityMatrix`, `CompatibilityResult`, `CompatibilityOverride`, `WorkflowRequirement`, `WorkflowId` for one-stop workflow imports.
- `src/workflows/index.ts` (23) — `ALL_WORKFLOWS: readonly WorkflowDefinition[] = []` (empty until Step 3+7 populate) + `getWorkflow(id)` lookup throwing `NotFoundError` with `availableWorkflows` list on miss.
- `src/server/workflows-runtime/abort-registry.ts` (45) — module-level `Map<string, AbortController>`. `registerBatch` (throws on duplicate batchId), `abortBatch` (returns false if unknown/already-aborted), `deregisterBatch`, `isBatchActive`, `_resetAbortRegistryForTests`.
- `src/server/workflows-runtime/precondition-check.ts` (132) — PLAN §6.4 sweep. Dependency-injectable (`PreconditionDeps` with optional `getWorkflow` / `loadProfile` / `resolveModel` / `hasActiveKey` stubs). Order: #1 workflow exists → #2 profile loads → #3 model resolves + providerId matches → #4 active key (mock always ok; gemini/vertex check `loadStoredKeys().<provider>.activeSlotId !== null`) → #5 compatibility matrix (supports overrides) → #6 runtime aspect-ratio + language → #7 banned input keys (`aspectRatio` / `language` forbidden at input level per §6.3) → #8 `workflow.inputSchema.parse`. Returns `{ workflow, profile, model, parsedInput }` on success so dispatcher doesn't re-fetch.
- `src/server/workflows-runtime/dispatcher.ts` (55) — `async *dispatch(params, deps)` AsyncGenerator. Calls `checkPreconditions` first, registers `AbortController` (caller can inject an externally-owned one via `deps.controller`), iterates `workflow.run(runParams)`, defensive early-exit if controller aborts without workflow acknowledging, deregisters in `finally` so memory can't leak.
- `src/server/workflows-runtime/index.ts` (19) — barrel.

### Tests added (2 files, 23 new tests)

- `tests/unit/templates-loader.test.ts` (109, 9 tests) — real-JSON happy path, returned shape echo, missing-file / malformed-JSON / schema-drift (via `mkdtempSync` fixture dir), cache hit same-reference, cross-getter isolation, cache-reset forces re-read.
- `tests/unit/workflows-precondition.test.ts` (215, 14 tests) — one happy + one throwing path per precondition #1-#8; extra happy-path case for `compatibilityOverrides` forcing compatible; dep-injected `getWorkflow` / `loadProfile` / `resolveModel` / `hasActiveKey` so test never touches disk.

### Infra tweak

- `tsconfig.json` paths: added `"@/workflows": ["src/workflows/index"]` root alias alongside existing `"@/workflows/*": ["src/workflows/*"]` so bare `@/workflows` barrel imports resolve (vitest already had it — tsconfig was the missing half). **No other structural changes.**

### Decisions locked Session #10

- **Workflow input schema guardrails:** precondition #7 explicitly rejects `aspectRatio` / `language` keys on input BEFORE `inputSchema.parse` runs. Prevents a workflow author accidentally declaring them in their Zod schema (Step 7 unit-test sweep is belt-and-suspenders at registration time).
- **Dispatcher does NOT auto-emit `aborted` event.** Workflow `run()` is contractually responsible for respecting its own `abortSignal` and emitting `{ type: "aborted", batchId, completedCount, totalCount }` on shutdown (per Step 3 spec). Dispatcher adds a defensive `return` if the generator keeps yielding non-`aborted` events post-abort, but does not inject. Simpler contract; Step 3-7 tests enforce the shape per workflow.
- **`@/workflows` as root barrel.** tsconfig alias mirrors the vitest alias; future route/client imports can use `import { ALL_WORKFLOWS, getWorkflow } from "@/workflows"` without `/index` suffix.
- **`hasActiveKey` default impl** reads `loadStoredKeys()`. Mock always true; gemini/vertex require `activeSlotId !== null`. Unknown provider → false (which then trips NoActiveKeyError — acceptable; Step 3 dispatch path goes through mock only in Phase 3, real provider arriving in Phase 4 needs no change here).

### QA gate result (Session #10 final)

```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 78 src files, 0 violations
test: 186/186 pass (19 files) — 2.08s
  prior:   163 (122 unit + 28 integration + 13 extraction)
  new:      23 (9 templates-loader + 14 workflows-precondition)
extract:all runtime: still 45ms (no script changes)
```

### Known pending items (for Session #11)

1. **`ALL_WORKFLOWS` is empty** — Step 3 registers `artworkBatchWorkflow`, Step 7 appends the other three. `getWorkflow("artwork-batch")` currently throws NotFoundError (expected, covered in precondition #1 test).
2. **Dispatcher has no E2E coverage yet** — only precondition unit tests today. Step 3 smoke (Mock workflow through dispatcher, abort mid-stream) gives first end-to-end signal.
3. **`_resetTemplateCacheForTests` + `_resetAbortRegistryForTests`** are test-only underscore exports. Not reachable from production boot paths; flagged here so future security audit doesn't flag them as prod leakage.
4. **`src/workflows/artwork-batch/` dir does NOT exist yet** — Step 3 creates `input-schema.ts` + `concept-generator.ts` + `prompt-builder.ts` + `run.ts` + `index.ts` (~4 files). Reads `getArtworkGroups()` from Step 1 cache.
5. **Batch repo extension (`createBatch`, `updateBatchStatus`) deferred** — Step 3 plan says add to `src/server/asset-store/batch-repo.ts`. File doesn't yet exist; Session #11 creates alongside artwork-batch.

## Next Session (#11) kickoff — Phase 3 Step 3

1. Read this file + `memory/MEMORY.md` to recover state. Verify baseline `npm run regression:full` = 186/186.
2. Read `BOOTSTRAP-PHASE3.md` Step 3 section in full (lines 88-121).
3. Scope decisions for bro before coding:
   - batch-repo shape (new file vs extend asset-repo)
   - concept-generator determinism strategy (use seed? Pick first N entries of category? Random with seeded shuffle?)
   - Mock asset write path — real `data/assets/<id>.png` files, or stub `Buffer.from("mock-bytes")`?
   - How `buildPrompt` composes profile + concept + locale (is locale = language from top-level or profile.defaultLang?)
4. After alignment, implement Step 3 per plan. Est 3-4h.

If context budget still OK after Step 3, continue to Step 4 (SSE route + cancel) since that's the natural unlock for client work.

---

## Phase 2 Summary (closed)

| Step | Title | Status |
|---|---|---|
| 1 | Move Genart-{1,2,3}/ → vendor/ + .gitignore for data/templates/ negation | ✅ Session #8 (genart-3) / ✅ Session #9 (genart-1/2 zombies cleaned, .gitignore lines 35-36 removed) |
| 2 | Vendor source shape mapping (6 extraction targets) | ✅ Session #8 |
| 3 | `src/core/templates/` module (types + 6 parsers + barrel) | ✅ Session #8 — 8 files, 582 LOC |
| 4 | Layer 1 schema tests (`templates-schemas.test.ts`) | ✅ Session #8 — 30 tests, 18ms |
| 5 | 3 extract scripts + orchestrator (AST parse via ts-morph) | ✅ Session #9 — 5 files, 180 LOC |
| 6 | Run `extract:all` → produce 6 data/templates/*.json | ✅ Session #9 — 45ms total |
| 7 | Layer 2 acceptance + determinism + Layer 3 snapshot tests | ✅ Session #9 — 3 files, 174 LOC, 13 tests |
| 8 | regression:full + PHASE-STATUS close | ✅ Session #9 — 163/163 green |

## Phase 1 Summary (for reference)

| Step | Title | Status |
|---|---|---|
| 1 | Project Init + Toolchain | ✅ Session #1 |
| 2 | `src/core` Universal Layer | ✅ Session #1 |
| 3 | `src/server/keys` Encrypted Key Storage | ✅ Session #2 — QA gate green (47 tests pass) |
| 4 | `src/server/providers/mock` + Contract Test | ✅ Session #3 — QA gate green (62 tests pass) |
| 5 | SQLite + Migrations + Profile Repo | ✅ Session #6 — QA gate green (92 tests pass) |
| 6 | Hono Server Skeleton | ✅ Session #7 — QA gate green (120 tests pass, 13 files) |
| 7 | Vite Client Skeleton | ✅ Session #7 — regression green, vite build green, dev smoke green |

---

## Completed in Session #9 (Phase 2 Part 2 — Extraction)

### Kickoff cleanup

- **Genart-1/2 zombie folders** — verified identical to `vendor/genart-{1,2}` via `diff -rq`, then `rm -rf` both. `.gitignore` lines 35-36 (`/Genart-1/`, `/Genart-2/`) removed. Zombies gone, session-8 known-issue #1 closed.
- **ts-morph audit** — `npm audit fix --force` cleared all 10 ts-morph transitive vulns. Side-effects: 5 deps bumped (`hono 4.7.0→4.12.14`, `@hono/node-server 1.13.8→1.19.14`, `eslint 9.18.0→9.39.4`, `tsx 4.19.2→4.21.0`, `vitest 2.1.8→2.1.9`). All `^` markers added by fix were stripped back to exact pins (hard rule). 5 vulns remain (esbuild→vite→vitest dev-only chain, needs vitest@4 breaking upgrade) — **bro accepted defer** (dev-only, no prod runtime impact).

### Decisions locked Session #9 (approved by bro)

- **Q1 audit:** `npm audit fix --force`, remaining 5 dev-only vulns accepted.
- **Q2 Layer 3 snapshot:** yes, implemented as `upstream-snapshot.test.ts` (6 pinned SHA-256 values).
- **Q3 CLI filter:** all-or-nothing (no `--only=genart-X`).
- **Q4 package.json scripts:** single `extract:all` only (no `:dry`, no per-target).
- **Q5 zombies:** delete (done).

### Files under `scripts/` (5 files, 180 LOC)

- `scripts/extract-common.ts` (160) — shared helpers: `evalLiteralNode` (ts-morph AST → JS literal, supports strings/nums/bools/null/arrays/objects + `as`/parens/satisfies + `PropertyAccess` resolved via enumMap), `readEnumMap`, `readExportedConst`, `openSourceFile` (per-call Project isolation), `sortKeysDeep`, `writeJsonDeterministic` (sorted keys + 2-space + trailing \n).
- `scripts/extract-genart-1.ts` (41) — reads 10 `_GROUPS` const arrays from `vendor/genart-1/types.ts`, passes to `parseArtworkGroups` (handles drop + merge), writes `data/templates/artwork-groups.json`.
- `scripts/extract-genart-2.ts` (32) — reads `FeatureFocus` enum from `vendor/genart-2/types.ts`, `LAYOUTS` from `constants.ts` with enum-map context (resolves `FeatureFocus.RESTORE → "restore"`), writes `data/templates/ad-layouts.json` (29 layouts, 7 feature values).
- `scripts/extract-genart-3.ts` (47) — reads 5 exports from `vendor/genart-3/constants.ts` (I18N, ART_STYLES, ZONE_BASE, COUNTRY_OVERRIDES, COPY_TEMPLATES), invokes 4 parsers, writes 4 JSONs.
- `scripts/extract-all.ts` (21) — orchestrator, runs 3 extractors sequentially, fails fast. Wired as `npm run extract:all`.

### Data produced (`data/templates/*.json`, 6 files, ~24KB total)

| File | Size | Shape highlights |
|---|---|---|
| artwork-groups.json | 1.1KB | 8 categories (memory/cartoon/aiArt/festive/xmas/baby/avatar/allInOne). `sexyAnime` + `superSexy` dropped per D1. |
| ad-layouts.json | 13KB | 29 layouts, features in valid FeatureFocus enum (7 string values). |
| country-profiles.json | 4.4KB | 16 countries (VN/TH/ID/PH/SG/MY/KR/JP/US/GB/ES/FR/IT/DE/BR/MX) + 4 zones (SEA/EAST_ASIA/GLOBAL_WEST/LATAM). Preserved structure per D2. |
| style-dna.json | 1.0KB | 3 styles: ANIME, GHIBLI, PIXAR. |
| i18n.json | 1.6KB | 11 langs (includes `th` + `id` per D3). |
| copy-templates.json | 3.0KB | 10 langs (no `id` — intentional per D3). Every entry has h[3] + s[3]. |

### Tests (new `tests/extraction/` folder, 13 tests)

- `tests/extraction/full-extract.test.ts` (92, 6 tests) — Layer 2 acceptance. Reads each JSON, validates against canonical schema, anchor checks: drop list, layout.id pairing + valid feature enum, VN.name = "Vietnam", GB.zone = "GLOBAL_WEST", `resolveCountry(VN).casting === zones.SEA.casting`, GHIBLI label match, 11 i18n langs, 10 copy langs with id excluded.
- `tests/extraction/determinism.test.ts` (43, 1 test) — runs `extractGenart1/2/3` twice, hashes `data/templates/` (SHA-256 of sorted filenames + NUL-separated contents), asserts identical. 62ms total.
- `tests/extraction/upstream-snapshot.test.ts` (39, 6 tests) — Layer 3 tripwire. Pinned SHA-256 per file; mismatch = either intentional vendor edit (update pin) or extract script regression (investigate). Compute-command documented inline.

### QA gate result (Session #9 final)
```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 68 source files, 0 violations (scripts/ not scanned by design)
test: 163/163 pass (17 files) — 2.13s
  prior: 122 unit + 28 integration = 150
  new:   13 extraction (6 acceptance + 1 determinism + 6 snapshot)
extract:all runtime: 45ms (3 extractors, 6 JSONs)
```

### Deviations from plan

- **`openSourceFiles` helper → `openSourceFile` (single)** — initial helper returned `Record<string, SourceFile>`, but strict-mode index access yielded `SourceFile | undefined`, forcing ugly `!` assertions. Simplified to single-file helper (one Project per call — no shared state, trivially independent per extractor).
- **ts-morph audit side-effects** — 4 deps outside ts-morph's transitive tree got bumped (hono/node-server minors, eslint minor, tsx minor, vitest patch). Not planned, but all patch/minor within semver-safe range; 150 prior tests still green after bump. Bro can revert if undesired.

### Known pending items

1. **5 dev-only vulnerabilities** (esbuild < 0.24.2 CORS issue, chained through vite + vite-node + @vitest/mocker + vitest 2.x). Fix requires vitest@2→@4 major bump. Deferred; not blocking Phase 3. Re-audit when touching test infra.
2. **`data/templates/`** now tracked (gitignore negation `!/data/templates/` was already set Session #8). Untracked until bro `git add` + commit.
3. **Phase 3 loader** — `src/server/templates/loader.ts` + `cache.ts` still deferred. Workflow runners consume via loader.

## Next Session (#10) kickoff — Phase 3 entry point

1. Read this file + `memory/MEMORY.md` + `memory/patterns.md` to recover state.
2. Verify baseline — `npm run regression:full` must be 163/163 green.
3. Verify 6 JSONs exist at `data/templates/` (run `npm run extract:all` if absent).
4. Decide Phase 3 scope with bro: server loader + cache, workflow-runners, OR cms routes first.

---

## Completed in Session #8 (Phase 2 Part 1)

### Decisions locked Session #8 (approved by bro)

**D1 — Artwork-groups output shape (v2 decision):** camelCase merged Record
`{ schemaVersion: 1, groups: { memory, cartoon, aiArt, festive, xmas, baby, avatar, allInOne } }`.
DROP `sexyAnime` + `superSexy` (unchanged from v2.0). Keys in camelCase for JSON idiom consistency; source SCREAMING_SNAKE is Genart-1 hand-writing artifact.

**D2 — Country-profiles merge direction:** preserved structure (B).
`{ zones: {...}, countries: { VN: { name, zone: "SEA", defaultLang, langs } } }`. Rejects flat-merge (A) — zone duplication 16× bloats file, drift risk when editing zones. Phase 3 `resolveCountry(data, code): ResolvedCountryProfile` flattens at load time. Interface + implementation landed in Session #8 (pure 15-LOC fn, colocated in `country-profiles.ts` — deviates from bro's "interface-only in Phase 2" plan, flagged in commit message).

**D3 — i18n / copy-templates lang divergence:** extract as-is.
`I18nLangSchema` = 11 langs (en, vi, ja, ko, th, es, fr, id, pt, it, de). `CopyLangSchema` = 10 langs (subset minus `id`). Divergence is intentional from Genart-3; do NOT fabricate missing langs.

**D4 — Extraction strategy (Session #9 scope):** AST parse via `ts-morph` (NOT dynamic import). Reasons: vendor code might break runtime imports (peer deps), fail-fast per Rule 12, no vendor code execution = safer + deterministic.

**D5 — Determinism format:** sort object keys recursively + `JSON.stringify(x, null, 2)` + trailing newline. Enforced by a `determinism.test.ts` that hashes data/templates/ twice across consecutive `extract:all` runs (Session #9).

**D6 — Extract script location:** flat under `scripts/extract-genart-{1,2,3}.ts` + `scripts/extract-all.ts` orchestrator.

**D7 — Language enum locality:** don't churn canonical `LanguageCode` (src/core/model-registry/types.ts) to add `th` + `id`. Rule 14 stability wins — bumping canonical would force AppProfile v1 → v2 for unrelated reasons. Templates define their own local enums; Phase 3 may consolidate when workflow inputs cross both axes.

### Files under `src/core/templates/` (8 files, 582 LOC)

- `types.ts` (46) — shared Zod fragments only: `SchemaVersion1`, `I18nLangSchema` (11), `CopyLangSchema` (10), `FeatureFocusSchema` (7 values extracted from `FeatureFocus` TS enum in Genart-2). Rationale for language locality inlined.
- `artwork-groups.ts` (85) — `ArtworkGroupsSchema` + `parseArtworkGroups`. Maps 10 vendor exports → 8 camelCase keys, DROPS sexyAnime + superSexy. Fail-fast guard: drop-target keys (SEXY_ANIME_GROUPS + SUPER_SEXY_GROUPS) must still exist in vendor source (else re-audit required — vendor silent removal would mean we stop dropping anything).
- `ad-layouts.ts` (75) — `AdLayoutsSchema` + `parseAdLayouts`. Record<layoutId, LayoutConfig> with 28 entries expected. Invariant check: `layouts[k].id === k` (catches vendor manual edits breaking pairing).
- `country-profiles.ts` (129) — `CountryProfilesSchema` + `parseCountryProfiles` + `ResolvedCountryProfile` interface + `resolveCountry(data, code)` flat-merge fn. Preserved-structure output (D2). Cross-reference check: every `country.zone` must exist as a `zones[]` key.
- `style-dna.ts` (71) — `StyleDnaSchema` + `parseStyleDna`. Closed 3-key enum (ANIME/GHIBLI/PIXAR) — adding a style = schema bump. Preserves SCREAMING_SNAKE keys (enum-like constants, not data labels). Invariant: `styles[k].key === k`.
- `i18n.ts` (59) — `I18nSchema` + `parseI18n`. Schema shape built programmatically from `I18nLangSchema.options` — adding a lang to types.ts auto-propagates.
- `copy-templates.ts` (58) — `CopyTemplatesSchema` + `parseCopyTemplates`. Same programmatic auto-prop pattern as i18n. `.length(3)` on `h` + `s` arrays (vendor fixed-3 invariant).
- `index.ts` (59) — barrel re-exports public surface.

Parsers are PURE: `(raw: unknown) => ValidatedFile`, no file I/O. All I/O lives in extract scripts (Session #9).

### Approach: colocated (A) vs centralized (B)

bro's "Start order" line said types.ts holds "all 6 Zod schemas + shared types". bro's "Design defaults" item #2 said "each template file: Zod schema + parser function colocated, ~40-80 LOC each". These contradict; Session #8 chose A (colocated) because:
- Self-contained modules per CONTRIBUTING single-responsibility
- LOC distributed across files (avoids bloat)
- Matches `country-profiles.ts` step-4 instruction ("parser + ResolvedCountryProfile + resolveCountry")

types.ts kept only cross-cutting enums. Bro can revert to B in Session #9 if preferred, but the 30 tests would need re-routing.

### New dependency

- `ts-morph@28.0.0` (devDependency, pinned exact per hard rule) — installed in Session #8 for Session #9 AST-parse extraction. Did NOT audit-fix the 10 vulnerabilities flagged at install (2 low, 4 moderate, 3 high, 1 critical — all transitive through ts-morph or existing deps); Session #9 bro should decide whether to audit-fix-force.

### Tests

- `tests/unit/templates-schemas.test.ts` (30) — Layer 1, 18ms.
  - `parseArtworkGroups` × 6 (valid+drop, drop-key audit guard, missing mapped, non-string, bad-input, Zod defense-in-depth).
  - `parseAdLayouts` × 4 (valid+feature, id/key mismatch, missing export, bad-feature).
  - `parseCountryProfiles + resolveCountry` × 7 (preserved-structure, cross-ref, lang rejection, flat-merge, unknown-code throw, empty-zones, compile-time type).
  - `parseStyleDna` × 5 (valid, missing export, key/record mismatch, missing required style, extra style strict).
  - `parseI18n` × 4 (all 11 langs incl th+id, missing lang, extra lang, partial entry).
  - `parseCopyTemplates` × 4 (all 10 langs, `id` rejection, wrong-length, missing export).

### QA gate result (Session #8 final)
```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 68 src files, 0 violations (tests/ exempt by design)
test: 122/122 pass (92 prior unit + 30 new + 0 integration — no integration changes)
  Duration: 1.05s
build: not re-run (no client changes since Session #7's clean build)
```

### Deviations from bro's plan

1. **Session boundary numbering** — bro's D4 treats Session #8 as "pre-move" with Session #9 starting at "Move Genart → vendor/". Session #8 actually did the move already (genart-3 clean; genart-1/2 copied due to Windows file-lock). Session #9 starts at extract scripts, not the move.
2. **resolveCountry fully implemented** (bro said interface-only Phase 2). 15-LOC pure fn, colocated, enables Layer 2 acceptance test. Bro can revert to interface-only if preferred — would simplify `country-profiles.ts` by ~25 LOC.
3. **Approach A colocated schemas** (bro said "all 6 schemas in types.ts"). See "Approach" subsection above.

### Known issues / pending items

1. **Genart-1/2 zombie folders at project root** — `Genart-1/` and `Genart-2/` could not be renamed on Windows (Permission denied from bash, PowerShell `Move-Item`, and cmd `move` all failed; root cause unknown — likely VS Code / WebStorm / indexer holding folder handles without FILE_SHARE_DELETE). Content was **copied** to `vendor/genart-{1,2}/` and originals left at root. `.gitignore` lines 35-36 retained `/Genart-1/` + `/Genart-2/` for safety. Bro must close whatever process is holding them, then delete manually; remove the gitignore lines once gone.
2. **ts-morph audit** — 10 vulnerabilities (1 critical) flagged at install. Session #9 should decide: `npm audit fix --force` vs ignore (likely dev-only transitives).
3. **Integration tests unchanged** — no server changes this session, so 28 Step 6+7 integration tests untouched. Regression:full still 120/120 (92 unit + 28 integration) from Session #7; Session #8 regression shows 122 because test:unit includes the 30 new ones but not the 28 integration.
4. **`data/templates/` directory empty, tracked by gitignore negation** — negation pattern verified with `git check-ignore`. Session #9 extract scripts will populate.

---

## Next Session (#9) kickoff checklist

1. Read this file + `memory/MEMORY.md` + `memory/patterns.md` to recover state. Verify decisions **D1-D7** locked above.
2. Verify baseline — `npm run regression:full` must be 122/122 green (plus 28 integration = 150), 0 TS errors, 0 lint/LOC violations.
3. Verify ts-morph installed at 28.0.0 exact: `npm ls ts-morph`.
4. Decide audit-fix policy for 10 vulnerabilities.
5. (Optional, if bro closed IDE) Retry `mv Genart-1 vendor/genart-1` + `mv Genart-2 vendor/genart-2`, remove `/Genart-1/` + `/Genart-2/` from .gitignore.

### Session #9 scope (Steps 5-8, est. 4-6h)

**Step 5 — Extract scripts (~210 LOC, 4 files)**
- `scripts/extract-genart-1.ts` (~40) — ts-morph reads `vendor/genart-1/types.ts`, extracts 10 `_GROUPS` array exports into `{ MEMORY_GROUPS: [...], ... }`, calls `parseArtworkGroups`, writes `data/templates/artwork-groups.json`.
- `scripts/extract-genart-2.ts` (~40) — reads `vendor/genart-2/constants.ts`, extracts `LAYOUTS` Record, calls `parseAdLayouts`, writes `data/templates/ad-layouts.json`.
- `scripts/extract-genart-3.ts` (~80) — reads `vendor/genart-3/constants.ts`, extracts `ZONE_BASE` + `COUNTRY_OVERRIDES` + `ART_STYLES` + `I18N` + `COPY_TEMPLATES`, calls 4 parsers, writes 4 JSON files.
- `scripts/extract-all.ts` (~50) — orchestrator, supports `--dry-run` (prints plan without writing), enforces determinism (sorted keys, 2-space indent, trailing newline), invokes the 3 extractors in sequence.
- Add to `package.json` scripts: `extract:all`, `extract:all:dry`, possibly per-target.

**Step 6 — Run extract:all**
- `npm run extract:all -- --dry-run` — preview.
- `npm run extract:all` — write 6 real JSONs under `data/templates/`.
- Commit the 6 JSON files as separate commit (Phase-2-data boundary).

**Step 7 — Layer 2 acceptance test + determinism + Layer 3 snapshot (optional)**
- `tests/extraction/full-extract.test.ts` (~80) — exec `extract:all`, assert 6 files exist + validate each against its loader schema + anchor-value checks:
  - `country-profiles.json` has `countries.VN.name === "Vietnam"`
  - `style-dna.json` has `styles.GHIBLI`
  - `artwork-groups.json` does NOT have `sexyAnime` or `superSexy`
  - `i18n.json` has 11 langs (incl `th` + `id`)
  - `copy-templates.json` has 10 langs (no `id`)
- `tests/extraction/determinism.test.ts` (~30) — run extract:all twice, hash `data/templates/` before + after, assert byte-identical.
- (Optional) `tests/extraction/upstream-snapshot.test.ts` (~30) — SHA-256 of each extracted file committed, mismatch → warn "upstream vendor content drifted, re-verify extraction logic".

**Step 8 — Finalize + update PHASE-STATUS**
- Regression: 150+ tests green (Session #8's 122 + ~5 acceptance + 1 determinism + optional 6 snapshot).
- Mark Phase 2 DONE in PHASE-STATUS.
- Document deferred items:
  - Phase 3: `src/server/templates/loader.ts` (file I/O + cache, couples with workflow runtime)
  - Phase 3: `src/server/templates/cache.ts`
  - Phase 3: workflow runners consume templates via loader

### Session #9 open questions

1. **Audit policy** for ts-morph transitives (10 vulns, 1 critical).
2. **Layer 3 snapshot test** — include or skip? (Bro said "optional, recommend if budget allows".)
3. **Extract script CLI shape** — support filtering (`--only=genart-3`)? Or always all-or-nothing?
4. **package.json scripts naming** — `extract:all` + `extract:all:dry` + `extract:genart-1` etc., or cleaner?
5. **Genart zombie cleanup** — if bro closed IDE, move succeeds → gitignore cleanup. Else leave as is.

---



## Phase 1 Week 1 FINAL QA gate (Session #7)

```
npm run regression:full
  → lint: clean (16 source + 3 integration-test files)
  → typecheck:server: 0 errors
  → typecheck:client: 0 errors
  → check-loc: 68 files, 0 violations
  → test: 120/120 pass (10 unit + 3 integration) — 1.9s

npm run build
  → tsc server: clean
  → vite client: 189KB bundle (60KB gzip) + 17KB CSS — 1.27s

npm run dev (manual smoke)
  → client 127.0.0.1:5173 serves index.html with React Refresh HMR
  → server 127.0.0.1:5174 serves /api/health = { status: ok, version: 0.1.0, uptimeMs }
  → proxy localhost:5173/api/* → 127.0.0.1:5174 works (/api/health + SSE echo tested)
  → X-Request-Id header preserved through proxy
  → Tailwind compile via PostCSS works (base utilities emitted)
```

**Phase 1 is DONE.** Phase 2 (extraction) is the next major milestone.

## Completed in Session #7 (Step 7 — Vite Client Skeleton)

### Decisions locked Session #7 (Step 7 alignment)
1. **SSE hook shape** — fetch-based with AbortController (NOT `EventSource`). Reason: EventSource can't do POST/custom headers; Phase 3 workflow dispatcher needs POST trigger. Parser reads `ReadableStream`, splits on `\n\n`, captures `event:` + `data:` + optional `id:` fields. Hook exposes `{ events, status, error }` with `status: "idle" | "connecting" | "streaming" | "closed" | "error"`.
2. **API client** — typed fetch wrapper `apiGet<T>/apiPost<T>` + `ApiError extends Error { code, status, details? }`. Matches server error response shape from Step 6 `error-handler.ts`. No Hono RPC (no new deps).
3. **Client tests** — ZERO in Phase 1 (no `happy-dom`/`jsdom`/`@testing-library/react` deps). Acceptance = `typecheck:client` + vite build + manual browser smoke. Phase 5 CMS UI will add test harness when components carry real logic.
4. **Router** — `useState<Page>` switcher (BOOTSTRAP mandate). `type Page = "home"` today; Phase 5 extends the union. No `react-router-dom`.
5. **Dark mode** — `class` strategy (already locked Step 1 in `tailwind.config.ts`). Default dark via `body.bg-slate-950 text-slate-100` in `index.html`.

### Files under `src/client/`
- `main.tsx` — React 19 root. `createRoot` + `StrictMode`. Imports `./styles/index.css` so Vite+PostCSS pipeline injects Tailwind-compiled CSS.
- `App.tsx` — page switcher shell. `const [page] = useState<Page>("home")` + exhaustive `switch`. Extension point documented inline.
- `pages/Home.tsx` — landing page. Heading "Images Gen Art", sub "Local artwork generation platform — Phase 1 scaffold", `HealthBadge` (3 states: loading pulse-gray, error red-950, ok green-950 with version + uptime), footnote "Client: localhost:5173 · Server: 127.0.0.1:5174". Pure Tailwind literal classes (Rule 1 — no interpolation).
- `api/client.ts` — `apiGet<T>` / `apiPost<T>` / `ApiError`. Parses `application/json` error body per server shape `{ code, message, details? }`; falls back to `{ code: "HTTP_ERROR", message: "HTTP 4xx" }` for non-JSON. AbortSignal threaded via `ApiOptions.signal`.
- `api/hooks.ts` — `useApiHealth()` returns `ApiState<HealthData>` = `{ data, error, loading }`. One-shot fetch on mount, AbortController cleanup on unmount.
- `utils/use-sse.ts` — `useSSE(url, { enabled? })` returns `{ events, status, error }`. Full fetch-based parser shipped (not stub). Decodes UTF-8 stream, splits on `\n\n`, parses `event:` + `data:` + `id:` lines. AbortController cleanup on unmount.
- `styles/index.css` — `@tailwind base; @tailwind components; @tailwind utilities;` (3 lines).

### QA gate result
```
lint: clean
typecheck:server: 0 errors
typecheck:client: 0 errors
check-loc: 68 files, 0 violations
test: 120/120 (unchanged — Phase 1 client has no tests per Decision 3)
build: tsc server clean + vite client 189KB bundle / 60KB gzip / 1.27s
dev smoke: concurrent server + client boot, proxy passes /api/health + SSE echo
```

### LOC budget
| Client file | LOC |
|---|---|
| `src/client/main.tsx` | 17 |
| `src/client/App.tsx` | 17 |
| `src/client/pages/Home.tsx` | 67 |
| `src/client/api/client.ts` | 64 |
| `src/client/api/hooks.ts` | 41 |
| `src/client/utils/use-sse.ts` | 103 |
| `src/client/styles/index.css` | 3 |
| **Total (7 files)** | **312** |

All files below 300 LOC hard cap. `use-sse.ts` (103) is the largest — contains both React hook + SSE parser; Phase 3 may extract parser if it grows.

---

## Completed in Session #7 (Step 6 — Hono Server Skeleton)

### Decisions locked (approved by bro Session #7)
1. **Route layout = flat** — `src/server/routes/<name>.ts`, promote to folder when > 250 LOC (soft cap).
2. **API body schemas** — colocate `<name>.body.ts` (not yet exercised; Step 6 stubs all return 501).
3. **Request logger** — thin Hono middleware adapter over `@/core/shared/logger` (redactor reused). No `hono/logger` (bypasses Rule 9 redaction).
4. **Dev script** — unchanged (`npm run dev` concurrent). HMR verified via `tsx watch` during smoke.
5. **Request ID** (REFINEMENT 1) — UUID v4 via `globalThis.crypto.randomUUID()`, stored on `c.set("requestId", id)`, echoed in `X-Request-Id` response header, included in every request + error log line.
6. **SSE** — `streamSSE` from `hono/streaming`, path `/api/debug/sse-echo` (matches PLAN §6.4 `/api/debug/*` prefix for dev endpoints), 3 ticks × 200ms, abort propagation via `c.req.raw.signal.aborted` check.
7. **dto-filter** — dev-mode only (skip when `NODE_ENV=production`), recursive JSON scan for banned keys (`file_path`, `filePath`, `service_account_path`, `serviceAccountPath`, `key_encrypted`, `keyEncrypted`), throws `AppError("INTERNAL", …)` with JSON-path `$.a.b[0].c` on leak.

### Files under `src/server/middleware/`
- `error-handler.ts` — Hono `onError` adapter. Maps `AppError.status` → HTTP status with body `{ code, message, details? }`. `ZodError` → 400 `BAD_REQUEST` with `details.issues`. Unknown errors → 500 `INTERNAL` (generic message, no stack leak). Logs at error level **only** when `status === 500` (501 stubs + 4xx stay silent — intentional, log noise reduction).
- `logger.ts` — `requestLogger` middleware. Generates UUID, sets `c.set("requestId")`, writes `X-Request-Id` header, logs `{ requestId, method, path, status, durationMs }` via core logger.
- `validator.ts` — `validateBody<T>(schema)` factory returns middleware. Parses JSON, runs `schema.parse`, stashes on `c.set("validatedBody")`. ZodError bubbles to errorHandler → 400. Invalid JSON body → `BadRequestError`. Not yet exercised (no POST routes in Step 6), wired for Phase 3.
- `dto-filter.ts` — defense-in-depth JSON scanner. Reads `c.res.clone().json()` post-`next()`, finds banned keys recursively, throws on leak. Skipped for non-JSON Content-Type + production mode.

### Files under `src/server/routes/`
- `health.ts` — `createHealthRoute(version)` → `GET /` returns `{ status: "ok", version, uptimeMs }` (uptime via `process.uptime() * 1000`).
- `providers.ts` — `createProvidersRoute()` → `GET /` returns `{ providers, models, registeredProviderIds }`. Providers = full `ALL_PROVIDERS` catalog (3); models = full `ALL_MODELS` with capability embedded (4); registeredProviderIds = runtime registry (Phase 1: `["mock"]`).
- `debug.ts` — `createDebugRoute()` → `GET /sse-echo` streams 3 `tick` events via `streamSSE`, 200ms apart, respects abort.
- `stubs.ts` — `createStubsRoute()` mounts 7 domains (`profiles`, `assets`, `keys`, `workflows`, `templates`, `profile-assets`, `workflow-runs`), all verbs + wildcards → `NotImplementedError` (501). Each domain will be replaced by a real route file as its phase lands.

### Files under `src/server/`
- `app.ts` — `createApp({ version })` factory. Order: `requestLogger` → `dtoFilter` → routes → `onError`. Pure (no I/O) so integration tests mount in-process via `app.fetch()`.
- `index.ts` — boot entry. Reads version from `package.json` via fs, calls `openAssetDatabase()` (exits non-zero on `MigrationDriftError`), then `serve` on `127.0.0.1:5174` (hostname bind enforced — LAN would leak keys).

### Errors (`src/core/shared/errors.ts`)
- `"NOT_IMPLEMENTED"` added to `ErrorCode` union.
- `NotImplementedError extends AppError` — status 501. Used by stub routes.

### Integration tests (new `tests/integration/` folder)
- `app.test.ts` (20) — health shape + version echo + uptimeMs; X-Request-Id UUID format; distinct IDs per call; providers catalog shape + capability provenance; all 7 stub domains × 2 verbs = 14 x 501; unknown route → 404 (Hono default).
- `sse-echo.test.ts` (2) — **happy path** (3 events, correct Content-Type) + **abort propagation** (AbortController abort at 100ms, verify < 3 ticks received, verify `/api/health` still responsive after 300ms — no hung handler). Abort test is critical scaffolding for Phase 3 workflow dispatcher.
- `dto-filter.test.ts` (6) — poison routes with banned keys at various depths (top, nested, array, deep object, snake + camel variants), all → 500 INTERNAL with JSON-path in message. Clean response passes through. Production mode skip verified (toggles `NODE_ENV=production` per test).

### QA gate result
```
lint: clean
check-loc: 61 files, 0 violations
test:unit: 92/92 pass
test:integration: 28/28 pass (3 files)
total: 120/120 in ~2.0s
smoke: server boots in <1s, /api/health 200 + X-Request-Id + correct body; /api/providers full catalog;
       /api/debug/sse-echo 3 ticks emitted; /api/profiles 501 NOT_IMPLEMENTED; /api/unknown 404
```

## Deviations from BOOTSTRAP Step 6 (approved by bro Session #7)

### Deviation 1 — 7 stub routes collapsed into single `stubs.ts` file
**From:** BOOTSTRAP §Step 6 listed 7 individual files (`profiles.ts`, `assets.ts`, etc.)
**To:** Single `src/server/routes/stubs.ts` with `createStubsRoute()` factory + `STUB_DOMAINS` array.
**Rationale:** 7 near-identical 8-LOC files = pure boilerplate. Single factory keeps the stub list visible in one place, and each domain will be **replaced** (not edited) by a real route file when its phase lands. Test iterates the array → automatic coverage when domains are added/removed.

### Deviation 2 — error-handler logs only status 500
**From:** "catches `AppError`, returns …" (BOOTSTRAP §Step 6 implied log all errors)
**To:** Log at `error` level only when `err.status === 500` (genuine internal failures). 501 stubs + 4xx stay silent.
**Rationale:** 14 stub calls × `[ERROR]` log line = stderr noise in CI + local dev. 4xx/501 are known client-state, not server bugs. Phase 4 real provider errors (500 `ExtractionError`) will still log correctly.

### Deviation 3 — Added `AppConfig` param vs free functions
**From:** BOOTSTRAP implied `src/server/index.ts` boots directly.
**To:** `createApp({ version })` factory in `app.ts`; `index.ts` wires version + DB + listener.
**Rationale:** Integration tests mount app in-process without port binding. Cleaner separation of concerns (pure factory vs side-effectful boot).

## Known pending items / notes from Session #7

### 1. Pre-existing TypeScript errors — FIXED in same session

Session #7 initially surfaced 4 TS strict-mode errors predating Step 6, all zero-runtime-impact but blocking `npm run build`. Bro approved in-session fix. All 4 resolved in ~15 min:

- `src/core/shared/errors.ts:29` — conditional `if (details !== undefined)` guard to satisfy `exactOptionalPropertyTypes` (keeps key absent vs present-as-undefined).
- `src/core/shared/id.ts:8` — removed unnecessary `as { crypto?: Crypto }` cast; `@types/node` already exposes `globalThis.crypto` without needing DOM lib.
- `src/server/asset-store/migration-runner.ts:28` — `db: Database` → `db: Database.Database` (use inner class type from CJS namespace, matching `db.ts` pattern).
- `src/core/dto/profile-dto.ts:20` — widened `competitors?: string[]` → `competitors?: string[] | undefined` to match Zod `.optional()` output. JSON.stringify still omits undefined keys → wire shape unchanged.

**New regression coverage:** `typecheck` script added + wired into `npm run regression` and `npm run regression:full`:
```
"typecheck:server": "tsc -p tsconfig.server.json --noEmit",
"typecheck:client": "tsc -p tsconfig.client.json --noEmit",
"typecheck": "npm run typecheck:server && npm run typecheck:client",
"regression": "npm run lint && npm run typecheck && npm run check-loc && npm run test:unit"
```
Future TS drift (Phase 2+) will fail CI before landing. Silent type erosion that built up across Sessions #1-6 cannot recur.

### 2. `validator.ts` middleware has no coverage
No POST routes in Step 6 → `validateBody` factory is wired but not exercised. First Phase 3 POST route (likely `/api/workflow-runs`) will add coverage. Unit test deferred.

### 3. SSE abort test is timing-sensitive
`sse-echo.test.ts` abort case uses `setTimeout(100ms)` + 300ms cleanup wait. Total test duration ~530ms. Stable on bro's Windows machine; could flake on very slow CI. If Phase 3 adds real dispatcher tests, reconfirm abort timing budget.

### 4. Hono default 404 returns `text/plain`
Unknown routes (`GET /api/unknown`) return `404 Not Found` as plain text, not JSON. Error handler only fires on thrown errors. Acceptable for Phase 1 (not a real error state); if Phase 3 requires JSON 404s, add a `app.notFound()` handler. Test codifies current behavior.

### 5. Windows stdout line endings
Integration test stderr shows `[ERROR]` JSON lines from dto-filter tests (expected — they verify leak detection triggers the logger). Not a bug; just noisy. Could suppress via `LOG_LEVEL=error` in vitest env for integration but current `LOG_LEVEL=warn` is correct for unit tests.

## Completed in Session #6 (Step 5 — SQLite + Migrations + Profile Repo)

### Files under `src/server/asset-store/`
- `schema.sql` — canonical reference (PLAN §5.3 verbatim). 3 tables: `assets` (28 cols, v2.2 nullable `replay_payload` + `language`), `batches` (v2.2 status/abortedAt), `profile_assets`. Indexes on profile/workflow/batch/variant_group/created_at.
- `migration-runner.ts` — **Option B location** (moved from BOOTSTRAP-spec'd `scripts/migrations/runner.ts`; see deviation below). Creates `_migrations(filename, applied_at, checksum)` bookkeeping. SHA-256 drift detection: applied file checksum change → throws `MigrationDriftError` (fail-fast, Rule 12). Lexical file order. Per-file transaction.
- `db.ts` — `openAssetDatabase({ path, readonly?, migrationsDir? })` → `{ db, migrations }`. WAL + FK pragmas. Auto-creates parent dir (skipped for `:memory:`). Default path `./data/images-gen-art.db` (deviation from PLAN §4 placeholder `artforge.db` — documented inline).
- `types.ts` — `AssetInternal`, `AssetInsertInput`, `AssetListFilter`, `BatchInternal`, `BatchCreateInput`, `BatchStatus`. Snake-case DB row shapes stay local to repos; public shape is camelCase.
- `asset-repo.ts` — factory `createAssetRepo(db)` returns `{ insert, findById, findByBatch, list }`. `list({ profileId?, workflowId?, limit, offset })` added proactively (Phase 3 DTO-no-paths audit will need it, stub-early per bro). Tags stored as JSON string, parsed on read.
- `batch-repo.ts` — factory `createBatchRepo(db)` returns `{ create, findById }`. Phase-3 will extend with `complete/abort/updateProgress`.
- `dto-mapper.ts` — `toAssetDto(asset)` strips `filePath`, emits `imageUrl: /api/assets/{id}/file`. `toAssetDetailDto` deferred to Phase 3 (needs ProfileDto-mapped replay snapshot).
- `index.ts` — barrel.

### Files under `src/server/profile-repo/`
- `loader.ts` — `loadProfile(id)` reads `data/profiles/{id}.json`, Zod-validated. `tryLoadProfile` returns null if missing. Error messages never leak filesystem paths.
- `saver.ts` — `saveProfile(profile, { dir?, touchUpdatedAt? })`. Zod re-validates input, bumps `updatedAt` by default, writes `{id}.json` with 2-space indent + trailing newline. Rule 14 version-bump policy doc'd inline (v1 today).
- `snapshot.ts` — `freezeProfileForReplay(profile)` = `structuredClone`. Since v2.2 AppProfile already uses asset-IDs (not paths), no path-rewrite is needed; clone protects historical replay payloads from live-profile mutation.
- `dto-mapper.ts` — `toProfileDto` + `toProfileSummaryDto`. Asset IDs resolve to `/api/profile-assets/{id}/file`. Rule 11 — no `appLogoAssetId` / internal paths surface.
- `index.ts` — barrel.

### Files under `scripts/`
- `migrations/2026-04-20-initial.sql` — verbatim copy of `schema.sql` + "DO NOT EDIT" header. Edit → runner throws `MigrationDriftError`.
- `seed-data/profiles/{chartlens,plant-identifier,ai-chatbot}.json` — canonical seeds (git-tracked). All 3 have `appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: []` (Phase 5 CMS populates).
- `seed-profiles.ts` — idempotent copier: `scripts/seed-data/profiles/*.json` → `data/profiles/` if target absent. Never overwrites runtime profiles. Wired as `npm run seed:profiles`.

### Errors (`src/core/shared/errors.ts`)
- `"MIGRATION_DRIFT"` added to `ErrorCode` union, status 500.
- `MigrationDriftError extends AppError` — constructor takes `{ filename, expectedChecksum, actualChecksum }`, formatted message with 12-char checksum previews.

### Tests
- `tests/unit/migration-runner.test.ts` (7) — single-apply + row shape, idempotent re-run, drift detection (edit file after apply → `MigrationDriftError`), multi-file lexical ordering, non-.sql filter, `_migrations` column check, real `scripts/migrations/` apply end-to-end on `:memory:`.
- `tests/unit/asset-store.test.ts` (11) — boot (WAL + FK pragmas on real file), schema tables exist, v2.2 nullable columns correct; `asset-repo` round-trip + findByBatch ordering + list filter/pagination + tags JSON roundtrip; `batch-repo` round-trip + null-on-missing; Rule 11 DTO strips `filePath` (no `./data/` in serialized JSON, `imageUrl` shape).
- `tests/unit/dto-mapper.test.ts` extended (+5 profile tests) — asset-ID → URL mapping, no leakage of internal IDs/paths, visual/positioning/context pass-through, `ProfileSummaryDto` exact shape, null-logo case.
- `tests/unit/app-profile.test.ts` (7) — reads canonical seeds at `scripts/seed-data/profiles/`, validates each against `AppProfileSchema`, checks version=1, null asset IDs, filename↔id match.

### Config
- `vitest.config.ts` — added `test.env.LOG_LEVEL = "warn"` to silence info logs in test output.
- `package.json` — added `"seed:profiles": "tsx scripts/seed-profiles.ts"`.

### QA gate result
```
lint: clean
check-loc: 51 files, 0 violations
test:unit: 92/92 pass (10 test files) — 1.13s total
seed:profiles smoke: 3 copied fresh, 3 skipped on re-run (idempotent)
```

## Deviations from BOOTSTRAP Step 5 (approved by bro Session #6)

### Deviation 1 — Migration runner location (Option B)
**From:** `scripts/migrations/runner.ts` (BOOTSTRAP §Step 5)
**To:** `src/server/asset-store/migration-runner.ts`
**Rationale:** Runner is server library code (imported by `db.ts`), not a CLI entry point. Policy: logic lives in `src/server/`, SQL data files live in `scripts/migrations/`. SQL files unchanged at `scripts/migrations/*.sql`. ESLint src/server/** rules now apply to the runner.

### Deviation 2 — Seed canonical location (Option B)
**From:** `data/profiles/*.json` (BOOTSTRAP §Step 5 deliverables)
**To:** `scripts/seed-data/profiles/*.json` (canonical, git-tracked) + `data/profiles/*.json` (runtime, gitignored, seeded via `npm run seed:profiles`)
**Rationale:** `data/profiles/` holds runtime state (CMS-edited profiles, Phase 5). Committing seeds there would mix committed config with runtime state → git-diff noise once CMS starts writing. Separating canonical (`scripts/seed-data/`) vs runtime (`data/profiles/`) folders keeps git clean. Full policy in `memory/patterns.md` "File location policy".

**Side-effect — gitignore correction:** pre-Session #6, `.gitignore` had `!data/profiles/` (un-ignore, legacy plan A assumption that seeds live there and are git-tracked). Under Option B that un-ignore became wrong: runtime profiles at `data/profiles/` must NOT be committed. Replaced with anchored `/data/profiles/` ignore. Verified with `git check-ignore` — seed canonicals at `scripts/seed-data/profiles/` stay tracked. Anchored per audit rule established in Session #3 (`keys/` bug).

### Deviation 3 — DB default filename
**From:** `artforge.db` (PLAN §4 placeholder)
**To:** `./data/images-gen-art.db`
**Rationale:** Matches renamed project. Legacy `artforge.db` remains gitignored for safety. Documented inline in `src/server/asset-store/db.ts`.

## Known pending items / notes

1. **`toAssetDetailDto`** — deferred to Phase 3. Needs `ProfileDto`-mapped replay snapshot (current stored payload embeds server-shape `AppProfile`). Not blocking Step 6.
2. **Genart-1/2/3 folders** at project root — still untouched, Phase 2 extraction scope.
3. **Profile saver — optimistic concurrency** not implemented (Phase 5 CMS scope per PLAN §6.4). Current saver is unconditional write.
4. **Runtime `data/profiles/`** created by first `npm run seed:profiles` run. Fresh clones require it before Step 6 server will find seeds.



## Completed in Session #3 (Step 4 — Mock Provider + Contract)

### Files under `src/core/providers/`
- `types.ts` — `ImageProvider`, `GenerateParams`, `GenerateResult`, `HealthStatus`, `HealthStatusCode` (canonical universal). **Decision (REFINEMENT 1):** placed in core, not server, so `./contract.ts` can import without crossing core→server boundary (ESLint Rule 4). `imageBytes: Uint8Array` (not Buffer) — Node Buffer extends Uint8Array so server impls still satisfy; keeps core Node-free. Micro-deviation from PLAN §6.1 literal spec; documented in file header.
- `contract.ts` — `runProviderContract(name, factory, fixtures)` — reusable Vitest suite: id/displayName/supportedModels shape, health() ISO checkedAt + valid status enum, generate() returns PNG magic bytes + positive dims + non-negative generationTimeMs, pre-aborted signal rejects, mid-flight abort rejects. **Imports vitest** — intentionally NOT re-exported from `./index.ts` barrel so client bundle doesn't leak vitest.
- `index.ts` — barrel, exports `./types` only.

### Files under `src/server/providers/`
- `types.ts` — thin re-export of universal types from `@/core/providers/types` (ergonomic shorter imports inside server).
- `mock-png-encoder.ts` — generic minimal PNG encoder (**REFINEMENT 2:** split from mock for reusability). 8-bit RGB truecolor (colorType=2), IHDR + IDAT (zlib deflateSync) + IEND chunks, CRC32 lookup table built once at module load. No new deps — uses `node:zlib` only. ~60 LOC, well below Rule 7 cap.
- `mock.ts` — `mockProvider: ImageProvider`. `SHA-256(prompt).digest()[0..2]` → (r,g,b) for determinism; `encodeSolidPng(1024, 1024, r, g, b)` → `imageBytes`. `health()` → `{ status: "ok", latencyMs: 1, checkedAt: ISO }`. `generate()` delays 20ms via `sleep(ms, signal)` that respects pre-aborted + attaches abort listener; rejects with `signal.reason ?? Error("aborted")`. `seedUsed` conditionally set (not spread) to satisfy `exactOptionalPropertyTypes`.
- `registry.ts` — `ReadonlyMap<string, ImageProvider>` seeded with `mockProvider`. `getProvider(id)` throws `ProviderNotFoundError` with structured context (**REFINEMENT 3**). `listProviders()`, `hasProvider(id)` helpers.
- `index.ts` — barrel: types + mock + registry.

### Errors — `src/core/shared/errors.ts` additions
- `"PROVIDER_NOT_FOUND"` added to `ErrorCode` union.
- `ProviderNotFoundError extends AppError` — constructor takes `{ providerId, availableProviders[] }` context object, auto-formats message `Provider 'xyz' not found. Available: ['mock']`, copies context into `details`. Status = 404.
- Exported `ProviderNotFoundContext` interface.

### ProviderCapability comment cleanup
`src/core/model-registry/types.ts:17-18` — removed stale "Duplicated here so client + server both reference the same universal shape" comment (there's no duplicate anywhere; no file ever redefined it). New comment: "canonical universal shape. Single source of truth for client + server. (Server provider impls re-export from here; do not redefine elsewhere.)"

### Tests
- `tests/unit/providers.mock.test.ts` (15) — calls `runProviderContract("mock", ...)` (5 contract tests) + 6 mock-specific (deterministic, different-prompt-differs, 1024×1024 dims, seedUsed echo, seedUsed omitted when absent, supportedModels contains mock-fast) + 4 registry (listProviders contains mock, hasProvider truthy/falsy, getProvider identity, `ProviderNotFoundError` with structured details).

### QA gate result
```
lint: clean
check-loc: 39 files, 0 violations
test:unit: 62/62 pass (7 test files) — mock suite 295ms
```

### Deviations from BOOTSTRAP Step 4 (accepted by bro in Session #3)
- Types canonical location moved to `src/core/providers/types.ts` (BOOTSTRAP said `src/server/providers/types.ts`). Server re-exports from core. **Reason:** contract test in core needs the type; ESLint Rule 4 bans core→server imports.
- PNG encoder split out to `src/server/providers/mock-png-encoder.ts` (BOOTSTRAP implied inline in mock.ts). **Reason:** generic utility, reusable for test fixtures, keeps mock.ts focused on provider impl.
- `imageBytes` typed `Uint8Array` instead of `Buffer` per PLAN §6.1. **Reason:** universal principle — core Node-free.

## Completed in Session #2 (Step 3 — Encrypted Key Storage)

### Files under `src/server/keys/`
- `types.ts` — `KeySlotSchema`, `VertexSlotSchema`, `StoredKeysSchema` (Zod), `EMPTY_STORE` constant
- `crypto.ts` — AES-256-GCM + scrypt (N=2^15, r=8, p=1, maxmem=64MiB, keyLen=32, IV=12, authTag=16). Fixed 16-byte salt = bytes of "ArtForgeSaltv1\x00\x00" per PLAN §5.5. KDF input = `${username}:${platform}:artforge-v1` passed as UTF-8 Buffer. Cached derived key on hot path. `deriveKeyFor(user, platform)` test hook for determinism assertions.
- `store.ts` — load/save `./data/keys.enc`. Atomic write via `.tmp + rename`. Zod validation on both load + save. Missing file → `EMPTY_STORE`.
- `slot-manager.ts` — pure snapshot transforms: `addGeminiSlot`, `addVertexSlot`, `activateSlot`, `removeSlot`, `listGeminiSlots`, `listVertexSlots`. First slot auto-activates. Remove falls back to next slot or `null`. Branches explicit on provider (TS can't narrow discriminated union via dynamic key here).
- `dto-mapper.ts` — `toKeySlotDto` (strips `keyEncrypted`), `toVertexSlotDto` (strips `serviceAccountPath`, adds `hasCredentials: existsSync(path)`).
- `index.ts` — barrel. Does NOT re-export `deriveKeyFor` (test-only).

### Tests
- `tests/unit/keys-crypto.test.ts` (9) — round-trip, UTF-8 safe, random IV, GCM auth-tag tamper, ciphertext body tamper, short-ciphertext guard, determinism (same/different user, same/different platform), derived key length = 32 bytes.
- `tests/unit/dto-mapper.test.ts` (4) — Rule 11: strips `keyEncrypted`, omits absent `lastUsedAt`, `hasCredentials=true` for existing file (real tmp file), `hasCredentials=false` for missing path.
- `tests/unit/shared.test.ts` extended with 2 new logger cases (total 12) per Decision 2 correction.

### Decision 2 correction (logger)
Rule 9 bans `console.log` specifically, not `console.*`. The previous routing of debug/info through `console.warn` polluted the warn channel. **New behavior:** `debug`+`info` no-op unless `LOG_LEVEL=debug` env var set (or explicit `createLogger("debug")`), then emit via `console.debug`. `warn` → `console.warn`. `error` → `console.error`. `eslint.config.js` `no-console` allow list = `["debug", "warn", "error"]`.

### Decision 4 clarification (schemas)
BOOTSTRAP Step 2 erroneously listed `src/core/schemas/workflow-inputs.ts` + `api-bodies.ts`. Correct policy (now in `memory/patterns.md`):
- `src/core/schemas/` holds only universal cross-cutting schemas: `app-profile.ts`, `replay-payload.ts`.
- Workflow input schemas → `src/workflows/<id>/input-schema.ts` (Phase 3).
- API body schemas → colocate with route: `src/server/routes/<name>.body.ts` (Phase 1 Step 6).

### QA gate result
```
lint: clean
check-loc: 31 files, 0 violations
test:unit: 47/47 pass (6 test files) — crypto suite ~442ms
```

## Completed in Session #1

### Step 1 — Toolchain files at project root
- `package.json` (pinned deps, all scripts)
- `tsconfig.json` + `tsconfig.server.json` + `tsconfig.client.json` (path aliases)
- `vite.config.ts` (port 5173, proxy `/api` → 5174)
- `vitest.config.ts` (path aliases, node env)
- `eslint.config.js` (ESLint 9 flat — per-folder `no-restricted-imports` enforcing CONTRIBUTING Rules 3/4/5)
- `tailwind.config.ts` + `postcss.config.js`
- `scripts/check-loc.ts` (Rule 7 enforcer, excludes `tokens.ts`)
- `.gitignore`, `.env.local.example`, `README.md`, `index.html`

### Step 2 — `src/core/` universal layer
- `design/` — `types.ts`, `tokens.ts` (full 50-string color table per v2.1 §9.1)
- `model-registry/` — `types.ts` (Zod AspectRatio/LanguageCode), `providers.ts`, `models.ts` (4 ModelInfo entries), `capabilities.ts` (registry w/ provenance, Imagen 4 corrected), `index.ts`
- `dto/` — `profile-dto.ts`, `asset-dto.ts`, `key-dto.ts`, `replay-payload-dto.ts`, `workflow-dto.ts`, `index.ts`
- `schemas/` — `app-profile.ts` (Zod v1 w/ appLogoAssetId), `replay-payload.ts` (nullable, language field), `index.ts`
- `compatibility/` — `types.ts`, `resolver.ts` (declarative + override + recommendedForWorkflow), `runtime-validator.ts`, `index.ts`
- `shared/` — `rand.ts` (mulberry32), `id.ts` (shortId + slugify), `logger.ts` (redactor), `errors.ts` (typed error classes), `index.ts`

### Tests written
- `tests/unit/design-tokens.test.ts`
- `tests/unit/capability-provenance.test.ts`
- `tests/unit/compatibility.test.ts`
- `tests/unit/shared.test.ts`

## Known pending items / notes

1. **`npm install` not yet run.** All scripts will fail until deps install. Not blocking — just bro's next action.
2. **Untouched: `Genart-1/`, `Genart-2/`, `Genart-3/`** at project root. Move into `vendor/genart-{1,2,3}/` when starting **Phase 2 extraction**. Already gitignored.
3. **`src/core/providers/contract.ts`** — BOOTSTRAP Step 4 deliverable; not a Step 2 item. Held for Step 4.
4. **Workflow input schemas + API body schemas** — resolved Session #2: held deliberately per Schema Location Policy (see revised Decisions section below). `src/core/schemas/` is universal-only (profile + replay-payload). Workflow inputs → `src/workflows/<id>/input-schema.ts` (Phase 3). API bodies → colocated with routes (Phase 1 Step 6).
5. **Design-tokens test:** exempt `tokens.ts` from check-loc via `EXCLUDED` set in `scripts/check-loc.ts` (87 LOC currently so no problem, but future additions could push it — the exemption is preemptive per Rule 7 exception).
6. **File count:** 25 source `.ts` files + 4 test files, all under 101 LOC. Hard cap 300 is comfortable.

## Decisions made in Session #1 — revised in Session #2

- `shortId(prefix, length=10)` helper uses `globalThis.crypto.getRandomValues` (universal, no Node-only import). Base62 charset. **[kept]**
- `mulberry32` returns a generator function; colocated `pickOne<T>(rand, items)` helper. **[kept]**
- ~~Logger uses `console.warn`/`console.error` only; debug/info emit via `console.warn` with level tag.~~ **[SUPERSEDED Session #2]**
  → Rule 9 bans `console.log` specifically, not `console.*`. Routing debug/info through `console.warn` abused the warn channel (real warnings got lost in info noise).
  **New behavior:** `debug` + `info` no-op by default; emit via `console.debug` only when `LOG_LEVEL=debug` env var set (or explicit `createLogger("debug")`). `warn` → `console.warn`. `error` → `console.error`. ESLint `no-console` allow list extended to `["debug", "warn", "error"]`.
- `resolveCompatibility` marks highest-scoring compatible models with `recommendedForWorkflow: true` (greedy best-score). **[kept]**
- `check-loc.ts` excludes `src/core/design/tokens.ts` per Rule 7 exception (data/constants table). **[kept]**
- **Schema location policy (Session #2 clarification of pending item #4):** BOOTSTRAP Step 2 listed `src/core/schemas/workflow-inputs.ts` and `api-bodies.ts` — this was spec drift. Correct policy:
  - `src/core/schemas/` contains only **cross-cutting universal schemas**: `app-profile.ts`, `replay-payload.ts`.
  - **Workflow input schemas** live at `src/workflows/<id>/input-schema.ts` per PLAN §4 folder tree (Phase 3).
  - **API body schemas** colocate with the route, e.g. `src/server/routes/<name>.body.ts` (Phase 1 Step 6).
  BOOTSTRAP.md will be corrected when we touch it; no code change needed now (files were never created).

## Issues encountered

### BUG — `.gitignore` pattern `keys/` shadowed `src/server/keys/` (Session #3)

**Symptom:** After commit `01db530` (Phase 1 Step 3+4), `git ls-files src/server/keys/` returned empty. Test files under `tests/unit/` were committed but the 6 source files (`crypto.ts`, `dto-mapper.ts`, `index.ts`, `slot-manager.ts`, `store.ts`, `types.ts`) were not. The commit was incoherent — tests asserting behavior of code absent from the tree. Fresh clone would fail `npm run regression` on Step 3.

**Root cause:** `.gitignore` line 18 had `keys/` (unanchored, single-segment pattern). Per gitignore spec, single-segment patterns with trailing slash match **any directory with that name anywhere in the tree**. The intended top-level `keys/` folder (encrypted key blobs at runtime per PLAN §4) and the implementation module at `src/server/keys/` shared the name, so the latter was silently ignored.

**Fix (commit `7eb0b6d`):**
- Anchored `keys/` → `/keys/` (only matches project-root `keys/`).
- Defensive anchoring of the other single-segment top-level patterns: `vendor/` → `/vendor/`, `Genart-1..3/` → `/Genart-1..3/`. These are explicitly top-level per PLAN §4 so anchoring is the correct semantic.
- Patterns with mid-pattern slash (`data/assets/`, `data/profile-assets/`, `.claude/settings.local.json`) are already anchored per gitignore spec — no change needed.
- `node_modules/`, `dist/`, `.vscode/`, `.idea/`, `coverage/`, `.vitest-cache/`, `.DS_Store`, `Thumbs.db`, `*.log` — **intentionally unanchored**; nested matches are desired or harmless.
- Re-added the 6 Step 3 files to git.

**Audit rule for future sessions:** when adding a gitignore entry for a directory, decide:
- **Top-level only** → prefix with `/` (e.g. `/keys/`).
- **Anywhere** → leave unprefixed (e.g. `node_modules/`).
- If the entry already has a mid-pattern slash it's auto-anchored — no prefix needed.

**Verification run (Session #3):**
- `git ls-files src/server/keys/` → 6 files tracked ✅
- `git check-ignore -v keys/sa.json` → matches `/keys/` line 18 ✅ (intent preserved)
- `git check-ignore -v src/server/keys/crypto.ts` → not ignored ✅
- Fresh clone into `D:/tmp/test-step4-clone`: `git ls-files src/server/keys/` shows 6 files, `npm install` (18s, 363 pkgs), `npm run regression` → **62/62 tests pass in 7 files** ✅
- Note: `D:/tmp/test-step4-clone` left on disk due to Windows esbuild-service file lock (`rm` returned EBUSY). Harmless; bro can delete when vitest processes release.

## Rejected / not done (intentionally)

- **No implementation code** in `src/server/`, `src/client/`, `src/workflows/` yet. Per BOOTSTRAP Steps 3-7.
- **No `src/core/shared/contract.ts` provider contract tests** — Step 4 scope.
- **No Phase 2 extraction scripts** — Phase 2 scope.
- **No `.env.local`** — only `.env.local.example` stub.

## Next session resume instructions

**Phase 1 Week 1 is DONE ✅.** Next major work is Phase 2 Extraction.

### Session #8 kickoff checklist
1. Read this file + `memory/MEMORY.md` + `memory/patterns.md` to recover state.
2. Run `npm run regression:full` — must be 120/120 green, 0 TS errors, 0 lint/LOC violations.
3. Run `npm run build` — must produce `dist/server/` + `dist/client/` clean.
4. **Manual browser smoke** — `npm run dev`, open `http://localhost:5173` in Chrome/Edge, verify:
   - Heading "Images Gen Art" + "Local artwork generation platform — Phase 1 scaffold"
   - Green "Server ok · v0.1.0 · uptime Xs" badge renders
   - Dark theme `bg-slate-950` applies
   - Devtools Network tab: `/api/health` request proxied to `:5174`, returns 200 JSON
5. Decide Phase 2 scope with bro before coding.

### Phase 2 = Extraction (next major milestone)

Per PLAN §Phase 2: move `Genart-1/`, `Genart-2/`, `Genart-3/` folders from project root → `vendor/genart-{1,2,3}/` (gitignored), then extract reusable data/assets from them into the new structure.

### Open alignment questions for Phase 2 kickoff
- **Extraction scope** — which Genart-{1,2,3} assets are worth extracting vs discarding? PLAN §Phase 2 has a list; bro confirm before scripts run.
- **Data location** — `data/templates/*.json` (per patterns.md §File location policy) for static extracted data. Any deviations?
- **Migration vs re-extract** — if an extracted asset is later improved upstream, is re-run of extraction idempotent (overwrite) or manual merge (leave extracted copy alone)?
- **Test coverage for extraction scripts** — unit-test the parsers, or acceptance-test via "extract then regression passes"?

### Phase 1 deferred items (non-blocking for Phase 2)
1. **`validator.ts` middleware** — wired in Step 6 but no caller + no unit test yet. First Phase 3 POST route (workflow-run trigger) will exercise it.
2. **`toAssetDetailDto`** — deferred from Step 5. Needs ProfileDto-mapped replay snapshot. Unblocks on Phase 3.
3. **Profile saver optimistic concurrency** — deferred to Phase 5 CMS per PLAN §6.4.
4. **Client test harness** — no `happy-dom`/`@testing-library/react` yet. Phase 5 CMS lands with real component logic; add harness then.

Predicted Session #8 length: 3-5h depending on Phase 2 scope.
