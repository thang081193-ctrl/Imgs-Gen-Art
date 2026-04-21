# PHASE-STATUS — Images Gen Art

Current phase: **Phase 1, Week 1 — Foundation**
Last updated: 2026-04-21 (Session #1, Opus 4.6)

## Summary

| Step | Title | Status |
|---|---|---|
| 1 | Project Init + Toolchain | ✅ files written, QA gate not yet run |
| 2 | `src/core` Universal Layer | ✅ files + tests written, QA gate not yet run |
| 3 | `src/server/keys` Encrypted Key Storage | ⏳ NEXT |
| 4 | `src/server/providers/mock` + Contract Test | ⏳ |
| 5 | SQLite + Migrations + Profile Repo | ⏳ |
| 6 | Hono Server Skeleton | ⏳ |
| 7 | Vite Client Skeleton | ⏳ |

## What bro needs to do next (before Step 3)

```bash
cd "D:/Dev/Tools/Images Gen Art"
npm install
npm run regression   # lint + check-loc + unit tests — should all green
```

**Expected result:** 4 unit tests pass (`design-tokens`, `capability-provenance`, `compatibility`, `shared`).

If any fail → paste output to next session; don't auto-fix without diagnosis.

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
4. **Workflow input schemas (`src/core/schemas/workflow-inputs.ts`) + `api-bodies.ts`** — BOOTSTRAP lists under Step 2 universal layer but they are tightly coupled with workflow definitions (Phase 3). Held unless bro says otherwise — the plan keeps `inputSchema` inside each workflow's `input-schema.ts` (§4 folder tree). Flag if you want stubs now.
5. **Design-tokens test:** exempt `tokens.ts` from check-loc via `EXCLUDED` set in `scripts/check-loc.ts` (87 LOC currently so no problem, but future additions could push it — the exemption is preemptive per Rule 7 exception).
6. **File count:** 25 source `.ts` files + 4 test files, all under 101 LOC. Hard cap 300 is comfortable.

## Decisions made in this session (all within plan)

- `shortId(prefix, length=10)` helper uses `globalThis.crypto.getRandomValues` (universal, no Node-only import). Base62 charset.
- `mulberry32` returns a generator function; colocated `pickOne<T>(rand, items)` helper.
- Logger uses `console.warn`/`console.error` only (Rule 9 compliant); `debug`/`info` levels emit via `console.warn` with level tag.
- `resolveCompatibility` marks highest-scoring compatible models with `recommendedForWorkflow: true` (flag was declared in `CompatibilityResult` but plan didn't specify exact algorithm — greedy best-score seems faithful to §7 intent; revisit if user wants different).
- `check-loc.ts` excludes `src/core/design/tokens.ts` per Rule 7 exception (data/constants table).

## Rejected / not done (intentionally)

- **No implementation code** in `src/server/`, `src/client/`, `src/workflows/` yet. Per BOOTSTRAP Steps 3-7.
- **No `src/core/shared/contract.ts` provider contract tests** — Step 4 scope.
- **No Phase 2 extraction scripts** — Phase 2 scope.
- **No `.env.local`** — only `.env.local.example` stub.

## Next session resume instructions

1. Read this file + `memory/MEMORY.md` to recover state
2. Run `npm install` (if bro hasn't) and `npm run regression` — confirm green
3. Start **Step 3** (`src/server/keys` AES-256-GCM encrypted storage)
4. Reference BOOTSTRAP.md §Step 3 for deliverables checklist + PLAN-v2.2.1.md §5.5 for crypto spec (which says "see v2.1 §5.4 for full spec") — **may need v2.1 key storage spec from bro** if v2.2.1 doesn't include scrypt params in-line (quick check first: BOOTSTRAP Step 3 has: `N=2^15, r=8, p=1, keyLen=32`, salt 16 bytes, KDF input `${os.userInfo().username}:${process.platform}:artforge-v1` — sufficient!)
