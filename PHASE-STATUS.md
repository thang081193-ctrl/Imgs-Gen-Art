# PHASE-STATUS — Images Gen Art

Current phase: **Phase 1, Week 1 — Foundation — COMPLETE ✅**
Last updated: 2026-04-21 (Session #7, Opus 4.7 — Step 6 + Step 7 complete, 120/120 tests + vite build + dev smoke green)

## Summary

| Step | Title | Status |
|---|---|---|
| 1 | Project Init + Toolchain | ✅ Session #1 |
| 2 | `src/core` Universal Layer | ✅ Session #1 |
| 3 | `src/server/keys` Encrypted Key Storage | ✅ Session #2 — QA gate green (47 tests pass) |
| 4 | `src/server/providers/mock` + Contract Test | ✅ Session #3 — QA gate green (62 tests pass) |
| 5 | SQLite + Migrations + Profile Repo | ✅ Session #6 — QA gate green (92 tests pass) |
| 6 | Hono Server Skeleton | ✅ Session #7 — QA gate green (120 tests pass, 13 files) |
| 7 | Vite Client Skeleton | ✅ Session #7 — regression green, vite build green, dev smoke green |

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
