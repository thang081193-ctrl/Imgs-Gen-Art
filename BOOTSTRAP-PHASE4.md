# Images Gen Art — Phase 4 Bootstrap Checklist

**Prerequisites:** Phase 3 DONE ✅ (Session #17 close, 378/378 green, full HTTP surface + 4 workflows + client MVP + DTO tripwire). See `PHASE-STATUS.md` Phase 3 Summary.

**Goal:** Real image generation via Gemini (NB Pro + NB 2) + Vertex (Imagen 4). Key management UI. `/providers/health` wired live. Cost tracking populated. Compat warning banner in Workflow page. 11 live smoke tests (= Σ compatible provider × workflow pairs) green against real APIs.

**Estimated total time:** 25-35 focused coding hours, 7-9 sessions.

**Reference sections in PLAN-v2.2.1.md:**
- §3 Tech Stack (SDK pin versions)
- §6.1 ImageProvider interface (`health(modelId, context?)`, `generate(params)`, `HealthStatus`, `GenerateResult`)
- §6.2 Capability Registry (Imagen corrected: `supportedLanguages` 9-lang, `supportsNegativePrompt: false`)
- §7 Compatibility Matrix (11 compatible pairs — NB Pro × 4 + NB 2 × 4 + Imagen 4 × 3)
- §10 Phase 4 deliverables + QA gate

**Reference decisions:**
- DECISIONS A3 — Imagen 4 capability corrections
- DECISIONS "Rejected Suggestions" — Gemini model IDs locked (`gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`)
- Session #14 — `HealthCheckContext` contract extension (`apiKey?`, `serviceAccount?`, `skipCache?`) — already shipped, providers just implement it

---

## Step 1 — Gemini adapter (`src/server/providers/gemini.ts`) (3-4h)

**Session:** #18

**Goal:** Single adapter handles NB Pro + NB 2. Shared auth/client/error-map/extract/abort. Model ID = only call-site variance. `ImageProvider` contract suite green against mocked SDK. 2 gated live smoke tests (skipped without `GEMINI_API_KEY`).

**Deliverables:**
- [ ] `src/core/shared/errors.ts` — extend with:
  - `ProviderError` (generic adapter error, maps 502 by default; details carry `{providerId, modelId, sdkCode?}`).
  - `SafetyFilterError` (subclass — carries `{reason, prompt?}`, maps 422).
  - Extend `ErrorCode` union: `"PROVIDER_ERROR" | "SAFETY_FILTER"`.
- [ ] `src/server/providers/gemini.ts` — the adapter itself. Structure:
  - `geminiProvider: ImageProvider` singleton (matches `mockProvider` shape).
  - Module-level `clientCache: Map<string, GoogleGenAI>` keyed by plaintext API key.
  - `getClient(apiKey)` constructs + caches `new GoogleGenAI({apiKey})`.
  - `resolveApiKey(context?)` — reads `context.apiKey` first, falls back to active slot from slot-manager (decrypt via keys/crypto).
  - `health(modelId, context?)` — `models.list({config: {abortSignal}})`, normalize resource names (`models/foo` → `foo`), assert target model is present. 5 status branches: ok / auth_error / quota_exceeded / rate_limited / down.
  - `generate(params)` — Compose `GenerateContentParameters` with `config: {abortSignal, responseModalities: ["image"], seed? }`. Extract first inlineData from response. Throw `SafetyFilterError` on `promptFeedback.blockReason`, `ProviderError` on other shape violations.
  - Log adapter-init on module load (once): models + SDK version + verifiedAt.
- [ ] `src/server/providers/gemini-errors.ts` — error classification utility:
  - `mapSdkErrorToHealthStatus(err, startMs): HealthStatus` — inspects SDK error shape (HTTP status, `code`, `status` field) → one of 5 `HealthStatusCode`s.
  - `mapSdkErrorToThrown(err, context): AppError` — for generate path, wrap in `ProviderError` with sdkCode/message.
- [ ] `src/server/providers/gemini-extract.ts` — pure:
  - `extractImageFromResponse(response): {bytes: Buffer, mimeType: "image/png"|"image/jpeg"}` — Guards: promptFeedback.blockReason → SafetyFilterError; candidates[0].content.parts[].inlineData missing → ProviderError.
- [ ] `src/server/providers/registry.ts` — register `geminiProvider` alongside `mockProvider`.
- [ ] `src/server/providers/index.ts` — re-export gemini module.

**Unit tests:**
- [ ] `tests/unit/providers.gemini.test.ts` — mocked SDK via `vi.mock("@google/genai")`:
  - Error-map table: SDK error shape → HealthStatus.status (quota → "quota_exceeded", 401 → "auth_error", 429 → "rate_limited", network → "down").
  - Capability lookup: `supportedModels` returns exactly 2 entries (NB Pro + NB 2).
  - AbortSignal propagation: mocked `generateContent` asserts config.abortSignal is same ref as `params.abortSignal`.
  - Image extraction: response with inlineData → returns Buffer + mime; safety filter → throws `SafetyFilterError`; empty parts → throws `ProviderError`.
  - Client caching: two generate calls with same apiKey → one `new GoogleGenAI` call; different apiKeys → two constructions.
  - Missing target model in `models.list` → health status "down" with descriptive message.
- [ ] `tests/unit/providers.gemini.test.ts` also runs `runProviderContract("gemini", factory, {validModelId: MODEL_IDS.GEMINI_NB_2})` against the mocked-SDK adapter.

**Live smoke tests (gated):**
- [ ] `tests/live/providers.gemini-live.test.ts` — `describe.skipIf(!process.env.GEMINI_API_KEY)`:
  - 1×1 PNG generate against NB Pro (timeout 30s, cost ≈ $0.13).
  - 1×1 PNG generate against NB 2 (timeout 15s, cost ≈ $0.07).
  - `health()` returns "ok" against both models.
  - `AbortSignal` pre-abort raises; mid-flight abort inside first 2s stops the call.

**Registry integration test:**
- [ ] `tests/integration/providers-routes.test.ts` — extend: `GET /api/providers` list now contains `gemini` alongside `mock` + `vertex`(placeholder ok). `getProvider("gemini").supportedModels` includes both NB Pro + NB 2 IDs.

**Live smoke test runner:**
- [ ] `package.json` — add `"test:live": "vitest run tests/live"` script. NOT included in `regression:full` default (skipped without env anyway).

**QA gate:**
```bash
npm run lint                                 # clean (no SDK leakage outside src/server)
npm run typecheck                            # 0 errors
npm run test:unit -- providers.gemini        # all green (mocked SDK)
npm run regression:full                      # 378 prior + new unit tests green
# with GEMINI_API_KEY env:
GEMINI_API_KEY=xxx npm run test:live         # 2 real PNG generations + 2 health probes green
```

---

## Step 2 — Vertex Imagen adapter (`src/server/providers/vertex-imagen.ts`) (4-5h)

**Session:** #19

**Goal:** Imagen 4 via `@google-cloud/vertexai` 1.10.0. Supports deterministic seed + `addWatermark: false` opt-out (required for `replayClass === "deterministic"` per Session #15). Language translation via `?language=` param (§6.2 lists 9 supported langs).

**Deliverables:**
- [ ] `src/server/providers/vertex-imagen.ts` — uses `VertexAI` + `serviceAccount` context. Loads SA JSON from `keys/vertex-{slotId}.json` via existing `src/server/keys/` helpers.
- [ ] `src/server/providers/vertex-errors.ts` — SA file not found / 401 / region errors → HealthStatus map.
- [ ] Register in `providers/registry.ts`.
- [ ] Unit tests `tests/unit/providers.vertex.test.ts` — mocked SDK + contract.
- [ ] Gated live smokes `tests/live/providers.vertex-live.test.ts` — requires `VERTEX_SERVICE_ACCOUNT_PATH` + `VERTEX_PROJECT_ID` env.
- [ ] **Deterministic seed E2E:** two calls with same seed + `addWatermark:false` + same prompt → byte-identical output (or near-identical within Imagen's determinism guarantees per Vertex docs).

**QA gate:**
```bash
npm run test:unit -- providers.vertex        # green
VERTEX_SERVICE_ACCOUNT_PATH=... npm run test:live  # 1 Imagen generate + 1 deterministic seed check
```

---

## Step 3 — Key management UI (2-3h)

**Session:** #20

**Goal:** Client UI creates/activates/deletes API keys without touching disk. Replaces existing `slot-manager.addSlot` direct-test-setup pattern.

**Deliverables:**
- [ ] `src/client/pages/Settings.tsx` — new page mounted at `page="settings"` in the `Page` union router. Top-nav gains "Settings" link.
- [ ] `src/client/components/KeySlotDropdown.tsx` — per-provider (`gemini` / `vertex`) dropdown showing slots, active indicator, add/activate/delete actions.
- [ ] `src/client/components/KeyAddModal.tsx` — modal form. Gemini: `{label, key}` (text input, masked display). Vertex: `{label, projectId, location, file}` (multipart upload).
- [ ] `src/client/api/hooks.ts` — add `useKeys()` + `useKeyMutation()` wrapping existing `/api/keys` routes.

**QA gate:** manual browser smoke — add Gemini key → activate → test button → 200 "ok" → delete → slot empty.

---

## Step 4 — `/api/providers/health` live wiring + health-result caching (2-3h)

**Session:** #21

**Goal:** Canonical model-level health endpoint returns real `HealthStatus` for each (provider, model) pair. Default batch mode: `{[providerId]: {[modelId]: status}}`. Filter mode: `?provider=X&model=Y` → flat response.

**Deliverables:**
- [ ] Extend `src/server/routes/providers.ts` `GET /providers/health`:
  - Iterate all (provider, model) pairs via registry; for each, call `provider.health(modelId)` (uses provider's active-slot credentials, no `context`).
  - Health-result cache (in-memory, 60s TTL per pair) avoids re-probing on every UI poll. Invalidate on key-slot change via event hook.
  - Query filters `?provider=X&model=Y` → single flat `HealthStatus` response.
- [ ] `src/server/providers/health-cache.ts` — new module, simple `Map<string, {status, expiresAt}>`.
- [ ] Integration test `tests/integration/providers-health.test.ts` — mocked providers return known status → endpoint aggregates correctly. Cache hit on second call.

**QA gate:** `curl 127.0.0.1:5174/api/providers/health` returns matrix; `?provider=gemini&model=gemini-3.1-flash-image-preview` returns single.

---

## Step 5 — Cost tracking per asset + batch (1-2h)

**Session:** #22 (or bundled with #21)

**Goal:** Each persisted asset records its `costUsd` from `ModelInfo.costPerImageUsd`. Batch-level aggregate in `batch` table. Gallery card shows per-asset cost.

**Deliverables:**
- [ ] Migration `scripts/migrations/XXX-add-cost-columns.sql` — `ALTER TABLE assets ADD COLUMN cost_usd REAL DEFAULT 0`; `ALTER TABLE batches ADD COLUMN total_cost_usd REAL DEFAULT 0`.
- [ ] `AssetDto.costUsd: number` + `AssetInternal.costUsd` + `rowToAsset` map.
- [ ] Workflow `run.ts` asset-writers (all 4 workflows) stamp `costUsd = getModel(modelId).costPerImageUsd` on each insert.
- [ ] Batch completion hook aggregates `SUM(cost_usd)` into `batches.total_cost_usd`.
- [ ] Client Gallery `AssetThumbnail.tsx` + detail modal — render `${cost.toFixed(3)}` footer.
- [ ] Integration test — run artwork-batch × 2 via Mock ($0 cost) + simulated Gemini cost via mocked adapter → batch total matches sum.

**QA gate:** regression green; DB migration clean; Gallery renders cost.

---

## Step 6 — Compatibility warning banner (1-2h)

**Session:** #23

**Goal:** Workflow page warns when user selects an INCOMPATIBLE provider:model (grey-out is not enough — explicit banner explains why).

**Deliverables:**
- [ ] `src/client/components/CompatibilityBanner.tsx` — takes `(workflowId, providerId, modelId)` props, queries `/api/providers/compatibility` matrix via `useCompatibility()` hook. Renders yellow/red banner with `reason` field from `CompatibilityOverride`.
- [ ] Wire into `src/client/pages/Workflow.tsx` above the input form.
- [ ] Disable Run button when incompatible (existing dispatcher precondition #4 would 409 anyway — but UX sharper with client-side block).

**QA gate:** manual browser smoke — pick style-transform + Imagen 4 → banner shows "Imagen 4 lacks supportsImageEditing"; Run button disabled.

---

## Step 7 — 11 live smoke tests (= Σ compatible pairs) (2-3h)

**Session:** #24

**Goal:** Every compatible (workflow, provider, model) combination has a gated live smoke that generates 1 asset. Exercises real SDK paths end-to-end. Catches regressions on SDK version bump.

**Matrix (11 pairs per PLAN §7):**
| Workflow | NB Pro | NB 2 | Imagen 4 |
|---|---|---|---|
| artwork-batch | ✅ | ✅ | ✅ |
| ad-production | ✅ | ✅ | ✅ |
| style-transform | ✅ | ✅ | ❌ |
| aso-screenshots | ✅ | ✅ | ✅ |

= 4 + 4 + 3 = 11.

**Deliverables:**
- [ ] `tests/live/workflows-smoke.test.ts` — 11 parameterized tests, each does POST `/api/workflows/:id/run` end-to-end with 1-concept / 1-variant input + the target provider:model. Asserts batch completes + at least 1 asset written + file exists.
- [ ] Budget: 11 × ~$0.10 avg = ~$1.10/run. **Never** run in CI on every commit — manual `npm run test:live:smoke-11` only.

**QA gate:** bro runs the 11 smokes with real keys; all green.

---

## Step 8 — Phase 4 close + PHASE-STATUS (1-2h)

**Session:** #25

**Deliverables:**
- [ ] Full `npm run regression:full` green (378 + ~30-50 new = ~410+).
- [ ] `tests/live/**` green against bro's real keys — 2 Gemini + 1 Vertex + 11 workflow smokes = 14 live tests budget ≈ $2.
- [ ] `PHASE-STATUS.md` — append Phase 4 summary (per-step decisions, deviations, tests added, known-pending → Phase 5).
- [ ] Manual browser E2E — run each of 4 workflows × 2 real providers in browser, cancel mid-flight, verify Gallery shows real PNGs (not solid-color Mock output).

---

## What's NOT in Phase 4 (defer to later phases)

- **Replay UI / PromptLab** — Phase 5.
- **Profile CMS rich editor** — Phase 5.
- **Gallery tag filter** — Phase 5.
- **Gallery total count** — trivial add; could ship in Step 5 if cheap.
- **DB auto-VACUUM + archive tool** — Post-v1 per DECISIONS C2.
- **Per-workflow Concept metadata in Gallery** — Phase 5 replayPayload enrichment.
- **Streaming batch generation** — Phase 4 calls `generate()` synchronously per asset (SSE streams at the batch level, not the provider level).

---

## Anti-patterns specific to Phase 4 (CONTRIBUTING.md re-check)

- **Rule 4 — SDK imports LOCKED to `src/server/providers/*`.** The SDK import in `gemini.ts` / `vertex-imagen.ts` is the ONLY legal site. ESLint already enforces.
- **Rule 9 — No `console.log`.** Adapters log via `createLogger()`. API keys + SA JSON fields redacted by logger's built-in patterns (`AIza***`, `ya29.***`, `eyJ***`). Never log `apiKey` plaintext.
- **Rule 11 — No paths in API responses.** `keys.ts` route already maps via DTO; new `health` endpoint returns pure `HealthStatus` (no paths). `cost_usd` is a number, safe.
- **Rule 7 — 300 LOC cap.** `gemini.ts` must split helpers into `gemini-errors.ts` + `gemini-extract.ts` if it approaches 250. Same for vertex.
- **Health cache invalidation:** whenever a key slot activates/deactivates/rotates, the health-cache entry for that provider:model MUST be invalidated. Step 4 wires a hook.

---

## Step order policy

**Follow the order.** Step 1 (Gemini) before Step 2 (Vertex) because error-map + client-cache patterns established in Step 1 are reused. Step 3 (Keys UI) needs the adapters as backend truth. Step 4 (health endpoint) needs both adapters. Steps 5-6 can parallelize after Step 4. Step 7 (11-smoke) needs everything above.

Never skip Step 1: Gemini adapter patterns (error map, clientCache, extract helper, gated-live-test scaffold) are the template for Step 2.

---

*If a step is blocked (SDK shape surprise, API change, budget overrun), update `PHASE-STATUS.md` with blocker + context then ask bro before inventing a workaround.*
