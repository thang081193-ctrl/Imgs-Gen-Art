# Images Gen Art — Phase 3 Bootstrap Checklist

**Prerequisites:** Phase 1 DONE ✅ (120/120 tests, 7 steps, see PHASE-STATUS), Phase 2 DONE ✅ (163/163 tests, 6 templates extracted), `data/templates/*.json` committed or re-runnable via `npm run extract:all`.

**Goal:** 4 workflows dispatching via real SSE with MockProvider. All 8 API routes live (no more `NOT_IMPLEMENTED` stubs). Client Workflow page triggers run + streams events. Gallery lists + filters assets. Abort flow works end-to-end.

**Estimated total time:** 20-30 focused coding hours, 5-8 sessions.

**Reference sections in PLAN-v2.2.1.md:**
- §4 Project Structure (folder tree)
- §6.3 Workflow Contract (types)
- §6.4 Public API Spec (endpoint signatures)
- §7.2 Runtime Validator (precondition #5, #6)
- §9.1 Design Tokens (color variants per workflow)

---

## Step 1 — Templates Loader + Cache (2-3h)

**Goal:** Server can synchronously read any of the 6 extracted JSON files, Zod-validated, cached in-process. Fail-fast on missing file or shape drift.

**Deliverables:**
- [ ] `src/server/templates/loader.ts`
  - `loadTemplate<T>(name: TemplateName, schema: ZodType<T>): T` — reads `data/templates/{name}.json`, Zod-parses, throws `ExtractionError` on I/O failure or schema drift. Synchronous (boot-time only; not hot path).
  - `TemplateName` = `"artwork-groups" | "ad-layouts" | "country-profiles" | "style-dna" | "i18n" | "copy-templates"`.
- [ ] `src/server/templates/cache.ts`
  - `getArtworkGroups(): ArtworkGroupsFile` + 5 sibling getters. Lazy-load on first call, memoize module-level. No TTL (file is git-committed, rebuild = new boot).
  - `preloadAllTemplates(): void` — eager-loads all 6 at server boot (fail-fast if any corrupted before accepting traffic).
- [ ] `src/server/templates/index.ts` — barrel re-exporting the 6 getters.
- [ ] Wire `preloadAllTemplates()` into `src/server/index.ts` boot sequence (after `openAssetDatabase`, before `serve`).

**Unit tests:**
- [ ] `tests/unit/templates-loader.test.ts` — happy path load all 6 + cache hit on second call (same object reference) + missing file throws ExtractionError + corrupted JSON throws + schema-drift throws. **No HTTP.**

**QA gate:**
```bash
npm run test:unit -- templates-loader   # green
npm run typecheck                       # 0 errors
```

---

## Step 2 — Workflow Types + Dispatcher Core (3-4h)

**Goal:** Orchestration layer ready. Pure AsyncGenerator-based dispatch works in tests without any HTTP. Abort registry tracks in-flight batches by `batchId` for cancel flow.

**Deliverables:**
- [ ] `src/workflows/types.ts` — per PLAN §6.3 verbatim:
  - `WorkflowDefinition`, `WorkflowRunParams`, `WorkflowEvent` (6 variants), `Concept`, `WorkflowRequirement`, `CompatibilityOverride`, `CompatibilityResult`, `CompatibilityMatrix`.
  - `ALL_WORKFLOWS` registry array (empty for now; Step 3+7 populate).
- [ ] `src/workflows/index.ts` — barrel + `getWorkflow(id): WorkflowDefinition` lookup + `NotFoundError` on unknown id.
- [ ] `src/server/workflows-runtime/precondition-check.ts`
  - `async checkPreconditions(params): Promise<void>` — throws typed errors for each fail-fast case (PLAN §6.4 preconditions 1-8):
    1. Workflow exists — `NotFoundError`
    2. Profile exists — `NotFoundError`
    3. Provider has active key slot — `NoActiveKeyError`
    4. Compatibility matrix pass — `IncompatibleWorkflowProviderError`
    5. `aspectRatio` ∈ `model.supportedAspectRatios` — `RuntimeValidationError`
    6. `language` check if workflow requires — `RuntimeValidationError`
    7. `workflow.inputSchema.parse(input)` — Zod throws (`ZodError` → 400 by middleware)
    8. input must NOT contain `aspectRatio` or `language` keys — `BadRequestError`
- [ ] `src/server/workflows-runtime/abort-registry.ts`
  - `registerBatch(batchId, controller: AbortController): void`
  - `abortBatch(batchId): boolean` — returns false if unknown / already aborted.
  - `deregisterBatch(batchId): void` — called on workflow completion/abort to free controller.
  - Module-level `Map<string, AbortController>`; no persistence (in-flight batches are server-process scoped).
- [ ] `src/server/workflows-runtime/dispatcher.ts`
  - `async *dispatch(params, batchId: string): AsyncGenerator<WorkflowEvent>` —
    1. Calls `checkPreconditions(params)` first (throws before emitting).
    2. Registers `AbortController` in registry under `batchId`.
    3. Delegates to `workflow.run(params)`, forwards each event.
    4. On abort signal, emits `{ type: "aborted", batchId, completedCount, totalCount }` then stops.
    5. On completion, emits final event and deregisters.
  - Pure AsyncGenerator — no SSE writing here (route layer handles framing in Step 4).

**Unit tests:**
- [ ] `tests/unit/workflows-precondition.test.ts` — each of 8 precondition branches (happy + throwing paths) using stub workflow + Mock provider.

**QA gate:**
```bash
npm run test:unit -- workflows-precondition   # green
npm run typecheck                             # 0 errors
npm run check-loc                             # no violations
```

---

## Step 3 — First Workflow: `artwork-batch` (3-4h)

**Goal:** End-to-end workflow with Mock provider works at the AsyncGenerator level. Deterministic output for a fixed seed. Uses `artwork-groups` templates.

**Deliverables:**
- [ ] `src/workflows/artwork-batch/input-schema.ts` — Zod schema. Fields: `group: ArtworkGroupKey` (constrained to 8 categories), `subjectDescription: string.min(1)`, `variantsPerConcept: number.int().min(1).max(8)`, `seed?: number`. **MUST NOT** declare `aspectRatio` / `language` (enforced in tests).
- [ ] `src/workflows/artwork-batch/concept-generator.ts` — pure fn `generateConcepts(params, random): Concept[]` — reads artwork-groups template, picks N concepts deterministically from seed. No provider calls.
- [ ] `src/workflows/artwork-batch/prompt-builder.ts` — pure fn `buildPrompt(concept, profile, locale): string`. Testable in isolation.
- [ ] `src/workflows/artwork-batch/run.ts`
  - `async *run(params): AsyncGenerator<WorkflowEvent>` —
    1. Emit `{ type: "started", batchId, total }`.
    2. Call `generateConcepts` → emit `concept_generated` per concept.
    3. For each concept × variantsPerConcept: call `provider.generate()` with abort, write file to `data/assets/`, insert into `assets` repo, emit `image_generated` with `AssetDto`.
    4. On error per item: emit `{ type: "error", index, context }` and continue (batch doesn't halt).
    5. On `params.abortSignal.aborted`: emit `aborted` and stop iteration.
    6. Emit final `{ type: "complete", assets, batchId }`.
- [ ] `src/workflows/artwork-batch/index.ts`
  - `export const artworkBatchWorkflow: WorkflowDefinition = { id: "artwork-batch", colorVariant: "violet", ... }`.
  - Register in `src/workflows/index.ts` `ALL_WORKFLOWS`.
- [ ] Batch repo extension — add `createBatch`, `updateBatchStatus(batchId, "complete"|"aborted")` to `src/server/asset-store/batch-repo.ts`.

**Unit tests:**
- [ ] `tests/unit/workflow-artwork-batch.test.ts` — 
  - concept-generator deterministic for seed 42 (same output both runs)
  - prompt-builder output for fixed profile/concept matches snapshot
  - `run()` with Mock provider emits `started → concept_generated × N → image_generated × N → complete` in correct order for N=2
  - `run()` respects pre-aborted signal (emits `aborted`, no `complete`)
  - `run()` respects mid-flight abort (stops between iterations)
  - inputSchema rejects `aspectRatio` / `language` keys

**QA gate:**
```bash
npm run test:unit -- workflow-artwork-batch   # green
```

---

## Step 4 — `workflow-runs` Route + SSE Streaming + Cancel (2-3h)

**Goal:** HTTP layer wraps the dispatcher. `POST /api/workflows/:id/run` streams SSE events. `DELETE /api/workflows/runs/:batchId` cancels in-flight. Client consumes via existing `use-sse.ts`.

**Deliverables:**
- [ ] `src/server/routes/workflows.ts` (replaces stub for `workflows` domain):
  - `GET /api/workflows` — returns `ALL_WORKFLOWS.map(w => ({ id, displayName, description, requirement, colorVariant, inputSchema: zodToJsonSchema(w.inputSchema) }))`. Uses `zod-to-json-schema` OR hand-crafted fallback (no new dep if possible — re-use Zod's `._def` shape inspection or ship JSON shape manually per workflow).
  - `POST /api/workflows/:id/run`:
    1. Validate body (profileId, input, providerId, modelId, aspectRatio, language?).
    2. Load profile via repo.
    3. Generate `batchId` via `shortId("batch_", 10)`.
    4. Create `AbortController`, wire to `dispatcher.dispatch()`.
    5. Use `streamSSE` from `hono/streaming`; iterate `AsyncGenerator`, `stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) })`.
    6. On upstream disconnect (`c.req.raw.signal.aborted`), call `abortBatch(batchId)`.
- [ ] `src/server/routes/workflow-runs.ts` (replaces stub for `workflow-runs` domain):
  - `DELETE /api/workflows/runs/:batchId` — calls `abortBatch(batchId)`. 204 if found, 404 if unknown/done.
  - (Resume NOT supported per PLAN — respond 501 with `Resume: not-supported` header.)
- [ ] `src/server/routes/stubs.ts` — remove `workflows` + `workflow-runs` from `STUB_DOMAINS`; adjust stub test counts.
- [ ] Wire both routes in `src/server/app.ts`.

**Integration tests (minimal — full sweep in Step 9):**
- [ ] Smoke: `POST /api/workflows/artwork-batch/run` with valid body → first event is `started` with `batchId`, SSE content-type is `text/event-stream`.

**QA gate:**
```bash
npm run test:integration -- workflows         # smoke green
npm run dev:server                            # boots
curl -N -X POST 127.0.0.1:5174/api/workflows/artwork-batch/run \
  -H "Content-Type: application/json" -d '{...}' | head -20
# stream closes after complete event
```

---

## Step 5 — Profiles + Templates + Providers Routes (3-4h)

**Goal:** Read-heavy routes live. Client Workflow page can list profiles, pick provider/model with compatibility warnings, fetch templates if needed.

**Deliverables:**
- [ ] `src/server/routes/profiles.ts` (replaces stub):
  - `GET /api/profiles` — `profileRepo.list()` → `toProfileSummaryDto` map → `{ profiles: [...] }`.
  - `GET /api/profiles/:id` — load + `toProfileDto`. 404 if missing.
  - `POST /api/profiles` — body `ProfileCreateInput` (Zod validated), generates id via `slugify(name)`, saves with `version: 1, updatedAt: now`.
  - `PUT /api/profiles/:id` — body `{ expectedVersion, ...ProfileUpdateInput }`. Load, compare version, save with `version: N+1` OR throw `VersionConflictError` (409).
  - `DELETE /api/profiles/:id` — unlink `data/profiles/{id}.json`. 204.
  - `POST /api/profiles/:id/upload-asset` (multipart) — **defer to Step 6** (profile-assets route handles actual asset write; this endpoint just registers).
  - `GET /api/profiles/:id/export` — stream JSON. `POST /api/profiles/import` — accept JSON body, validate, persist.
- [ ] `src/server/routes/profiles.body.ts` — colocated Zod schemas for `ProfileCreateInput`, `ProfileUpdateInput`, `ProfilePutInput` (with `expectedVersion`).
- [ ] `src/server/routes/templates.ts` (replaces stub):
  - `GET /api/templates/artwork-groups` → `getArtworkGroups()`.
  - 5 more getters: ad-layouts, country-profiles, style-dna, i18n, copy-templates (URL: `GET /api/templates/copy`).
  - All read-only; no POST/PUT/DELETE (404 on those).
- [ ] `src/server/routes/providers.ts` — extend existing (`/api/providers` from Phase 1 is working):
  - `GET /api/providers/compatibility` — compute `resolveCompatibility(ALL_WORKFLOWS, ALL_MODELS)` matrix, return by `workflowId → providerId:modelId`.
  - `GET /api/providers/health` — Phase 3 scope: returns stubbed `{ status: "unknown" }` per (provider, model) if Mock (real providers wire in Phase 4). Supports `?provider=` + `?model=` query filters.

**Unit tests:** none new (Zod validation covered in Step 9 integration).

**QA gate:**
```bash
npm run test:integration                      # existing green after stubs reduce
curl 127.0.0.1:5174/api/profiles              # list returns 3 seeded
curl 127.0.0.1:5174/api/templates/i18n        # 11 langs JSON
curl 127.0.0.1:5174/api/providers/compatibility # matrix
```

---

## Step 6 — Keys + Assets + Profile-Assets Routes (3-4h)

**Goal:** Key management CRUD. Asset list/filter/file-serve works. Profile-asset upload via multipart works. Gallery page will consume these.

**Deliverables:**
- [ ] `src/server/routes/keys.ts` (replaces stub):
  - `GET /api/keys` — returns `{ gemini: { activeSlotId, slots: toKeySlotDto[] }, vertex: {...} }`. Strips `keyEncrypted` + `serviceAccountPath` via DTO mapper.
  - `POST /api/keys` — body discriminated on `provider`. Gemini: `{ provider, label, key }` → `addGeminiSlot`. Vertex: multipart with `projectId, location, serviceAccountFile` → stream file to `keys/vertex-{slotId}.json`, call `addVertexSlot`. Response `{ slotId }`.
  - `POST /api/keys/:id/activate` — `activateSlot`. Response `{ activated: true }`.
  - `DELETE /api/keys/:id` — `removeSlot`. 204. (Vertex slot delete also removes `keys/vertex-{id}.json` file.)
  - `POST /api/keys/:id/test` — calls `provider.health()` via registry. Response `{ status, latencyMs, message? }`.
- [ ] `src/server/routes/assets.ts` (replaces stub):
  - `GET /api/assets` — query parse (`profileId?, workflowId?, tags?, dateFrom?, dateTo?, batchId?, limit=50, offset=0`), call `assetRepo.list(filter)` + `toAssetDto` map, return `{ assets, total }`.
  - `GET /api/assets/:id` — load + DTO map. Optional `?include=replayPayload` attaches `ReplayPayloadDto` (computed from stored `replay_payload`; use `toAssetDetailDto` implementation deferred from Phase 1 Step 5 per PHASE-STATUS note).
  - `GET /api/assets/:id/file` — stream file from `data/assets/{id}.png`. Content-Type from DB row. 404 if file missing on disk (log integrity warning).
  - `DELETE /api/assets/:id` — remove DB row + unlink file. 204.
  - `POST /api/assets/:id/replay` — **Phase 5 scope, return 501 with Link header to `#phase-5`.**
- [ ] `src/server/routes/profile-assets.ts` (replaces stub):
  - `GET /api/profile-assets/:assetId/file` — same streaming pattern.
  - `DELETE /api/profile-assets/:assetId` — unlink + DB delete.
  - `POST /api/profiles/:id/upload-asset` **lives HERE** (multipart handler) — writes `data/profile-assets/{assetId}.{ext}`, inserts `profile_assets` row, updates profile's `appLogoAssetId` / `storeBadgeAssetId` / `screenshotAssetIds` field depending on `kind`, returns `{ assetId }`.
- [ ] Lightweight multipart helper — `src/server/shared/multipart.ts` — uses `c.req.parseBody()` from Hono (no new dep). Validates file size ≤ 10MB + MIME in allowlist.
- [ ] `profile-assets-repo.ts` — new file `src/server/asset-store/profile-assets-repo.ts` with `insert / findById / list / delete`. Follows `asset-repo.ts` pattern.

**Unit tests:**
- [ ] `tests/unit/profile-assets-repo.test.ts` — round-trip + file naming + list by profile.

**QA gate:**
```bash
npm run test:unit -- profile-assets-repo      # green
curl 127.0.0.1:5174/api/keys                  # empty slots initially
curl 127.0.0.1:5174/api/assets                # empty list initially
# After running artwork-batch once from Step 3:
curl 127.0.0.1:5174/api/assets                # returns assets generated
```

---

## Step 7 — Remaining 3 Workflows (3-4h)

**Goal:** `ad-production`, `style-transform`, `aso-screenshots` implemented to the same shape as `artwork-batch`. All consume Phase 2 templates.

**Deliverables:**

- [ ] `src/workflows/ad-production/` (4 files: `input-schema`, `prompt-builder`, `run`, `index`). Uses `ad-layouts` + `country-profiles` templates. Color variant: `blue`. Input: `{ layoutId, targetCountry, productDescription }`. Emits per-layout ad-variant assets.

- [ ] `src/workflows/style-transform/` (4 files). Uses `style-dna` + `artwork-groups` templates. Color variant: `pink`. Input: `{ styleKey: ArtStyleKey, sourceImageAssetId, variantsPerStyle }`. Reads source image from `profile-assets/` or `assets/`, generates style-transformed variants.

- [ ] `src/workflows/aso-screenshots/` (4 files). Uses `copy-templates` + `i18n`. Color variant: `emerald`. Input: `{ targetLangs: CopyLang[], screenCount }`. Emits i18n'd screenshot mockup assets.

- [ ] Register all 3 in `src/workflows/index.ts` `ALL_WORKFLOWS`.

**Unit tests:** one per workflow, mirror `artwork-batch` test pattern (deterministic seed + event order + abort handling). Aim for 4-5 tests per workflow.

**QA gate:**
```bash
npm run test:unit -- workflow-           # all 4 workflow suites green
npm run test:unit -- workflow-input-schema  # all 4 reject aspect/language keys
```

---

## Step 8 — Client Workflow Page + Gallery + SSE Hook Wire (3-4h)

**Goal:** Browser UI can drive all 4 workflows end-to-end against running server. Gallery lists all generated assets with filters.

**Deliverables:**

### Workflow page
- [ ] `src/client/pages/Workflow.tsx` — state machine: `idle → selectingWorkflow → editingInput → dispatching → streaming → done|error|aborted`. Composition:
  - `WorkflowPicker` (4 cards, colorVariant themed).
  - `ProfileSelector` dropdown + `ProviderModelSelector` with compat warnings from `/api/providers/compatibility`.
  - `AspectRatioRadio` + `LanguageDropdown` (top-level).
  - Workflow-specific input form rendered from `inputSchema` JSON schema (hand-coded per-workflow forms acceptable; no generic JSON-Schema renderer).
  - `Run` button triggers `POST /:id/run`; stream consumed via `useSSE`.
  - `EventLog` displays streamed events live; `CancelButton` fires `DELETE /workflows/runs/:batchId`.
- [ ] `src/client/components/` — `WorkflowPicker.tsx`, `ProviderModelSelector.tsx`, `EventLog.tsx`, `AssetThumbnail.tsx`, `FilterBar.tsx`.

### Gallery page
- [ ] `src/client/pages/Gallery.tsx` — lists assets. Filters: profile dropdown, workflow dropdown, tags (multi-select chips), date range, batch_id search. Pagination (50/page, numeric pager). Thumbnail grid 4-col desktop / 2-col mobile. Click thumbnail → detail modal with full AssetDto metadata + download button. NO replay/PromptLab (Phase 5).
- [ ] `src/client/api/hooks.ts` — extend with `useProfiles()`, `useWorkflows()`, `useProviders()`, `useCompatibility()`, `useAssets(filter)` — all typed against DTOs.

### Router extension
- [ ] `src/client/App.tsx` — extend `Page` union: `"home" | "workflow" | "gallery"`. Simple top-nav with 3 links.

### SSE hook wire
- [ ] Confirm `src/client/utils/use-sse.ts` (Phase 1) works with Workflow page flow. No changes expected; if bugs surface, patch here.

**Manual smoke (dev):**
- [ ] `npm run dev` → http://localhost:5173 → navigate Home → Workflow → pick artwork-batch → pick chartlens profile → mock provider → run → see events stream → Gallery shows generated assets → cancel mid-run works.

**QA gate:**
```bash
npm run typecheck:client                      # 0 errors
npm run build                                 # vite bundle clean
# Manual browser smoke as above
```

---

## Step 9 — Phase Close: DTO Audit + Full Integration + PHASE-STATUS (2-3h)

**Goal:** Full regression passes. DTO-no-paths audit covers all routes. 4 workflows + cancel verified via integration tests. PHASE-STATUS documents Phase 3.

**Deliverables:**

### Integration tests (comprehensive)
- [ ] `tests/integration/dto-no-paths.test.ts` — walks every GET/POST route, asserts response JSON body does NOT contain banned keys (`file_path`, `filePath`, `service_account_path`, `serviceAccountPath`, `key_encrypted`, `keyEncrypted`, `app_logo_path`). Re-uses the recursive scanner from dto-filter middleware. Explicit route list (hand-maintained — adding a route requires adding a test row).
- [ ] `tests/integration/workflows-full.test.ts` — one test per workflow: POST `/api/workflows/:id/run` with valid body, consume SSE stream to completion, assert event type sequence matches expected (`started → ... → complete`), assert assets persisted to DB + files on disk.
- [ ] `tests/integration/workflows-cancel.test.ts` — start `artwork-batch` with 10 variants, DELETE `/workflows/runs/:batchId` at 100ms mark, assert stream ends with `aborted` event, `batch.status === "aborted"`, partial assets remain in DB, `/api/health` still responsive (no hung handler — mirrors Phase 1 SSE abort test shape).
- [ ] `tests/integration/profiles-crud.test.ts` — create → read → update with correct expectedVersion → update with stale expectedVersion (expect 409 VERSION_CONFLICT) → delete → 404.
- [ ] `tests/integration/keys-crud.test.ts` — add gemini slot → activate → test → remove. Add vertex slot with stub service-account JSON → read → remove (file cleanup verified).

### Manual browser E2E
- [ ] Run each of 4 workflows to completion in the browser.
- [ ] Cancel one mid-batch; verify partial assets visible in Gallery + batch status is aborted.
- [ ] Create new profile via CMS (if built) OR verify seed profiles visible in dropdown.
- [ ] Upload a logo to a profile → see it serve at `/api/profile-assets/:id/file`.

### PHASE-STATUS update
- [ ] Mark Phase 3 DONE.
- [ ] Document per-step decisions + deviations (following Session #8/#9 format).
- [ ] List Phase 4 entry-point (real providers: Gemini + Vertex adapters).

### Final QA gate
```bash
npm run regression:full
# Expected: lint clean, typecheck 0 errors, check-loc 0 violations,
# ~ 250-300 tests passing (163 prior + ~80-130 new), build green.
# Manual browser smoke: all 4 workflows + cancel verified.
```

---

## What's NOT in Phase 3 (defer to later phases)

- **Real provider SDK calls** (Gemini NB Pro / NB 2 / Vertex Imagen) → Phase 4.
- **CMS full edit UI** for profiles (Phase 3 has read + basic create/update but no rich WYSIWYG; Gallery is read-only) → Phase 5 polish.
- **Asset replay / PromptLab / DiffViewer** → Phase 5 (`POST /api/assets/:id/replay` returns 501 in Phase 3).
- **Cost tracking** surfaces in Gallery but is always `0` under Mock (Phase 4 populates real cost).
- **Key UI** — Phase 3 ships `/api/keys/*` endpoints; client UI to manage them lands Phase 4 when real providers arrive.
- **Import/export UI** — endpoints live, UI buttons deferred.
- **Diagnostics dashboard** — `GET /api/debug/stats` + `active-batches` endpoints optional in Phase 3; decide per-session based on budget.

---

## Anti-patterns specific to Phase 3 (CONTRIBUTING.md re-check)

- **Rule 4 — No SDK imports outside `src/server/**`.** Workflows import `ImageProvider` type from `@/core/providers/types`, NOT a concrete `gemini.ts` (doesn't exist yet anyway).
- **Rule 11 — No paths in API responses.** Every new route added in Steps 4-6 MUST go through a DTO mapper. Step 9 dto-no-paths.test.ts is the tripwire.
- **Rule 15 — No orchestration in route handlers.** `POST /workflows/:id/run` just calls `dispatcher.dispatch()`; precondition logic + abort wiring stay in `workflows-runtime/`. If a route handler exceeds 30 lines of logic, refactor.
- **Rule 9 — No `console.log`.** SSE route handler has a lot of logging temptation; use the redactor-safe logger.
- **Rule 7 — 300 LOC hard cap.** Workflow `run.ts` files might push this; split into `run.ts` + `run-step.ts` if variants-per-concept loop gets complex.
- **Workflow input-schema rule (PLAN §6.3):** inputSchema MUST NOT declare `aspectRatio` / `language`. `tests/unit/workflow-input-schema.test.ts` (Step 7) sweeps all registered workflows.

---

## Step order policy

**Follow the order.** Don't skip ahead. Each step's QA gate must pass before the next step starts.

Exceptions — OK to parallelize within a session:
- Steps 5 + 6 routes could land in parallel if 2 contributors (solo = do sequential).
- Step 7 — the 3 workflows are independent; after first one is scaffolded, the other 2 can be drafted in any order.

Never skip: Step 1 (templates loader) blocks everything downstream; Step 2 (dispatcher) blocks Step 3+; Step 4 (SSE route) blocks Step 8 client work.

---

*If a step is blocked, update `PHASE-STATUS.md` with blocker + context then ask bro before inventing a workaround.*
