# ArtForge — Technical Blueprint v2.2.1

**Project:** Consolidate Genart-1 + Genart-2 + Genart-3 into a unified local artwork generation platform.

**Version:** v2.2.1 — patch release applying Codex round 4 blocker fixes
**Supersedes:** PLAN-v2.2.md v2.2
**Companion docs:** `CONTRIBUTING.md`, `DECISIONS.md`
**Date:** 2026-04-20

---

## Changelog from v2.2 (patch release — Codex round 4 blockers)

| # | Fix | Source |
|---|---|---|
| D1 | **CONTRIBUTING Rule 4 aligned with v2.2 rename** — example was still `src/core/providers/gemini.ts`, now correctly `src/server/providers/gemini.ts`; ESLint enforcement section expanded | Codex r4 BLOCKER #1 |
| D2 | **Templates split into pure parsers + server loaders** — `src/core/templates/` (universal, pure fns taking JSON) and `src/server/templates/` (file I/O) resolve fs/path ban conflict | Codex r4 BLOCKER #2 |
| D3 | **All referenced types now defined** — `HealthStatus`, `GenerateResult`, `WorkflowRequirement`, `CompatibilityOverride`, `WorkflowEvent`, `ProfileSummaryDto`, `AssetDto`, `ReplayPayloadDto`, `ProfileCreateInput`, `ProfileUpdateInput` have explicit shapes | Codex r4 BLOCKER #3 |
| D4 | NIT — "all 7 route files" → "all 8 route files" (count matches tree) | Codex r4 NIT |
| D5 | NIT — stale "paths stripped" / "filesystem paths" prose replaced with asset-ID-based language | Codex r4 NIT |
| D6 | NIT — CONTRIBUTING footer updated to "v2.2.1" | Codex r4 NIT |

No new features, no decision reversals. This is a pure consistency patch to unblock scaffold.

---

## Changelog from v2.1

### MUST-FIX (applied)

| # | Fix | Source |
|---|---|---|
| A1 | **DTO layer separation** — `ProfileDto/AssetDto/KeyDto` never expose filesystem paths; clients receive asset IDs and fetch via `/assets/{type}/{id}/file` | Codex r3 |
| A2 | **ReplayPayload completeness** — `replay_payload` nullable; `language` field added; `not_replayable` derived from NULL | Codex r3 |
| A3 | **Imagen 4 capability corrections** — `supportedLanguages: [9 langs]` (was `["en"]`); `supportsNegativePrompt: false` (was `true` — legacy feature removed from 3.0-generate-002+) | Codex r3 |
| A4 | **ESLint + LOC enforcement wired** — `eslint.config.js` with `no-restricted-imports`/`no-process-env` rules; `check-loc.ts` in regression script | Codex r3 |
| A5 | **`src/core` boundary clean split** — `src/core` = universal (types, pure fns, schemas); `src/server/*` owns all server-only modules (providers, keys, asset-store, DB) | Codex r3 |
| A6 | **Health endpoint hybrid** — `GET /providers/health` returns batch for all active slots; `?provider=X&model=Y` filter for single model | Codex r3 |

### SHOULD-FIX (applied)

| # | Fix | Source |
|---|---|---|
| B1 | **Optimistic concurrency on `PUT /profiles/:id`** — `expectedVersion` required; 409 `VERSION_CONFLICT` on mismatch | Codex r3 |
| B2 | **Capability provenance** — each entry has `sourceUrl` + `verifiedAt` for audit | Codex r3 |
| B3 | **Aspect ratio + language source of truth** — always top-level body params on workflow run; `inputSchema` must NOT declare them | Codex r3 |
| B4 | **Cancel semantics v1** — `DELETE /api/workflows/runs/:batchId` sets abort flag; runner checks between iterations; SSE disconnect triggers abort within 30s; resume = out of scope v1 | Codex r3 |

### POST-V1 DEFERRED (acknowledged, documented)

| # | Fix | Source |
|---|---|---|
| C1 | **Tag-filter index strategy** — v1 uses simple `tags TEXT` + full-scan filter; scale note documented | Codex r3 |
| C2 | **DB size monitoring** — documented threshold (500MB warn, 2GB hard); VACUUM + archive strategy post-v1 | Codex r3 |

### Unchanged from v2.1
- Timeline 8-10 weeks active / 10-12 calendar
- 4 workflows v1 + 3 providers + Mock
- `gemini-3.1-flash-image-preview` as Nano Banana 2 default (Codex r2 rejection upheld)
- 15 anti-pattern rules

---

## 1. Project Overview

### 1.1 Mission
Build a **single local web + API app** (Vite client at `localhost:5173`, Hono server at `127.0.0.1:5174`) consolidating 3 AI Studio apps:
- **Artworks** (Genart-1 kernel)
- **Ad Images** (Genart-2 kernel)
- **Style Transforms** (Genart-3 kernel)
- **ASO Images** (new)

All generation uses Pham's **AppProfile system** with context injection per workflow.

### 1.2 Four Stated Goals → v2.2 Realization
| Goal | Realization |
|---|---|
| 1. Gen with app context | `AppProfile` JSON + `injectAppContext()` for every workflow |
| 2. Use 3 app kernels | Extraction-first → 3 workflow modules preserving behavior |
| 3. Broader tech | NB 2 default, NB Pro for quality-critical, Imagen 4 for realistic portraits |
| 4. Choose provider | Adapter + Capability Matrix + runtime validation + Select Key UI |

---

## 2. Core Principles (Pham's 4 Rules)

### Rule 1 — Clean, Lean
- No DI, no Redux, no state machine lib
- `useState` + Context (client); module functions (server)
- Abstract only after 3+ repeats
- Every file under **300 LOC hard cap** (enforced by `scripts/check-loc.ts`)

### Rule 2 — Modular, No Overlap
- Each workflow = independent folder under `/workflows/<id>/`
- Shared logic in `/core/*` (universal) or `/server/*` (server-only)
- Only named exports in `index.ts`
- New workflow = new folder

### Rule 3 — Storage vs Action (DataCenter ↔ Actions)

**Storage (passive, no network):**
- `src/core/app-profile/schema.ts`, `src/core/model-registry/*`, `src/core/templates/*`
- `src/server/asset-store/*`, `src/server/keys/*`, `src/server/profile-repo/*`

**Action (side effects):**
- `src/workflows/<id>/runner.ts`, `src/server/providers/*`, `src/server/routes/*`

**Invariant:**
```
Client UI → /api (Hono) → workflows-runtime/dispatcher → [Storage Read] → Provider → [Storage Write] → SSE Stream → Client
```

### Rule 4 — QA 3-Steps
- Step 1 Unit (Vitest, isolated)
- Step 2 Integration (MockProvider + tmp SQLite)
- Step 3 Live (1 concept per compatible pair)
- `npm run regression` = lint + LOC check + Step 1 + Step 2

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Server | Node.js 20 LTS + **Hono** | TS-first, SSE built-in |
| Client | React 19 + TS 5.3 + Vite 5 | |
| Styling | Tailwind 3 + `src/core/design/tokens.ts` | Lookup tables |
| State | `useState` + Context | No Redux |
| Validation | Zod | All API bodies |
| Profiles | JSON `data/profiles/*.json` | Git-trackable |
| Assets DB | SQLite (`better-sqlite3`) | WAL mode |
| Key storage | AES-256-GCM `data/keys.enc` | scrypt KDF |
| Lint | ESLint 9 flat config | `no-restricted-imports`, `no-process-env` enforced per folder |
| Testing | Vitest + `@hono/testing` | |
| Extraction | `ts-morph` | Fail-fast per Rule 12 |
| Gemini SDK | `@google/genai` | NB Pro + NB 2 |
| Vertex SDK | `@google-cloud/vertexai` | Imagen 4 |
| Canvas | `canvas` (Node-canvas) | Server-side composite |

### Providers v1

| Provider ID | Model ID | Display | Best for | ~Cost |
|---|---|---|---|---|
| `gemini` | `gemini-3-pro-image-preview` | Nano Banana Pro | Text-heavy, 4K | $0.134 |
| `gemini` | `gemini-3.1-flash-image-preview` | Nano Banana 2 (default) | 2× speed, half cost | $0.067 |
| `vertex` | `imagen-4.0-generate-001` | Imagen 4 | Realistic, deterministic | $0.04 (2K) |
| `mock` | `mock-fast` | Mock | Tests only | $0 |

---

## 4. Project Structure (v2.2 — rename applied)

```
artforge/
│
├── data/
│   ├── profiles/                            # AppProfile JSONs (git-tracked)
│   ├── templates/                           # Extracted from Genart
│   │   ├── artwork-groups.json
│   │   ├── ad-layouts.json
│   │   ├── country-profiles.json
│   │   ├── style-dna.json
│   │   ├── i18n.json
│   │   └── copy-templates.json
│   ├── assets/                              # Generated PNGs (gitignored)
│   │   └── {profileId}/{YYYY-MM-DD}/{assetId}.png
│   ├── profile-assets/                      # NEW v2.2: user-uploaded logos/badges
│   │   └── {profileId}/{assetId}.{png|jpg}
│   └── keys.enc                             # AES-GCM encrypted
│
├── keys/                                    # Vertex service account JSONs (gitignored)
│   └── vertex-{slotId}.json
│
├── vendor/                                  # Cloned Genart-1/2/3 (gitignored)
├── artforge.db                              # SQLite
│
├── src/
│   ├── core/                                # UNIVERSAL — client + server import (v2.2 rule)
│   │   ├── design/
│   │   │   ├── tokens.ts                    # COLOR_CLASSES, WORKFLOW_COLORS (10 colors, 5 variants each)
│   │   │   └── types.ts                     # ColorVariant, WorkflowId
│   │   │
│   │   ├── dto/                             # NEW v2.2: API DTO types (no paths)
│   │   │   ├── index.ts
│   │   │   ├── profile-dto.ts               # ProfileDto — assets as IDs
│   │   │   ├── asset-dto.ts                 # AssetDto — no file_path
│   │   │   ├── key-dto.ts                   # KeyDto — hasCredentials:bool, no paths
│   │   │   └── workflow-dto.ts              # WorkflowEvent (transport-safe)
│   │   │
│   │   ├── schemas/                         # RENAMED v2.2: Zod schemas, pure (no I/O)
│   │   │   ├── index.ts
│   │   │   ├── app-profile.ts               # Zod schema + version bump helpers
│   │   │   ├── replay-payload.ts            # NEW v2.2: with language field, nullable
│   │   │   ├── workflow-inputs.ts           # Per-workflow input schemas
│   │   │   └── api-bodies.ts                # POST body schemas
│   │   │
│   │   ├── model-registry/                  # STATIC catalog (universal)
│   │   │   ├── index.ts
│   │   │   ├── providers.ts
│   │   │   ├── models.ts                    # providerId field included
│   │   │   ├── capabilities.ts              # sourceUrl + verifiedAt per entry
│   │   │   └── types.ts                     # AspectRatio, LanguageCode unions
│   │   │
│   │   ├── compatibility/                   # PURE LOGIC
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── resolver.ts
│   │   │   ├── runtime-validator.ts
│   │   │   └── overrides.ts
│   │   │
│   │   ├── prompt-builder/                  # PURE LOGIC (universal)
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── context.ts                   # injectAppContext (takes Profile, returns prompt)
│   │   │   ├── concept.ts                   # Genart-1 style
│   │   │   ├── concept-types.ts
│   │   │   ├── structured.ts                # Genart-2 style
│   │   │   └── before-after.ts              # Genart-3 style
│   │   │
│   │   ├── templates/                       # PURE PARSERS (v2.2.1: universal, no I/O)
│   │   │   ├── index.ts
│   │   │   ├── types.ts                     # ArtworkGroup, AdLayout, StyleDna, etc.
│   │   │   ├── artwork-groups.ts            # parseArtworkGroups(json: unknown): ArtworkGroup[]
│   │   │   ├── ad-layouts.ts                # parseAdLayouts(json: unknown): AdLayout[]
│   │   │   ├── style-dna.ts
│   │   │   ├── i18n.ts
│   │   │   ├── copy.ts
│   │   │   └── country.ts
│   │   │
│   │   └── shared/                          # PURE utilities (universal)
│   │       ├── rand.ts                      # mulberry32
│   │       ├── base64.ts
│   │       ├── id.ts
│   │       ├── logger.ts                    # log levels + redactor
│   │       └── errors.ts                    # typed errors
│   │
│   ├── server/                              # SERVER-ONLY (v2.2 rename target)
│   │   ├── index.ts                         # Hono boot, binds 127.0.0.1
│   │   │
│   │   ├── templates/                       # FILE I/O LOADERS (v2.2.1: server-only)
│   │   │   ├── index.ts
│   │   │   ├── loader.ts                    # loadTemplate<T>(filename, parser): T — reads disk
│   │   │   └── cache.ts                     # in-memory cache, boot-time load
│   │   │
│   │   ├── asset-store/                     # SQLite storage
│   │   │   ├── index.ts
│   │   │   ├── schema.sql
│   │   │   ├── db.ts                        # connection + migrations
│   │   │   ├── asset-repo.ts                # CRUD with DTO mapping
│   │   │   ├── batch-repo.ts
│   │   │   └── dto-mapper.ts                # NEW v2.2: strip paths, map to DTO
│   │   │
│   │   ├── profile-repo/                    # NEW v2.2: was part of core/app-profile
│   │   │   ├── index.ts
│   │   │   ├── loader.ts                    # read JSON from data/profiles/
│   │   │   ├── saver.ts                     # write with version bump
│   │   │   ├── snapshot.ts                  # freeze for replay (paths → asset IDs)
│   │   │   └── dto-mapper.ts                # NEW v2.2: AppProfile → ProfileDto
│   │   │
│   │   ├── profile-assets/                  # NEW v2.2: logo/badge upload handling
│   │   │   ├── index.ts
│   │   │   ├── uploader.ts                  # multipart → disk
│   │   │   ├── registry.ts                  # assetId → path mapping (in SQLite)
│   │   │   └── server.ts                    # serve files by ID
│   │   │
│   │   ├── keys/                            # Encrypted key storage
│   │   │   ├── index.ts
│   │   │   ├── crypto.ts                    # AES-256-GCM + scrypt
│   │   │   ├── store.ts                     # load/save keys.enc
│   │   │   ├── slot-manager.ts
│   │   │   └── dto-mapper.ts                # NEW v2.2: strip keyEncrypted & paths
│   │   │
│   │   ├── providers/                       # API adapters (server-only SDK imports)
│   │   │   ├── index.ts
│   │   │   ├── types.ts                     # ImageProvider interface
│   │   │   ├── gemini.ts                    # NB Pro + NB 2 via @google/genai
│   │   │   ├── vertex-imagen.ts             # Imagen 4 via @google-cloud/vertexai
│   │   │   ├── mock.ts
│   │   │   └── registry.ts                  # getProvider(id)
│   │   │
│   │   ├── canvas/
│   │   │   └── composite.ts                 # logo/badge overlay (Node-canvas)
│   │   │
│   │   ├── middleware/
│   │   │   ├── error-handler.ts
│   │   │   ├── validator.ts                 # Zod
│   │   │   ├── logger.ts
│   │   │   └── dto-filter.ts                # NEW v2.2: strip paths from responses
│   │   │
│   │   ├── routes/                          # THIN routes (Rule 15)
│   │   │   ├── profiles.ts
│   │   │   ├── profile-assets.ts            # NEW v2.2: upload/serve profile logos
│   │   │   ├── assets.ts
│   │   │   ├── keys.ts
│   │   │   ├── providers.ts
│   │   │   ├── templates.ts
│   │   │   ├── workflows.ts
│   │   │   └── workflow-runs.ts             # NEW v2.2: DELETE for cancel
│   │   │
│   │   └── workflows-runtime/
│   │       ├── dispatcher.ts
│   │       ├── event-bus.ts
│   │       ├── precondition-check.ts        # ordered fail-fast
│   │       └── abort-registry.ts            # NEW v2.2: batchId → AbortController
│   │
│   ├── workflows/
│   │   ├── registry.ts
│   │   │
│   │   ├── artwork-batch/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── runner.ts                    # async generator with abort check
│   │   │   ├── modes.ts
│   │   │   ├── prompts.ts
│   │   │   ├── input-schema.ts              # NEW v2.2: Zod, excludes aspect/language
│   │   │   ├── overrides.ts
│   │   │   └── ui.tsx
│   │   │
│   │   ├── ad-production/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── runner.ts
│   │   │   ├── concept-generator.ts
│   │   │   ├── feature-meta.ts              # COLOR_CLASSES lookup
│   │   │   ├── prompts.ts
│   │   │   ├── input-schema.ts
│   │   │   ├── overrides.ts
│   │   │   └── ui.tsx
│   │   │
│   │   ├── style-transform/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── runner.ts
│   │   │   ├── slot-engine.ts
│   │   │   ├── copy-polish.ts
│   │   │   ├── input-schema.ts
│   │   │   ├── overrides.ts
│   │   │   └── ui.tsx
│   │   │
│   │   └── aso-screenshots/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── runner.ts
│   │       ├── templates.ts
│   │       ├── input-schema.ts
│   │       ├── overrides.ts
│   │       └── ui.tsx
│   │
│   ├── client/                              # React app (port 5173)
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts                    # Hono RPC client
│   │   │   ├── hooks.ts                     # React hooks wrappers
│   │   │   └── types.ts                     # inferred from server routes
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── ProfileCMS.tsx
│   │   │   ├── Workflow.tsx
│   │   │   ├── Gallery.tsx
│   │   │   ├── PromptLab.tsx
│   │   │   └── Settings.tsx
│   │   ├── contexts/
│   │   │   ├── ProfileContext.tsx
│   │   │   ├── ProviderContext.tsx
│   │   │   └── KeysContext.tsx
│   │   ├── components/
│   │   │   ├── ProfileSelector.tsx
│   │   │   ├── WorkflowPicker.tsx
│   │   │   ├── ProviderSwitcher.tsx
│   │   │   ├── IncompatibilityBanner.tsx
│   │   │   ├── KeySlotDropdown.tsx
│   │   │   ├── KeyAddModal.tsx
│   │   │   ├── AssetCard.tsx
│   │   │   ├── AssetGallery.tsx
│   │   │   ├── CostBadge.tsx
│   │   │   ├── ReplayDialog.tsx
│   │   │   ├── DiffViewer.tsx               # Phase 5
│   │   │   └── CancelButton.tsx             # NEW v2.2: batch abort trigger
│   │   ├── styles/
│   │   │   └── index.css
│   │   └── utils/
│   │       └── use-sse.ts                   # SSE hook with abort signal
│   │
│   └── index.ts
│
├── tests/
│   ├── unit/
│   │   ├── app-profile.test.ts
│   │   ├── replay-payload.test.ts           # NEW v2.2: nullable + language
│   │   ├── dto-mapper.test.ts               # NEW v2.2: path stripping
│   │   ├── asset-store.test.ts
│   │   ├── keys-crypto.test.ts
│   │   ├── compatibility.test.ts
│   │   ├── runtime-validator.test.ts
│   │   ├── prompt-builder.test.ts
│   │   ├── providers.mock.test.ts
│   │   ├── design-tokens.test.ts
│   │   ├── capability-provenance.test.ts    # NEW v2.2: sourceUrl + verifiedAt exist
│   │   └── shared.test.ts
│   ├── integration/
│   │   ├── artwork-batch.test.ts
│   │   ├── ad-production.test.ts
│   │   ├── style-transform.test.ts
│   │   ├── aso-screenshots.test.ts
│   │   ├── profiles-api.test.ts
│   │   ├── profile-assets-api.test.ts       # NEW v2.2
│   │   ├── keys-api.test.ts
│   │   ├── workflow-sse.test.ts
│   │   ├── workflow-cancel.test.ts          # NEW v2.2
│   │   └── dto-no-paths.test.ts             # NEW v2.2: API audit
│   ├── extraction/
│   │   ├── genart-1-groups.snap.ts
│   │   ├── genart-2-layouts.snap.ts
│   │   ├── genart-3-slot-engine.snap.ts
│   │   └── mulberry32.test.ts
│   ├── live/
│   │   ├── smoke-gemini-nb-pro.test.ts
│   │   ├── smoke-gemini-nb-2.test.ts
│   │   ├── smoke-imagen.test.ts
│   │   └── smoke-e2e.test.ts
│   ├── fixtures/
│   └── regression.ts
│
├── scripts/
│   ├── extract-genart-1.ts                  # fail-fast
│   ├── extract-genart-2.ts
│   ├── extract-genart-3.ts
│   ├── seed-profiles.ts
│   ├── migrations/
│   │   ├── runner.ts                        # NEW v2.2: applies SQL migrations on boot
│   │   ├── 2026-04-20-initial.sql
│   │   └── README.md                        # migration writing guide
│   ├── check-loc.ts                         # Rule 7 enforcement
│   └── inspect-db.ts
│
├── eslint.config.js                         # NEW v2.2: flat config with per-folder rules
├── CONTRIBUTING.md                          # 15 rules (unchanged)
├── PLAN-v2.2.md                             # this file
├── DECISIONS.md                             # updated
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.client.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
└── .env.local.example
```

**File count estimate:** ~165 files (+25 from v2.1 — mostly DTO mappers + new tests + route additions), ~10500 LOC excluding tests/vendor.

---

## 5. Data Schemas

### 5.1 AppProfile (storage-level, server-only)

Lives at `data/profiles/{id}.json`. Contains asset ID references (e.g., `appLogoAssetId`) which the server resolves to files via the `profile_assets` table — never sent raw to client (server maps to `ProfileDto` with URLs at the route boundary).

```typescript
// src/core/schemas/app-profile.ts
export const AppProfileSchema = z.object({
  version: z.literal(1),                    // bump on schema change (Rule 14)
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  category: z.enum(["utility", "lifestyle", "productivity", "entertainment", "education"]),
  
  assets: z.object({
    appLogoAssetId: z.string().nullable(),      // v2.2: asset ID reference, not path
    storeBadgeAssetId: z.string().nullable(),
    screenshotAssetIds: z.array(z.string()).default([]),
  }),
  
  visual: z.object({
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    tone: z.enum(["minimal", "bold", "playful", "elegant", "technical", "warm"]),
    doList: z.array(z.string()),
    dontList: z.array(z.string()),
  }),
  
  positioning: z.object({
    usp: z.string(),
    targetPersona: z.string(),
    marketTier: z.enum(["tier1", "tier2", "tier3", "global"]),
    competitors: z.array(z.string()).optional(),
  }),
  
  context: z.object({
    features: z.array(z.string()),
    keyScenarios: z.array(z.string()),
    forbiddenContent: z.array(z.string()),
  }),
  
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type AppProfile = z.infer<typeof AppProfileSchema>
```

**v2.2 change:** `assets.appLogo: "./data/..."` (path) → `assets.appLogoAssetId: "asset_abc123"` (ID reference).

### 5.2 ProfileDto (NEW v2.2 — what client sees)

```typescript
// src/core/dto/profile-dto.ts

export interface ProfileDto {
  id: string
  name: string
  tagline: string
  category: AppProfile["category"]
  version: number
  
  assets: {
    appLogoUrl: string | null          // e.g., "/api/profile-assets/asset_abc123/file"
    storeBadgeUrl: string | null
    screenshotUrls: string[]
  }
  
  visual: AppProfile["visual"]         // no paths here, safe to pass through
  positioning: AppProfile["positioning"]
  context: AppProfile["context"]
  
  createdAt: string
  updatedAt: string
}

// Mapper in src/server/profile-repo/dto-mapper.ts
export function toProfileDto(profile: AppProfile): ProfileDto {
  return {
    ...profile,
    assets: {
      appLogoUrl: profile.assets.appLogoAssetId
        ? `/api/profile-assets/${profile.assets.appLogoAssetId}/file`
        : null,
      storeBadgeUrl: profile.assets.storeBadgeAssetId
        ? `/api/profile-assets/${profile.assets.storeBadgeAssetId}/file`
        : null,
      screenshotUrls: profile.assets.screenshotAssetIds.map(
        id => `/api/profile-assets/${id}/file`
      ),
    },
  }
}
```

### 5.3 SQLite Schemas

```sql
-- v2.2: no path leaks in query results (handled by repo-layer DTO mapping)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  profile_version_at_gen INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  batch_id TEXT,
  variant_group TEXT,
  
  prompt_raw TEXT NOT NULL,
  prompt_template_id TEXT,
  prompt_template_version TEXT,
  input_params TEXT NOT NULL,
  replay_payload TEXT,                  -- v2.2: NULLABLE (was NOT NULL)
  replay_class TEXT NOT NULL,           -- derived: NULL payload → 'not_replayable'
  
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  seed INTEGER,
  aspect_ratio TEXT NOT NULL,
  language TEXT,                        -- v2.2: NEW — for replay validation
  
  file_path TEXT NOT NULL,              -- INTERNAL ONLY — never returned by API
  width INTEGER,
  height INTEGER,
  file_size_bytes INTEGER,
  
  status TEXT NOT NULL,
  error_message TEXT,
  
  generation_time_ms INTEGER,
  cost_usd REAL,
  
  tags TEXT,                            -- JSON array (v1: simple scan filter; v1.1+: index strategy)
  notes TEXT,
  replayed_from TEXT,
  
  created_at TEXT NOT NULL,
  
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (replayed_from) REFERENCES assets(id)
);

CREATE INDEX idx_assets_profile ON assets(profile_id);
CREATE INDEX idx_assets_workflow ON assets(workflow_id);
CREATE INDEX idx_assets_batch ON assets(batch_id);
CREATE INDEX idx_assets_variant_group ON assets(variant_group);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  total_assets INTEGER NOT NULL,
  successful_assets INTEGER NOT NULL,
  total_cost_usd REAL,
  status TEXT NOT NULL,                 -- v2.2: NEW — 'running' | 'completed' | 'aborted' | 'error'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  aborted_at TEXT                       -- v2.2: NEW
);

-- v2.2 NEW: profile assets registry
CREATE TABLE IF NOT EXISTS profile_assets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- 'logo' | 'badge' | 'screenshot'
  file_path TEXT NOT NULL,              -- INTERNAL
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX idx_profile_assets_profile ON profile_assets(profile_id);
```

### 5.4 ReplayPayload (v2.2 — language added, self-sufficient)

```typescript
// src/core/schemas/replay-payload.ts
export const ReplayPayloadSchema = z.object({
  version: z.literal(1),
  prompt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  aspectRatio: AspectRatioSchema,
  language: LanguageCodeSchema.optional(),   // v2.2: NEW
  seed: z.number().int().optional(),
  providerSpecificParams: z.object({
    addWatermark: z.boolean().optional(),
    negativePrompt: z.string().optional(),
  }).passthrough(),
  promptTemplateId: z.string(),
  promptTemplateVersion: z.string(),
  contextSnapshot: z.object({
    profileId: z.string(),
    profileVersion: z.number().int(),
    profileSnapshot: AppProfileSchema,       // frozen at gen time
  }),
})

export type ReplayPayload = z.infer<typeof ReplayPayloadSchema>
```

**v2.2 change:** `not_replayable` is derived when column `replay_payload IS NULL` in SQLite. No conflict between "NOT NULL schema" and "lacks payload" semantic.

### 5.5 Keys Storage + Encryption (unchanged from v2.1)

AES-256-GCM with scrypt KDF. See v2.1 §5.4 for full spec. Unchanged.

### 5.6 AspectRatio + LanguageCode (v2.2 explicit)

```typescript
// src/core/model-registry/types.ts
export const AspectRatioSchema = z.enum([
  "1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"
])
export type AspectRatio = z.infer<typeof AspectRatioSchema>

export const LanguageCodeSchema = z.enum([
  "en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh",
  "zh-CN", "zh-TW"
])
export type LanguageCode = z.infer<typeof LanguageCodeSchema>
```

---

## 6. Module Contracts

### 6.1 ImageProvider (unchanged except typed fields)

```typescript
// src/server/providers/types.ts

export interface ImageProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  
  health(modelId: string): Promise<HealthStatus>
  generate(params: GenerateParams): Promise<GenerateResult>
}

export interface ModelInfo {
  id: string
  providerId: string                        // v2.1 fix (kept)
  displayName: string
  capability: ProviderCapability
  costPerImageUsd: number
  avgLatencyMs: number
}

export interface GenerateParams {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  language?: LanguageCode
  seed?: number
  providerSpecificParams?: Record<string, unknown>
  timeoutMs?: number
  abortSignal?: AbortSignal                 // v2.2: NEW for cancel support
}

// v2.2.1: explicit definition (was referenced but undefined)
export interface GenerateResult {
  imageBytes: Buffer                        // raw PNG bytes from provider
  mimeType: "image/png" | "image/jpeg"
  width: number
  height: number
  seedUsed?: number                         // for providers that return seed back (Imagen)
  generationTimeMs: number
  providerResponseMeta?: Record<string, unknown>  // debugging metadata
}

// v2.2.1: explicit definition (was referenced but undefined)
export interface HealthStatus {
  status: "ok" | "quota_exceeded" | "auth_error" | "rate_limited" | "down"
  latencyMs?: number
  message?: string                          // human-readable detail
  checkedAt: string                         // ISO timestamp
}

export interface ProviderCapability {
  supportsTextToImage: boolean
  supportsImageEditing: boolean
  supportsStyleReference: boolean
  supportsMultiImageFusion: boolean
  supportsCharacterConsistency: boolean
  supportsTextInImage: "none" | "basic" | "precision"
  maxResolution: "1K" | "2K" | "4K"
  supportedAspectRatios: AspectRatio[]
  supportedLanguages: LanguageCode[]
  supportsDeterministicSeed: boolean
  supportsNegativePrompt: boolean
  sourceUrl: string                         // v2.2: NEW — provenance
  verifiedAt: string                        // v2.2: NEW — ISO date
}
```

### 6.2 Capability Registry (v2.2 corrected for Imagen)

```typescript
// src/core/model-registry/capabilities.ts

export const CAPABILITIES: Record<string, ProviderCapability> = {
  "gemini:gemini-3-pro-image-preview": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: false,
    supportsNegativePrompt: false,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    verifiedAt: "2026-04-20",
  },
  "gemini:gemini-3.1-flash-image-preview": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: false,
    supportsNegativePrompt: false,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    verifiedAt: "2026-04-20",
  },
  "vertex:imagen-4.0-generate-001": {
    supportsTextToImage: true,
    supportsImageEditing: false,
    supportsStyleReference: false,
    supportsMultiImageFusion: false,
    supportsCharacterConsistency: false,
    supportsTextInImage: "basic",
    maxResolution: "2K",
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    // v2.2 CORRECTED: Imagen 4 supports 9 languages via translation (not just "en")
    supportedLanguages: ["en", "zh", "zh-CN", "zh-TW", "fr", "de", "hi", "ja", "ko", "pt", "es"],
    supportsDeterministicSeed: true,
    // v2.2 CORRECTED: negativePrompt is legacy, not included in Imagen 3.0-generate-002 and newer
    supportsNegativePrompt: false,
    sourceUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/4-0-generate",
    verifiedAt: "2026-04-20",
  },
  "mock:mock-fast": {
    supportsTextToImage: true,
    supportsImageEditing: true,
    supportsStyleReference: true,
    supportsMultiImageFusion: true,
    supportsCharacterConsistency: true,
    supportsTextInImage: "precision",
    maxResolution: "4K",
    supportedAspectRatios: ["1:1", "4:5", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "21:9"],
    supportedLanguages: ["en", "vi", "ja", "ko", "pt", "es", "de", "fr", "hi", "it", "zh"],
    supportsDeterministicSeed: true,
    supportsNegativePrompt: true,
    sourceUrl: "internal",
    verifiedAt: "2026-04-20",
  },
}
```

**Unit test:** `tests/unit/capability-provenance.test.ts` asserts every entry has non-empty `sourceUrl` + valid ISO `verifiedAt`.

### 6.3 Workflow Contract

```typescript
// src/workflows/types.ts
export interface WorkflowDefinition {
  readonly id: WorkflowId
  readonly displayName: string
  readonly description: string
  readonly inputSchema: ZodSchema
  readonly requirement: WorkflowRequirement
  readonly compatibilityOverrides: CompatibilityOverride[]
  readonly colorVariant: ColorVariant       // for UI theming (Rule 1)
  
  run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent>
}

// v2.2.1: explicit definition
export interface WorkflowRequirement {
  required: (keyof ProviderCapability)[]    // capability flags that must be true
  preferred: (keyof ProviderCapability)[]   // scored +1 in compatibility sort
  forbidden?: (keyof ProviderCapability)[]  // disqualifies the provider:model combo
  minResolution?: "1K" | "2K" | "4K"
  requiredAspectRatios?: AspectRatio[]      // optional workflow-level constraint
  requiredLanguages?: LanguageCode[]        // optional — if set, runtime validator checks
}

// v2.2.1: explicit definition
export interface CompatibilityOverride {
  providerId: string
  modelId: string
  forceStatus: "compatible" | "incompatible"
  reason: string                            // required — why this override exists
}

// v2.2.1: explicit definition (was a partial example)
export type WorkflowEvent =
  | { type: "started"; batchId: string; total: number }
  | { type: "concept_generated"; concept: Concept; index: number }
  | { type: "image_generated"; asset: AssetDto; index: number }  // v2.2.1: DTO not raw Asset
  | { type: "error"; error: { message: string; code?: string }; context: string; index?: number }
  | { type: "aborted"; batchId: string; completedCount: number; totalCount: number }  // v2.2 cancel
  | { type: "complete"; assets: AssetDto[]; batchId: string }

// v2.2: aspectRatio + language LIVE AT TOP LEVEL; inputSchema must NOT declare them
export interface WorkflowRunParams {
  profile: AppProfile
  input: unknown                            // validated against inputSchema
  providerId: string
  modelId: string
  aspectRatio: AspectRatio                  // top-level, single source of truth
  language?: LanguageCode                   // top-level
  abortSignal: AbortSignal                  // v2.2: NEW, always present
}

// v2.2.1: explicit definition for compatibility results
export interface CompatibilityResult {
  status: "compatible" | "incompatible"
  score: number                             // 0+ (higher = better fit); 0 if incompatible
  source: "declarative" | "override"
  reason?: string                           // populated when status=incompatible or score=0
  recommendedForWorkflow?: boolean          // UI hint
}

export type CompatibilityMatrix = Record<
  WorkflowId,
  Record<string /* providerId:modelId */, CompatibilityResult>
>

// v2.2.1: explicit Concept type (used by concept_generated event)
export interface Concept {
  id: string
  title: string
  description: string
  seed?: number
  tags: string[]
}
```

**Rule (enforced in test):** `inputSchema` must NOT declare `aspectRatio` or `language`. Test scans all registered workflows:
```typescript
// tests/unit/workflow-input-schema.test.ts
describe("workflow input schemas", () => {
  for (const wf of ALL_WORKFLOWS) {
    it(`${wf.id} inputSchema excludes top-level aspect/language`, () => {
      const shape = wf.inputSchema._def.shape?.() ?? {}
      expect(shape).not.toHaveProperty("aspectRatio")
      expect(shape).not.toHaveProperty("language")
    })
  }
})
```

### 6.4 Public API Spec (v2.2)

All endpoints prefixed `/api`. Server binds `127.0.0.1` only.

**Error codes (unchanged from v2.1):** `400 BAD_REQUEST`, `401 NO_ACTIVE_KEY`, `404 NOT_FOUND`, `409 INCOMPATIBLE_WORKFLOW_PROVIDER`, `409 RUNTIME_VALIDATION_FAILED`, `409 VERSION_CONFLICT`, `410 PROVIDER_UNAVAILABLE`.

#### DTO Types (v2.2.1: explicit definitions)

All DTOs live in `src/core/dto/`. Client imports them via type-only imports; server maps domain types → DTOs at the route boundary.

```typescript
// src/core/dto/key-dto.ts

export interface KeySlotDto {
  id: string
  label: string
  addedAt: string               // ISO
  lastUsedAt?: string           // ISO
  // NO keyEncrypted
}

export interface VertexSlotDto {
  id: string
  label: string
  projectId: string
  location: string
  hasCredentials: boolean       // replaces serviceAccountPath
  addedAt: string
  lastUsedAt?: string
  // NO serviceAccountPath
}

// src/core/dto/profile-dto.ts

export interface ProfileDto {
  id: string
  name: string
  tagline: string
  category: "utility" | "lifestyle" | "productivity" | "entertainment" | "education"
  version: number
  assets: {
    appLogoUrl: string | null
    storeBadgeUrl: string | null
    screenshotUrls: string[]
  }
  visual: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
    tone: "minimal" | "bold" | "playful" | "elegant" | "technical" | "warm"
    doList: string[]
    dontList: string[]
  }
  positioning: {
    usp: string
    targetPersona: string
    marketTier: "tier1" | "tier2" | "tier3" | "global"
    competitors?: string[]
  }
  context: {
    features: string[]
    keyScenarios: string[]
    forbiddenContent: string[]
  }
  createdAt: string
  updatedAt: string
}

// Summary for list endpoints — compact payload
export interface ProfileSummaryDto {
  id: string
  name: string
  tagline: string
  category: ProfileDto["category"]
  version: number
  logoUrl: string | null
  updatedAt: string
}

// Input for POST /profiles — no version/timestamps, no URLs (IDs come in assets.*AssetId form)
export interface ProfileCreateInput {
  id?: string                   // optional — server generates slug from name if omitted
  name: string
  tagline: string
  category: ProfileDto["category"]
  assets?: {
    appLogoAssetId?: string | null
    storeBadgeAssetId?: string | null
    screenshotAssetIds?: string[]
  }
  visual: ProfileDto["visual"]
  positioning: ProfileDto["positioning"]
  context: ProfileDto["context"]
}

// Input for PUT /profiles/:id — same as create + expectedVersion
export interface ProfileUpdateInput {
  expectedVersion: number       // optimistic concurrency
  name?: string
  tagline?: string
  category?: ProfileDto["category"]
  assets?: ProfileCreateInput["assets"]
  visual?: Partial<ProfileDto["visual"]>
  positioning?: Partial<ProfileDto["positioning"]>
  context?: Partial<ProfileDto["context"]>
}

// src/core/dto/asset-dto.ts

export interface AssetDto {
  id: string
  profileId: string
  profileVersionAtGen: number
  workflowId: string
  batchId: string | null
  variantGroup: string | null
  
  promptRaw: string
  promptTemplateId: string | null
  promptTemplateVersion: string | null
  
  providerId: string
  modelId: string
  seed: number | null
  aspectRatio: string
  language: string | null
  
  // NO file_path
  imageUrl: string              // "/api/assets/:id/file"
  width: number | null
  height: number | null
  fileSizeBytes: number | null
  
  status: "completed" | "error"
  errorMessage: string | null
  
  generationTimeMs: number | null
  costUsd: number | null
  
  replayClass: "deterministic" | "best_effort" | "not_replayable"
  replayedFromAssetId: string | null
  
  tags: string[]
  notes: string | null
  
  createdAt: string
}

// Detail view when ?include=replayPayload — adds full payload (paths already converted to IDs)
export interface AssetDetailDto extends AssetDto {
  replayPayload: ReplayPayloadDto | null
}

// src/core/dto/replay-payload-dto.ts
// Derived from ReplayPayload but with profileSnapshot already DTO-mapped
export interface ReplayPayloadDto {
  version: 1
  prompt: string
  providerId: string
  modelId: string
  aspectRatio: string
  language?: string
  seed?: number
  providerSpecificParams: Record<string, unknown>
  promptTemplateId: string
  promptTemplateVersion: string
  contextSnapshot: {
    profileId: string
    profileVersion: number
    profileSnapshot: ProfileDto   // v2.2.1: DTO, not raw AppProfile (paths → asset URLs)
  }
}
```

**DTO mapping location:** every storage → DTO conversion lives in a `dto-mapper.ts` file next to the repository (e.g., `src/server/asset-store/dto-mapper.ts`, `src/server/profile-repo/dto-mapper.ts`, `src/server/keys/dto-mapper.ts`). Routes never touch raw storage types.

#### Providers & Health (v2.2: hybrid)

```
GET /providers
→ 200 { providers: [{ id, displayName, models: [{ id, displayName, capability }], activeKeySlotId }] }

GET /providers/health
→ 200 { [providerId]: { [modelId]: { status, latencyMs, message? } } }
  # Returns status for all (activeProvider × each compatible model in active slot's allowed set)

GET /providers/health?provider=gemini
→ 200 { gemini: { [modelId]: { status, ... } } }
  # Filter to single provider

GET /providers/health?provider=gemini&model=gemini-3-pro-image-preview
→ 200 { status, latencyMs, message? }
  # Single model, flat response

GET /providers/compatibility
→ 200 { [workflowId]: { [providerId:modelId]: CompatibilityResult } }
```

#### Keys (v2.2: DTO enforced, no paths)

```
GET /keys
→ 200 {
  gemini: {
    activeSlotId: string | null,
    slots: Array<KeySlotDto>        // KeySlotDto below
  },
  vertex: { activeSlotId, slots: Array<VertexSlotDto> }
}

// KeySlotDto (client-safe):
// { id, label, addedAt, lastUsedAt? }   — NO keyEncrypted

// VertexSlotDto (client-safe):
// { id, label, projectId, location, hasCredentials: boolean, addedAt, lastUsedAt? }
// — NO serviceAccountPath

POST /keys
  Gemini body:  { provider: "gemini", label, key }
  Vertex body:  multipart with projectId, location, serviceAccountFile
→ 201 { slotId }

POST /keys/:id/activate                   → 200 { activated: true }
DELETE /keys/:id                          → 204
POST /keys/:id/test                       → 200 { status, latencyMs, message? }
```

#### Profiles (CMS) — v2.2: DTO + optimistic concurrency

```
GET /profiles
→ 200 { profiles: Array<ProfileSummaryDto> }
  # { id, name, tagline, category, version, logoUrl, updatedAt }

GET /profiles/:id
→ 200 ProfileDto                          # all paths → URLs (v2.2)
→ 404 if not found

POST /profiles
Body: ProfileCreateInput                  # ProfileDto minus {version, timestamps, assets.urls}
→ 201 { id, version: 1 }

PUT /profiles/:id
Body: { expectedVersion: number, ...ProfileUpdateInput }
→ 200 { id, version: N+1 }
→ 409 { error: "VERSION_CONFLICT", currentVersion: M, expectedVersion: N }
  # v2.2: optimistic concurrency (B1)

DELETE /profiles/:id
→ 204

POST /profiles/:id/upload-asset
  multipart: { kind: "logo" | "badge" | "screenshot", file }
→ 201 { assetId }                         # v2.2: ID only, NO path

GET /profiles/:id/export                  → download JSON (paths replaced with asset IDs)
POST /profiles/import                     → upload JSON, returns { profileId }
```

#### Profile Assets (NEW v2.2)

```
GET /profile-assets/:assetId/file
→ 200 image/png | image/jpeg (binary served by server)
→ 404 if not registered

DELETE /profile-assets/:assetId
→ 204
```

#### Templates (read-only, unchanged)

```
GET /templates/artwork-groups
GET /templates/ad-layouts
GET /templates/country-profiles
GET /templates/style-dna
GET /templates/i18n
GET /templates/copy
```

#### Assets (v2.2: DTO enforced)

```
GET /assets
Query: profileId?, workflowId?, tags?, dateFrom?, dateTo?, batchId?, limit=50, offset=0
→ 200 { assets: Array<AssetDto>, total }
  # AssetDto: { id, profileId, workflowId, batchId, createdAt, thumbnailUrl, status, cost_usd, ... }
  # NO file_path, NO replay_payload in list view

GET /assets/:id
→ 200 AssetDto                            # full metadata, no paths
→ 200 with include=replayPayload: ReplayPayloadDto attached (asset IDs instead of paths in profileSnapshot)

GET /assets/:id/file
→ 200 image/png

DELETE /assets/:id                        → 204

POST /assets/:id/replay
Body: { mode: "replay" | "edit", useCurrentProfile: boolean, editedPrompt? }
→ 201 { newAssetId, replayClass, message? }
→ 400 NOT_REPLAYABLE
→ 409 RUNTIME_VALIDATION_FAILED
→ 410 PROVIDER_UNAVAILABLE
```

#### Workflows (v2.2: aspect/language top-level, cancel endpoint)

```
GET /workflows
→ 200 [{ id, displayName, description, inputSchema, requirement, colorVariant }]

POST /workflows/:id/run
Body: {
  profileId: string,
  input: unknown,                         # validated against inputSchema (NO aspect/language)
  providerId: string,
  modelId: string,
  aspectRatio: AspectRatio,               # v2.2: top-level source of truth
  language?: LanguageCode                 # v2.2: top-level source of truth
}
→ 200 text/event-stream (SSE of WorkflowEvent, first event includes batchId)
→ errors as per v2.1

Preconditions (ordered fail-fast):
1. Workflow exists
2. Profile exists
3. Provider active key slot exists
4. Compatibility matrix pass (workflowId × providerId × modelId)
5. Runtime validation pass (aspectRatio ∈ model.supportedAspectRatios)
6. Runtime validation pass (language ∈ model.supportedLanguages if workflow requires)
7. Input validates against workflow.inputSchema
8. input does NOT contain aspectRatio or language keys (enforced)

DELETE /workflows/runs/:batchId            # v2.2: NEW — cancel active batch
→ 204 if abort registered
→ 404 if batch unknown or already completed/aborted
  # Runner checks abortSignal between iterations; current in-flight provider call
  # is aborted via AbortSignal (passed to fetch/SDK)
  # Partial assets remain in DB; batch.status = 'aborted', batch.aborted_at = now

# Resume: NOT supported in v1 (explicit note in response headers)
```

#### Diagnostics

```
GET /debug/stats
→ 200 { assets: count, profiles: count, diskUsageMb, dbSizeMb, dbWarning?: "approaching 500MB threshold" }
  # v2.2: warning at 500MB, hard stop at 2GB (DELETE refuses, asks user to archive)

GET /debug/active-batches                 # NEW v2.2
→ 200 { batches: [{ id, workflowId, profileId, startedAt, progress: { completed, total } }] }
```

### 6.5 DTO Enforcement Test (NEW v2.2)

```typescript
// tests/integration/dto-no-paths.test.ts
describe("DTO layer — no filesystem paths in responses", () => {
  it("GET /profiles/:id response has no absolute/relative paths", async () => {
    const res = await client.profiles[":id"].$get({ param: { id: "chartlens" } })
    const body = await res.json()
    const json = JSON.stringify(body)
    expect(json).not.toMatch(/\.\/data\//)
    expect(json).not.toMatch(/\/home\//)
    expect(json).not.toMatch(/[A-Z]:\\/)
    expect(json).not.toMatch(/\.png|\.jpg/)   // raw file refs
  })
  
  it("GET /keys never includes keyEncrypted or serviceAccountPath", async () => {
    // ... similar assertion
  })
  
  it("GET /assets/:id with include=replayPayload strips paths in profileSnapshot", async () => {
    // ... similar assertion
  })
  
  it("GET /assets/:id excludes file_path field", async () => {
    const res = await client.assets[":id"].$get({ param: { id: ASSET_ID } })
    const body = await res.json()
    expect(body).not.toHaveProperty("file_path")
    expect(body).not.toHaveProperty("filePath")
  })
})
```

---

## 7. Compatibility Matrix (unchanged logic from v2.1)

Two-layer: static resolver + runtime-validator. See v2.1 §7 for full logic. v2.2 changes:

**Expected v1 matrix (v2.2 reflects corrected Imagen capability):**

| | NB Pro | NB 2 | Imagen 4 |
|---|---|---|---|
| artwork-batch | ✅ score 1 | ✅ score 1 | ✅ score 0 |
| ad-production | ✅ score 2 (best) | ✅ score 2 | ✅ score 1 |
| style-transform | ✅ | ✅ | ❌ no imageEditing |
| aso-screenshots | ✅ score 2 (best) | ✅ score 2 | ✅ score 1 |

**Runtime validation examples (v2.2 updated):**
- `artwork-batch + Imagen 4 + aspectRatio="4:5"` → **FAIL** (Imagen supports 1:1, 3:4, 4:3, 9:16, 16:9)
- `artwork-batch + Imagen 4 + aspectRatio="1:1" + language="vi"` → **FAIL** (Imagen supports en, zh, fr, de, hi, ja, ko, pt, es — NOT vi)
- `style-transform + NB 2 + aspectRatio="4:5" + language="vi"` → OK

---

## 8. Replay System (v2.2 — completeness fix)

### 8.1 Replay Classes (v2.2 — NULL payload handled)

- **`deterministic`:** `replay_payload IS NOT NULL` AND model supports seed AND seed is set AND `addWatermark: false`
- **`best_effort`:** `replay_payload IS NOT NULL` AND not deterministic
- **`not_replayable`:** `replay_payload IS NULL` (old assets, errored gens)

SQLite `replay_class` column stores precomputed value. Determined at insert time, never recomputed (if model capability changes retroactively, that's a migration).

### 8.2 Replay API (unchanged from v2.1 except preconditions use `language` from payload)

```
POST /assets/:id/replay
Body: {
  mode: "replay" | "edit",
  useCurrentProfile: boolean,
  editedPrompt?: string                   # required if mode="edit"
}

Preconditions:
1. Asset exists
2. replay_payload IS NOT NULL (else 400 NOT_REPLAYABLE)
3. payload.providerId + modelId still registered
4. Active key slot exists for payload.providerId
5. Runtime validation: payload.aspectRatio ∈ currentModel.supportedAspectRatios
6. Runtime validation: payload.language ∈ currentModel.supportedLanguages (if present)
   # v2.2: language now part of payload, no need to infer
7. If mode="edit": editedPrompt non-empty

→ 201 { newAssetId, replayClass, message? }
→ 400 NOT_REPLAYABLE | EDIT_REQUIRES_PROMPT
→ 409 RUNTIME_VALIDATION_FAILED
→ 410 PROVIDER_UNAVAILABLE
```

---

## 9. UI Design (unchanged from v2.1 + cancel button)

### 9.1 Design Tokens (unchanged — full 10-color table, 5 variants)
See v2.1 §9.1. Unchanged.

### 9.2 Navigation (unchanged)

### 9.3 Cancel UX (NEW v2.2)

- Cancel button visible in workflow runner during active batch
- Confirmation modal: "Cancel batch? Partial assets will remain in gallery."
- DELETE `/api/workflows/runs/:batchId` on confirm
- SSE stream closes cleanly with final event `{ type: "aborted", batchId, completedCount, totalCount }`
- If user closes tab without canceling explicitly → SSE disconnects → server registers disconnect → abort signal fires within 30s → in-flight provider call cancelled (AbortSignal to fetch) → batch marked `aborted`

---

## 10. Phased Rollout (v2.2 — 8-10 weeks active, 10-12 calendar)

### Phase 1 — Foundation (Week 1-2)
**Goal:** Compilable skeleton. Backend boots, client renders empty, lint/tests green.

Deliverables:
- Monorepo scaffold (client + server + core with path aliases)
- **ESLint flat config** with per-folder `no-restricted-imports` + `no-process-env`
- **`scripts/check-loc.ts`** wired to `npm run lint`
- Hono server + health example + SSE example (bind `127.0.0.1`)
- Vite client with `/api` proxy
- SQLite init + `scripts/migrations/runner.ts`
- `src/server/keys/*` with AES-256-GCM + scrypt
- `src/core/schemas/app-profile.ts` v1 + `src/core/dto/profile-dto.ts` + mapper in `src/server/profile-repo/`
- `src/core/model-registry/*` with all 4 provider:model entries including `sourceUrl` + `verifiedAt`
- `src/core/compatibility/*` (resolver + runtime-validator)
- `src/server/providers/mock.ts` + contract test
- `src/core/design/tokens.ts` + design-tokens + capability-provenance + dto-mapper unit tests
- `CONTRIBUTING.md` 15 rules
- Seed 3 profiles (ChartLens, PlantID, Chatbot)

**QA Gate:**
```bash
npm run regression   # passes
# = lint + check-loc + unit tests + integration (mock only)
```

### Phase 2 — Extraction (Week 3-4)
**Goal:** Genart static data migrated with fidelity tests.

Deliverables:
- `vendor/` setup
- `scripts/extract-genart-{1,2,3}.ts` (fail-fast, `--dry-run`)
- `data/templates/*.json` emitted
- Fidelity tests: `mulberry32`, country profile VN, ART_STYLES GHIBLI
- `src/core/prompt-builder/*` — 3 builders + `injectAppContext`

**QA Gate:** extraction tests green, `npm run extract:all --dry-run` clean.

### Phase 3 — Workflows + Mock E2E (Week 5-6)
**Goal:** 4 workflows running via real SSE with MockProvider.

Deliverables:
- 4 workflow modules (artwork-batch, ad-production, style-transform, aso-screenshots)
- `src/server/workflows-runtime/dispatcher.ts` with precondition-check + abort-registry
- `src/server/routes/*` — all 8 route files (profiles, profile-assets, assets, keys, providers, templates, workflows, workflow-runs)
- Client pages: Home, Workflow, basic Gallery
- `use-sse.ts` hook with AbortSignal integration
- Integration tests per workflow + cancel flow + dto-no-paths audit

**QA Gate:** all 4 workflows emit correct events; abort flow works; `dto-no-paths.test.ts` green.

### Phase 4 — Real Providers (Week 7-8)
**Goal:** Real generation via NB Pro, NB 2, Imagen 4.

Deliverables:
- `src/server/providers/gemini.ts` (NB Pro + NB 2, shared adapter, AbortSignal support)
- `src/server/providers/vertex-imagen.ts` (Imagen 4 with seed + addWatermark + language translation, AbortSignal support)
- Key management UI (KeySlotDropdown, KeyAddModal, Settings page)
- `/api/providers/health` wired (batch + filter modes)
- Cost tracking per asset + batch
- Compatibility warning banner
- 11 live smoke tests (= Σ compatible pairs)

**QA Gate:** `npm run regression:full` — 11 smoke tests green. Imagen capability validated against docs (test cross-checks declared `supportedLanguages` matches known subset).

### Phase 5 — CMS + Gallery + PromptLab (Week 9)
**Goal:** Full CRUD + replay workflow.

Deliverables:
- Profile CMS: full CRUD, logo upload (via `/profile-assets/` API), import/export, optimistic concurrency UX
- Gallery: filters (profile, workflow, tags, date, batch_id), pagination, DTO-safe rendering
- PromptLab: replay dialog with mode + profile snapshot toggle + expected replayClass preview
- DiffViewer: profile diff (Phase 5 per v2.1 fix)
- ReplayClass badges in gallery

**QA Gate:** manual E2E: create profile → run 4 workflows → cancel one mid-batch → replay a completed asset both modes → success.

### Phase 6 — Polish + Buffer (Week 10)
**Goal:** Production-ready daily use + absorb unexpected issues.

Deliverables:
- README setup guide
- Error states (network, quota, key revoked mid-batch, DB threshold warning)
- Loading skeletons + keyboard shortcuts
- Cost dashboard per profile per month
- All TODOs resolved/ticketed
- DB size stats in diagnostics
- Buffer for Phase 3-5 overflow

**QA Gate:** Pham uses ArtForge for 1 full batch per portfolio app, no blockers.

---

## 11. QA Strategy (v2.2 — expanded test list)

### 11.1 Step 1 Unit — NEW v2.2 tests

```typescript
// tests/unit/replay-payload.test.ts
describe("ReplayPayload schema", () => {
  it("accepts language field")
  it("validates seed is non-negative int when present")
  it("profileSnapshot nested schema matches AppProfile version")
  it("missing language is acceptable (optional)")
})

// tests/unit/dto-mapper.test.ts
describe("DTO mappers strip paths", () => {
  it("ProfileDto maps appLogoAssetId to appLogoUrl")
  it("ProfileDto has no file path strings in output")
  it("KeyDto omits keyEncrypted and serviceAccountPath")
  it("VertexSlotDto reports hasCredentials:boolean")
  it("AssetDto omits file_path")
  it("replay payload contextSnapshot.profileSnapshot uses asset IDs not paths")
})

// tests/unit/capability-provenance.test.ts
describe("capability registry provenance", () => {
  it("every entry has non-empty sourceUrl")
  it("every sourceUrl is a valid https URL")
  it("every verifiedAt is ISO 8601 date")
  it("imagen-4.0-generate-001 supportedLanguages includes 'en','zh','ja','ko','pt','es','fr','de','hi'")
  it("imagen-4.0-generate-001 supportsNegativePrompt is false")
})

// tests/unit/workflow-input-schema.test.ts
describe("workflow input schemas don't declare reserved top-level fields", () => {
  for (const wf of ALL_WORKFLOWS) {
    it(`${wf.id} excludes aspectRatio from inputSchema`)
    it(`${wf.id} excludes language from inputSchema`)
  }
})
```

### 11.2 Step 2 Integration — NEW v2.2 tests

```typescript
// tests/integration/dto-no-paths.test.ts — see §6.5

// tests/integration/workflow-cancel.test.ts
describe("workflow cancel flow", () => {
  it("DELETE /workflows/runs/:batchId aborts mid-batch")
  it("partial assets remain in DB after abort")
  it("batch.status becomes 'aborted' with aborted_at timestamp")
  it("subsequent event to SSE stream is {type:'aborted', completedCount, totalCount}")
  it("404 if batchId unknown")
  it("404 if already completed")
  it("client SSE disconnect triggers abort within 30s")
})

// tests/integration/profiles-api.test.ts — v2.2 additions
describe("optimistic concurrency", () => {
  it("PUT /profiles/:id succeeds when expectedVersion matches")
  it("PUT /profiles/:id returns 409 VERSION_CONFLICT on mismatch")
  it("PUT response includes currentVersion on conflict")
})

// tests/integration/profile-assets-api.test.ts (NEW)
describe("profile assets upload/serve", () => {
  it("POST /profiles/:id/upload-asset returns assetId (no path)")
  it("GET /profile-assets/:assetId/file serves binary with correct MIME")
  it("DELETE /profile-assets/:assetId removes file + DB row")
})
```

### 11.3 Step 3 Live (unchanged — 11 smoke tests from v2.1)

### 11.4 Regression Script (v2.2 — wired)

```json
{
  "scripts": {
    "lint": "eslint src/",
    "check-loc": "tsx scripts/check-loc.ts",
    "test:unit": "vitest run tests/unit tests/extraction",
    "test:integration": "vitest run tests/integration",
    "test:live": "RUN_LIVE=1 vitest run tests/live",
    "regression": "npm run lint && npm run check-loc && npm run test:unit && npm run test:integration",
    "regression:full": "npm run regression && npm run test:live"
  }
}
```

---

## 12. Anti-Pattern Rules

Unchanged 15 rules in `CONTRIBUTING.md`. v2.2 enforcement wiring:

**ESLint flat config (`eslint.config.js`):**

```javascript
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@google/genai", "@google-cloud/*"], message: "Client cannot import provider SDKs (Rule 3)" },
          { group: ["**/server/**"], message: "Client cannot import from src/server (Rule 5)" },
        ],
      }],
      "no-process-env": "error",  // Rule 5
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@google/genai", "@google-cloud/*"], message: "src/core is universal; provider SDKs belong in src/server (Rule 4)" },
          { group: ["react", "react-dom"], message: "src/core is universal; React belongs in src/client (Rule 2)" },
          { group: ["better-sqlite3", "fs", "path"], message: "src/core cannot use Node I/O (use src/server)" },
        ],
      }],
    },
  },
  {
    files: ["src/workflows/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom"], message: "Workflow runners must not import React (Rule 2, Rule 8)" },
          { group: ["@google/genai", "@google-cloud/*"], message: "Use Provider via runtime registry, not direct SDK (Rule 3)" },
        ],
      }],
    },
  },
  {
    files: ["src/workflows/**/ui.tsx"],
    rules: {
      // ui.tsx IS allowed React (exception to workflow folder rule above)
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@google/genai", "@google-cloud/*"], message: "UI cannot import provider SDKs" },
        ],
      }],
    },
  },
]
```

**LOC check (`scripts/check-loc.ts`):** fails CI if any file in `src/**/*.{ts,tsx}` (excluding constants/data) exceeds 300 content lines.

---

## 13. Migration Playbook (unchanged from v2.1)

See v2.1 §13 for full extraction mappings. Unchanged.

---

## 14. Risks & Mitigations (v2.2 additions)

| Risk | v2.2 Mitigation |
|---|---|
| Path leak in DTO drift | Integration test `dto-no-paths.test.ts` runs on every regression |
| Capability registry drift from docs | `sourceUrl` + `verifiedAt` in every entry; `capability-provenance.test.ts` asserts |
| Workflow runners forget abort check | Test asserts runner yields event at least every N iterations; abort signal tested |
| Large batch leaves DB inconsistent | `batch.status = 'aborted'` transaction-safe; partial assets keep pointing to valid batch_id |
| ESLint bypassed with `/* eslint-disable */` | Code review rule: inline disables require PR description note |
| Optimistic concurrency race | Server re-reads version inside transaction before write; 409 covers stale UI |

### Scale notes (v1 acceptable; revisit post-v1)

- **Tag filtering:** v1 uses `tags TEXT` with `LIKE '%"xmas"%'` scan. Performance acceptable up to ~10k assets. Post-v1: add `asset_tags` join table with index.
- **DB size monitoring:** warn at 500MB, hard-stop asset inserts at 2GB until archive. Archive strategy: export old batches to ZIP + delete from DB. Deferred to post-v1.

---

## 15. Definition of Done for v1 (v2.2)

- [ ] All 4 workflows runnable with 3 real providers (except incompatible)
- [ ] 3 AppProfiles seeded
- [ ] CMS: CRUD + logo upload via `/profile-assets/` API + optimistic concurrency + import/export
- [ ] Gallery: filter by profile, workflow, tags, date, batch_id; DTO-safe (no paths leak)
- [ ] PromptLab: 2 replay modes + profile snapshot choice + expected replayClass preview
- [ ] Key slots: 3-5 per provider, encrypted, DTO-safe
- [ ] Runtime validation: aspect ratio + language
- [ ] Cancel flow: DELETE `/workflows/runs/:batchId` works; SSE disconnect → abort within 30s
- [ ] Full regression green: `npm run regression` + 11 smoke
- [ ] ESLint + check-loc in CI; no violations
- [ ] `README.md` setup → first asset in <10 minutes
- [ ] Capability provenance audit green
- [ ] DTO no-paths integration test green
- [ ] Cost tracking accurate within ±10%

---

## Appendix A — Sample AppProfile (v2.2)

Note: `assets.appLogoAssetId` etc. are IDs pointing to `profile_assets` table rows.

```json
{
  "version": 1,
  "id": "chartlens",
  "name": "ChartLens: AI Analyzer",
  "tagline": "Read any chart instantly with AI",
  "category": "utility",
  "assets": {
    "appLogoAssetId": "pa_abc123",
    "storeBadgeAssetId": "pa_shared_google_badge",
    "screenshotAssetIds": []
  },
  "visual": {
    "primaryColor": "#2563eb",
    "secondaryColor": "#0ea5e9",
    "accentColor": "#f59e0b",
    "tone": "technical",
    "doList": [
      "clean data visualizations",
      "modern mobile UI frame",
      "educational framing",
      "confident trader persona"
    ],
    "dontList": [
      "explicit buy/sell signals",
      "ticker symbols or stock names",
      "cash stacks or profit imagery",
      "dark moody backgrounds"
    ]
  },
  "positioning": {
    "usp": "Instantly understand any chart using AI-powered analysis",
    "targetPersona": "Aspiring traders and investors, 25-45",
    "marketTier": "global",
    "competitors": ["TradingView mobile", "Investing.com"]
  },
  "context": {
    "features": ["AI chart reading", "candlestick pattern detection", "trend analysis", "educational explanations"],
    "keyScenarios": ["user pointing phone at candlestick chart on laptop", "split screen: chart left, AI analysis right"],
    "forbiddenContent": ["no financial advice framing — must stay educational", "no real ticker symbols"]
  },
  "createdAt": "2026-04-20T00:00:00Z",
  "updatedAt": "2026-04-20T00:00:00Z"
}
```

## Appendix B — First-Run Flow (v2.2)

```bash
git clone https://github.com/<pham>/artforge.git
cd artforge
npm install

mkdir -p vendor data/profiles data/assets data/profile-assets keys
git clone https://github.com/thang081193-ctrl/Genart-1.git vendor/genart-1
git clone https://github.com/thang081193-ctrl/Genart-2.git vendor/genart-2
git clone https://github.com/thang081193-ctrl/Genart-3.git vendor/genart-3

npm run extract:all -- --dry-run
npm run extract:all

npm run seed:profiles
npm run dev
# Client: http://localhost:5173
# Server: http://127.0.0.1:5174

# First use:
# 1. Open http://localhost:5173
# 2. Click "Add Gemini Key" → paste + save
# 3. Select "ChartLens" profile
# 4. Click "Artwork Batch" workflow
# 5. Fill inputs → Generate
# → First asset in ~15 seconds
```

---

*End of blueprint v2.2.*
*Supersedes PLAN-v2.1.md v2.1.*
*Companion: CONTRIBUTING.md (15 rules), DECISIONS.md (log).*
*Next step: scaffold Phase 1 Week 1.*
