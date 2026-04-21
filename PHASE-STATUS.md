# PHASE-STATUS — Images Gen Art

Current phase: **Phase 1, Week 1 — Foundation**
Last updated: 2026-04-21 (Session #3, Opus 4.7 — Step 4 complete)

## Summary

| Step | Title | Status |
|---|---|---|
| 1 | Project Init + Toolchain | ✅ files written, QA gate not yet run |
| 2 | `src/core` Universal Layer | ✅ files + tests written, QA gate not yet run |
| 3 | `src/server/keys` Encrypted Key Storage | ✅ Session #2 — QA gate green (47 tests pass) |
| 4 | `src/server/providers/mock` + Contract Test | ✅ Session #3 — QA gate green (62 tests pass) |
| 5 | SQLite + Migrations + Profile Repo | ⏳ |
| 6 | Hono Server Skeleton | ⏳ |
| 7 | Vite Client Skeleton | ⏳ |

## What bro needs to do next (before Step 5)

Step 4 regressed green (62 tests, 7 files, 0 lint/LOC violations).
Next session starts Step 5 (SQLite + migrations + profile repo) —
just run `npm run regression` once more to confirm env is still clean.

**If any fail** → paste output to next session; don't auto-fix without diagnosis.

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

## Rejected / not done (intentionally)

- **No implementation code** in `src/server/`, `src/client/`, `src/workflows/` yet. Per BOOTSTRAP Steps 3-7.
- **No `src/core/shared/contract.ts` provider contract tests** — Step 4 scope.
- **No Phase 2 extraction scripts** — Phase 2 scope.
- **No `.env.local`** — only `.env.local.example` stub.

## Next session resume instructions

1. Read this file + `memory/MEMORY.md` + `memory/patterns.md` to recover state.
2. Run `npm run regression` to confirm clean env (should be 62/62 green, 7 test files).
3. Start **Step 5** (SQLite + Migrations + Profile Repo). Reference BOOTSTRAP.md §Step 5 + PLAN-v2.2.1.md §5.3 (DB schema) + Appendix A (seed profiles).

### Step 5 deliverables (BOOTSTRAP.md:136-167)

**Asset store (SQLite, `src/server/asset-store/`):**
- `schema.sql` — per PLAN §5.3: `assets`, `batches`, `profile_assets` tables. Must include `batch_id`, `language`, nullable `replay_payload` columns.
- `db.ts` — `better-sqlite3` connection, **WAL mode** (`PRAGMA journal_mode=WAL`), invokes migration runner at boot.
- `asset-repo.ts` — CRUD **stubbed** for Phase 1 (full CRUD is Phase 3). Minimum: `insert`, `findById`, `findByBatch`.
- `batch-repo.ts` — CRUD stubbed. Minimum: `create`, `findById`.
- `dto-mapper.ts` — `toAssetDto()` **must strip `file_path`** (Rule 11 — no paths in API responses).

**Migrations (`scripts/migrations/`):**
- `2026-04-20-initial.sql` — copy of schema.sql using `CREATE TABLE IF NOT EXISTS`.
- `runner.ts` — tracks applied migrations in `_migrations` table (filename + applied_at), applies new ones in lexical order at boot. Idempotent.

**Profile repo (`src/server/profile-repo/`):**
- `loader.ts` — reads `data/profiles/{id}.json`, returns parsed + Zod-validated `AppProfile`.
- `saver.ts` — writes with **version bump** (Rule 14 + AppProfileSchema `z.literal(1)` discipline; bump + migration on schema change).
- `dto-mapper.ts` — `toProfileDto()`, `toProfileSummaryDto()`.
- `snapshot.ts` — `freezeProfileForReplay(profile)`: replaces profile-local asset paths with asset IDs (per PLAN replay semantics).

**Seeds (`data/profiles/`) — per PLAN Appendix A:**
- `chartlens.json` — must include `appLogoAssetId` field (schema v1 requirement).
- `plant-identifier.json`
- `ai-chatbot.json`
- `scripts/seed-profiles.ts` — idempotent: write file if missing, skip if present.

**Unit tests:**
- `tests/unit/app-profile.test.ts` — Zod validates all 3 seed profiles against `AppProfileSchema`.
- `tests/unit/asset-store.test.ts` — migration runner applies 2026-04-20-initial, `_migrations` has 1 row, expected tables/columns exist (use `:memory:` or tmp file DB — do NOT hit `./data/images-gen-art.db`).
- Extend `tests/unit/dto-mapper.test.ts` — add profile DTO tests (currently only key DTO tests there) + asset DTO stripping `file_path`.

### Step 5 gotchas to watch
- **DB filename** — prefer `images-gen-art.db` over legacy `artforge.db` (memory note). Both gitignored. Server default path should go to `./data/images-gen-art.db`.
- **WAL files** — better-sqlite3 in WAL mode creates `*.db-wal` + `*.db-shm`. Ensure `.gitignore` covers these (it already globs `data/**`).
- **Tests must use isolated DB** — `new Database(":memory:")` or temp file. Never touch the real `./data/*.db` in unit tests.
- **Seed profile schema version** — `AppProfileSchema` is `z.literal(1)` right now. Seeds must write `version: 1`.
- **Zod `exactOptionalPropertyTypes`** — when constructing seed JSON, omit optional fields (don't set to `undefined`); when mapping DTOs, conditionally assign rather than spread-undefined.
- **Migration runner ordering** — read files with `readdirSync`, sort lexically, apply missing ones in sorted order. Store applied filename in `_migrations(filename TEXT PRIMARY KEY, applied_at TEXT)`.
- **Rule 4 — SDKs only in server**: `better-sqlite3` is **only** importable from `src/server/**`. Do not touch in core/client.
- **Rule 11 — no paths in DTOs**: `toAssetDto` strips `file_path` before returning. Keep internal shape (`Asset`) distinct from DTO (`AssetDto`); already defined in `src/core/dto/asset-dto.ts`.

### Alignment questions likely to come up in Session #4
- **`better-sqlite3` pinned version** — already in package.json (11.7.2 per memory); verify `npm install` has been run OR will be part of Step 5 setup.
- **`data/` directory creation** — should seed-profiles.ts `mkdirSync({ recursive: true })` before writing, or rely on app boot to create?
- **Schema §5.3 fine print** — re-read PLAN §5.3 carefully for column types (TEXT vs INTEGER for IDs, ISO strings for timestamps, JSON-as-TEXT for replay_payload). Don't invent columns; match PLAN exactly.
- **Profile seed content — PLAN Appendix A** — bro will likely want Appendix A read verbatim and each seed to match; don't improvise content.

Predicted Session #4 length: 3-4h of implementation + alignment pauses. Step 5 has the most files of any Phase 1 step.
