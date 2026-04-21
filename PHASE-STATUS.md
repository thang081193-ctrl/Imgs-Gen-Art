# PHASE-STATUS — Images Gen Art

Current phase: **Phase 1, Week 1 — Foundation**
Last updated: 2026-04-21 (Session #6, Opus 4.7 — Step 5 complete, 92/92 tests green)

## Summary

| Step | Title | Status |
|---|---|---|
| 1 | Project Init + Toolchain | ✅ Session #1 |
| 2 | `src/core` Universal Layer | ✅ Session #1 |
| 3 | `src/server/keys` Encrypted Key Storage | ✅ Session #2 — QA gate green (47 tests pass) |
| 4 | `src/server/providers/mock` + Contract Test | ✅ Session #3 — QA gate green (62 tests pass) |
| 5 | SQLite + Migrations + Profile Repo | ✅ Session #6 — QA gate green (92 tests pass) |
| 6 | Hono Server Skeleton | ⏳ |
| 7 | Vite Client Skeleton | ⏳ |

## What bro needs to do next (before Step 6)

Step 5 regressed green (92 tests, 10 files, 0 lint/LOC violations).
Next session starts Step 6 (Hono server skeleton on 127.0.0.1:5174) —
run `npm run regression` once more to confirm env is still clean.

**If any fail** → paste output to next session; don't auto-fix without diagnosis.

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

1. Read this file + `memory/MEMORY.md` + `memory/patterns.md` to recover state.
2. Run `npm run regression` to confirm clean env (should be 92/92 green, 10 test files).
3. Start **Step 6** (Hono server skeleton). Reference BOOTSTRAP.md §Step 6 + PLAN-v2.2.1.md §6.4 (API spec).

### Step 6 deliverables (BOOTSTRAP.md:171-ish)

**Server entry + wiring (`src/server/`):**
- `index.ts` — boots Hono app on `127.0.0.1:5174` (local-only, no auth). Calls `openAssetDatabase()` on boot; exits non-zero on migration failure.
- `app.ts` — Hono app factory with middleware (error handler maps `AppError.status`, JSON body parser, request logger).
- Routes: at minimum `/api/health`, `/api/providers` (list providers + capability registry), an SSE example endpoint per PLAN §6.4.
- Error handler — catches `AppError`, returns `{ code, message, details? }` with correct HTTP status. Catches Zod errors → 400 BAD_REQUEST.

**Unit/integration tests:**
- Hono app mounted in-process, assertions on JSON response shape + status codes. Use the mock provider registry only — no real SDK calls.

### Step 6 gotchas to watch
- **Local-only bind** — must be `127.0.0.1`, not `0.0.0.0`. This is a single-user local tool; wider bind exposes keys over LAN.
- **SSE example** — PLAN §6.4 spec'd pattern; keep it tiny for scaffold (workflow dispatch is Phase 3).
- **Error handler ordering** — install before route mounting so thrown `AppError`s from handlers flow correctly.
- **Rule 11 via routes** — `/api/assets/...` + `/api/profile-assets/...` serve files by ID. Do NOT accept file-path params; route to repo-resolved internal path server-side.
- **Boot migration** — if `MigrationDriftError` thrown during `openAssetDatabase()`, fail boot fast; do not start the HTTP listener.

### Alignment questions likely for Session #7
- **Route layout** — flat (`routes/providers.ts`) or nested (`routes/providers/index.ts`)? Pattern established in Step 6 cascades through Phase 3.
- **API body schemas** — per patterns.md Schema Location Policy, colocate at `src/server/routes/<name>.body.ts`. Confirm on first body schema.
- **Request logger shape** — use the existing `@/core/shared/logger` or add a Hono-specific middleware? Logger already redacts AIza/JWT patterns.
- **Dev script** — `npm run dev` already concurrent (server + client). Verify `tsx watch` HMR works cleanly against Step 6 code.

Predicted Session #7 length: 2h (lighter than Step 5; scaffolding + a few routes + tests).
