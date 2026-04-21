# ArtForge — Phase 1 Week 1 Bootstrap Checklist

**Prerequisites:** Planning files in context (PLAN-v2.2.1.md, CONTRIBUTING.md, DECISIONS.md) + HANDOFF-PROMPT.md read.

**Goal:** Compilable skeleton. Backend boots on 127.0.0.1:5174. Client renders empty page at localhost:5173. `npm run regression` passes. No real provider calls yet — Mock only.

**Estimated total time:** 3-5 focused coding sessions, ~15-25 hours work.

---

## Step 1 — Project Init + Toolchain (2-3h)

**Goal:** `npm install` works. Empty scaffold boots. Lint + LOC check runs green on 0 files.

**Deliverables:**
- [ ] `package.json` with dependencies pinned:
  - runtime: `hono`, `@hono/node-server`, `better-sqlite3`, `zod`
  - client: `react`, `react-dom`, `@types/react`
  - dev: `typescript`, `tsx`, `vite`, `@vitejs/plugin-react`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `vitest`, `concurrently`, `tailwindcss`, `postcss`, `autoprefixer`
  - SDKs (for later but install now): `@google/genai`, `@google-cloud/vertexai`
- [ ] `tsconfig.json` (base) + `tsconfig.server.json` + `tsconfig.client.json` with path aliases `@/core`, `@/server`, `@/client`, `@/workflows`
- [ ] `vite.config.ts` — port 5173, proxy `/api` → `http://127.0.0.1:5174`
- [ ] `vitest.config.ts` — with `@/` aliases
- [ ] `eslint.config.js` — flat config, per-folder rules per CONTRIBUTING.md §12 and PLAN §12
- [ ] `tailwind.config.ts` — with content globs for `src/**/*.{ts,tsx}`
- [ ] `scripts/check-loc.ts` — fails CI if any src file > 300 content lines (excluding constants/data)
- [ ] `package.json` scripts: `dev`, `dev:server`, `dev:client`, `build`, `lint`, `check-loc`, `test`, `test:unit`, `test:integration`, `regression`, `regression:full`
- [ ] `.gitignore` — `node_modules`, `data/`, `keys/`, `vendor/`, `artforge.db`, `.env.local`
- [ ] `.env.local.example` — stub
- [ ] `README.md` — 1-screen setup guide

**QA gate:**
```bash
npm install              # no errors
npm run lint             # passes (nothing to lint yet)
npm run check-loc        # passes
npm run test             # "no tests found" is OK
```

---

## Step 2 — `src/core` Universal Layer (3-4h)

**Goal:** All pure types, schemas, and pure logic modules in place. Zero I/O. Client-importable.

**Deliverables:**
- [ ] `src/core/design/tokens.ts` — **full 50-string color table** per PLAN §9.1 (10 colors × 5 variants). Literal strings only, no interpolation.
- [ ] `src/core/design/types.ts` — `ColorVariant`, `WorkflowId` enums
- [ ] `src/core/model-registry/types.ts` — `AspectRatio`, `LanguageCode` unions (Zod schemas)
- [ ] `src/core/model-registry/providers.ts` — `ALL_PROVIDERS` catalog
- [ ] `src/core/model-registry/models.ts` — 4 `ModelInfo` entries with `providerId`
- [ ] `src/core/model-registry/capabilities.ts` — full capability registry per PLAN §6.2, **including Imagen 4 corrections** (9 languages, negativePrompt: false) + `sourceUrl` + `verifiedAt` per entry
- [ ] `src/core/dto/index.ts` + individual DTO files per PLAN §6.4:
  - `profile-dto.ts` — `ProfileDto`, `ProfileSummaryDto`, `ProfileCreateInput`, `ProfileUpdateInput`
  - `asset-dto.ts` — `AssetDto`, `AssetDetailDto`
  - `key-dto.ts` — `KeySlotDto`, `VertexSlotDto`
  - `replay-payload-dto.ts` — `ReplayPayloadDto`
  - `workflow-dto.ts` — `WorkflowEvent` union
- [ ] `src/core/schemas/app-profile.ts` — Zod schema v1 with `appLogoAssetId` (not path)
- [ ] `src/core/schemas/replay-payload.ts` — Zod with `language?` field
- [ ] `src/core/compatibility/types.ts` — `CompatibilityResult`, `CompatibilityMatrix`, `WorkflowRequirement`, `CompatibilityOverride`
- [ ] `src/core/compatibility/resolver.ts` — `resolveCompatibility(workflows, models)` pure fn
- [ ] `src/core/compatibility/runtime-validator.ts` — `validateRuntime()` per PLAN §7.2
- [ ] `src/core/shared/rand.ts` — `mulberry32` (extraction fidelity target)
- [ ] `src/core/shared/id.ts` — UUID + slug helpers
- [ ] `src/core/shared/logger.ts` — levels + redactor patterns per CONTRIBUTING Rule 9
- [ ] `src/core/shared/errors.ts` — typed error classes

**Unit tests required before moving on:**
- [ ] `tests/unit/design-tokens.test.ts` — asserts no `${` + every `WORKFLOW_COLORS`/`SEMANTIC_COLORS` has `COLOR_CLASSES` entry
- [ ] `tests/unit/capability-provenance.test.ts` — every entry has valid `sourceUrl` + ISO `verifiedAt`; Imagen 4 specifically has 9 languages + `supportsNegativePrompt: false`
- [ ] `tests/unit/compatibility.test.ts` — resolver + runtime-validator happy path + fail cases
- [ ] `tests/unit/shared.test.ts` — mulberry32 sequence for seed=42 stable + logger redacts `AIza...` patterns

**QA gate:**
```bash
npm run regression       # lint + loc + unit tests all green
```

---

## Step 3 — `src/server/keys` Encrypted Key Storage (2-3h)

**Goal:** AES-256-GCM + scrypt works. Key round-trips correctly. Never persists plaintext.

**Deliverables:**
- [ ] `src/server/keys/crypto.ts` — AES-256-GCM + scrypt per PLAN §5.5
  - scrypt params: N=2^15, r=8, p=1, keyLen=32
  - fixed salt: 16 bytes per PLAN
  - KDF input: `${os.userInfo().username}:${process.platform}:artforge-v1`
  - IV: random 12 bytes per encryption
  - ciphertext format: `base64(iv || ciphertext || authTag)`
- [ ] `src/server/keys/types.ts` — `StoredKeys`, `KeySlot`, `VertexSlot` per PLAN §5.5
- [ ] `src/server/keys/store.ts` — load/save `data/keys.enc` file
- [ ] `src/server/keys/slot-manager.ts` — activate, add, remove, list slots
- [ ] `src/server/keys/dto-mapper.ts` — `toKeySlotDto()`, `toVertexSlotDto()` — strips `keyEncrypted`, no paths

**Unit tests:**
- [ ] `tests/unit/keys-crypto.test.ts`
  - encrypts + decrypts round-trip
  - different ciphertext for same plaintext (random IV)
  - GCM auth tag tamper detection
  - same OS user produces same derived key
- [ ] `tests/unit/dto-mapper.test.ts` — key DTO mappers strip `keyEncrypted` + `serviceAccountPath`

**QA gate:**
```bash
npm run test:unit -- keys-crypto
npm run test:unit -- dto-mapper
# Both green
```

---

## Step 4 — `src/server/providers/mock` + Contract Test (2h)

**Goal:** Mock provider implements full `ImageProvider` interface. Generates deterministic fake PNGs. Contract test passes.

**Deliverables:**
- [ ] `src/server/providers/types.ts` — `ImageProvider`, `HealthStatus`, `GenerateParams`, `GenerateResult` per PLAN §6.1
- [ ] `src/server/providers/mock.ts` — returns deterministic 1024×1024 PNG (solid color from prompt hash); respects `abortSignal`
- [ ] `src/server/providers/registry.ts` — `getProvider(id): ImageProvider`
- [ ] `src/core/providers/contract.ts` — contract tests that any provider implementation must pass (reusable across providers)

**Unit tests:**
- [ ] `tests/unit/providers.mock.test.ts` — Mock satisfies contract (health returns "ok", generate returns valid PNG buffer, aborts cleanly)

**QA gate:**
```bash
npm run test:unit -- providers
# Green
```

---

## Step 5 — SQLite + Migrations + Profile Repo (3-4h)

**Goal:** DB boots, applies migrations, can CRUD profiles as JSON files. DTO mapping works.

**Deliverables:**
- [ ] `src/server/asset-store/schema.sql` — per PLAN §5.3 including `batch_id`, `language`, nullable `replay_payload`, `profile_assets` table
- [ ] `scripts/migrations/2026-04-20-initial.sql` — copy of schema.sql with IF NOT EXISTS
- [ ] `scripts/migrations/runner.ts` — tracks applied migrations in `_migrations` table, applies new ones in order at boot
- [ ] `src/server/asset-store/db.ts` — `better-sqlite3` connection with WAL mode + migration runner hook
- [ ] `src/server/asset-store/asset-repo.ts` — CRUD (stubbed for Phase 1; full CRUD Phase 3)
- [ ] `src/server/asset-store/batch-repo.ts` — CRUD (stubbed)
- [ ] `src/server/asset-store/dto-mapper.ts` — `toAssetDto()` strips `file_path`
- [ ] `src/server/profile-repo/loader.ts` — read `data/profiles/{id}.json`
- [ ] `src/server/profile-repo/saver.ts` — write with version bump
- [ ] `src/server/profile-repo/dto-mapper.ts` — `toProfileDto()`, `toProfileSummaryDto()`
- [ ] `src/server/profile-repo/snapshot.ts` — `freezeProfileForReplay()` (paths → asset IDs)
- [ ] `data/profiles/chartlens.json` — seed profile per PLAN Appendix A (with `appLogoAssetId`)
- [ ] `data/profiles/plant-identifier.json` — seed
- [ ] `data/profiles/ai-chatbot.json` — seed
- [ ] `scripts/seed-profiles.ts` — idempotent script that writes seed files if missing

**Unit tests:**
- [ ] `tests/unit/app-profile.test.ts` — Zod validates seed profiles
- [ ] `tests/unit/asset-store.test.ts` — migration applies; schema matches expected
- [ ] `tests/unit/dto-mapper.test.ts` — extend with profile + asset DTO tests

**QA gate:**
```bash
npm run seed:profiles    # creates 3 profile JSONs
npm run test:unit        # all green
# Verify: artforge.db is created, has all tables, _migrations has 1 row
```

---

## Step 6 — Hono Server Skeleton (2h)

**Goal:** Server boots on 127.0.0.1:5174. Health endpoint responds. SSE example works. No auth (local single-user).

**Deliverables:**
- [ ] `src/server/index.ts` — Hono boot, bind 127.0.0.1, mount routes, apply middleware
- [ ] `src/server/middleware/error-handler.ts` — typed errors → HTTP status
- [ ] `src/server/middleware/validator.ts` — Zod body validator
- [ ] `src/server/middleware/logger.ts` — request log with secret redaction
- [ ] `src/server/middleware/dto-filter.ts` — response interceptor stripping any `file_path` / `serviceAccountPath` / `keyEncrypted` as safety net (defense in depth)
- [ ] `src/server/routes/health.ts` — `GET /api/health` returns `{ status: "ok", version, uptimeMs }`
- [ ] Stub routes (return 501 "not implemented" for Phase 1): `profiles.ts`, `assets.ts`, `keys.ts`, `providers.ts`, `workflows.ts`, `templates.ts`, `profile-assets.ts`, `workflow-runs.ts`

**Integration test:**
- [ ] `tests/integration/health.test.ts` — `GET /api/health` returns 200 + correct shape, server binds to 127.0.0.1 not 0.0.0.0

**QA gate:**
```bash
npm run dev:server       # server boots, no errors
curl http://127.0.0.1:5174/api/health  # returns OK
npm run test:integration -- health     # green
```

---

## Step 7 — Vite Client Skeleton (2h)

**Goal:** Client renders empty Home page. Proxy to server works. Tailwind applies. Type-safe API client stub.

**Deliverables:**
- [ ] `src/client/main.tsx` — React 19 root
- [ ] `src/client/App.tsx` — minimal router (React Router or plain state; plan doesn't mandate — use `useState` page switcher for now)
- [ ] `src/client/pages/Home.tsx` — renders "ArtForge v0.1" + fetches `/api/health` + displays status
- [ ] `src/client/api/client.ts` — typed API client (can be plain `fetch` wrapper for now; Hono RPC optional)
- [ ] `src/client/api/hooks.ts` — `useApiHealth()` React hook
- [ ] `src/client/styles/index.css` — Tailwind directives
- [ ] `index.html` at project root — mounts `#root`
- [ ] `src/client/utils/use-sse.ts` — SSE hook with AbortSignal (stub for Phase 3)

**QA gate:**
```bash
npm run dev              # concurrently starts server + client
# Open http://localhost:5173 → shows "ArtForge v0.1" + health status from server
# Network tab: /api/health request goes through proxy to 5174
```

---

## Final Phase 1 Week 1-2 QA Gate

```bash
npm run regression       # lint + loc + unit + integration ALL GREEN
npm run dev              # both server + client boot
# Open browser → client fetches server health → shows OK
```

If all the above pass: **Phase 1 is DONE.** Move to Phase 2 (Extraction) in next coding session.

---

## What's NOT in Phase 1 Week 1

These come in later phases. Don't build them yet:
- Real provider integration (Gemini, Vertex) → Phase 4
- Workflow runners → Phase 3
- CMS UI → Phase 5
- Extraction scripts → Phase 2
- Real key management UI → Phase 4
- Asset gallery → Phase 5
- PromptLab → Phase 5

---

## Anti-patterns to watch for during scaffold

Cross-check against CONTRIBUTING.md rules frequently:
- Rule 1: any `${...}` inside Tailwind class strings? → fail
- Rule 4: any SDK import outside `src/server/**`? → fail
- Rule 7: any file > 300 lines? → fail (split it)
- Rule 10: any magic numbers? → constants file
- Rule 11: any path strings in API responses? → DTO mapper bug
- Rule 15: any orchestration in route handlers? → move to dispatcher

`npm run regression` catches most. Code review catches the rest.

---

*Follow this order. Don't skip ahead. If a step is blocked, ask bro before inventing a workaround.*
