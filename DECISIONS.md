# ArtForge — Decisions Log

Consolidated decisions across 4 Codex reviews and 5 plan iterations.

---

## v2.2.1 Changes (post-Codex round 4, patch release)

Pure consistency patch — no new features, no decision reversals. Unblocks scaffold.

**D1 — CONTRIBUTING Rule 4 aligned with v2.2 rename**
- Reason: Rule 4 still referenced `src/core/providers/gemini.ts` as allowed example after v2.2 moved providers to `src/server/providers/`. Lint/folder ownership was ambiguous.
- Fix: Rule 4 rewritten — `src/server/providers/` is the canonical location; added full ESLint enforcement spec (banned patterns per folder). Banned section now includes `src/workflows/**/runner.ts` cannot import SDKs directly.

**D2 — Templates split into pure parsers + server loaders**
- Reason: `src/core/templates/` had "generic JSON loader" taking a path, but `src/core` is declared universal with `fs`/`path` banned by ESLint. Implementer had to pick the boundary themselves.
- Fix: Two directories with clean separation.
  - `src/core/templates/` — **pure parsers**: `parseArtworkGroups(json: unknown): ArtworkGroup[]`, no I/O, type definitions colocated.
  - `src/server/templates/` — **file I/O loaders**: `loadTemplate<T>(filename, parser): T`, reads disk, in-memory cache at boot.

**D3 — All referenced types now defined**
- Reason: 10 types referenced in API spec / provider interface / workflow interface were undefined, leaving ambiguity for implementer.
- Fix: Explicit TypeScript shapes added for:
  - `HealthStatus`, `GenerateResult` (§6.1)
  - `WorkflowRequirement`, `CompatibilityOverride`, `WorkflowEvent`, `CompatibilityResult`, `CompatibilityMatrix`, `Concept` (§6.3)
  - `KeySlotDto`, `VertexSlotDto`, `ProfileDto`, `ProfileSummaryDto`, `ProfileCreateInput`, `ProfileUpdateInput`, `AssetDto`, `AssetDetailDto`, `ReplayPayloadDto` (§6.4)
- Location: all DTOs in `src/core/dto/`; mappers in `src/server/{asset-store,profile-repo,keys}/dto-mapper.ts`.

**D4-D6 — Prose polish**
- Route count corrected ("7" → "8" to match tree)
- `AppProfile` storage description updated: contains asset IDs (not "filesystem paths"); maps to `ProfileDto` at route boundary
- Export endpoint prose: "paths replaced with asset IDs" (not "paths stripped")
- CONTRIBUTING footer: "v2.2.1"

---

## v2.2 Changes (post-Codex round 3)

### MUST-FIX applied (Group A)

**A1 — DTO layer separation**
- Reason: Rule 11 (no paths to client) was violated by `GET /profiles/:id` returning AppProfile with path strings, upload-asset returning `{ assetPath }`, and `replay_payload.profileSnapshot` containing paths.
- Fix: Introduced `src/core/dto/*` (ProfileDto, AssetDto, KeyDto). `AppProfile.assets` changed from path strings to asset ID references (`appLogoAssetId`). New table `profile_assets` + `/api/profile-assets/` endpoints serve files by ID. Integration test `dto-no-paths.test.ts` audits every API response.

**A2 — ReplayPayload completeness**
- Reason: `replay_payload TEXT NOT NULL` conflicted with "not_replayable = lacks payload" semantics. `language` field missing despite being part of replay preconditions.
- Fix: `replay_payload` is now NULLABLE. `not_replayable` derived from NULL payload. `ReplayPayload` Zod schema added `language?: LanguageCode`. New column `language` in assets table.

**A3 — Imagen 4 capability corrections**
- Reason: v2.1 declared `supportedLanguages: ["en"]` and `supportsNegativePrompt: true`. Verified against Vertex docs: Imagen 4 supports 9 languages via translation (en, zh, zh-CN, zh-TW, fr, de, hi, ja, ko, pt, es) and negative prompt is legacy, removed from 3.0-generate-002+.
- Fix: Corrected both fields. Unit test `capability-provenance.test.ts` now asserts against doc-declared values.
- Source: https://cloud.google.com/vertex-ai/generative-ai/docs/image/set-text-prompt-language, https://cloud.google.com/vertex-ai/generative-ai/docs/image/omit-content-using-a-negative-prompt

**A4 — ESLint + LOC enforcement wired**
- Reason: CONTRIBUTING rules referenced ESLint but no config existed; `check-loc.ts` existed but not in regression script.
- Fix: Added `eslint.config.js` with per-folder `no-restricted-imports` + `no-process-env`. `npm run regression` now runs lint + check-loc before tests.

**A5 — `src/core` boundary clean split via rename**
- Reason: v2.1 said "core is shared" but allowed `src/core/providers/gemini.ts` imports provider SDKs — contradictory for a module meant to be client-importable.
- Fix: Renamed `src/core/providers/*`, `src/core/keys/*`, `src/core/asset-store/*` → `src/server/*`. `src/core` is now strictly universal (types, pure functions, schemas, design tokens, templates, compatibility logic, prompt builders). ESLint enforces: `src/core` cannot import `@google/genai`, `@google-cloud/*`, `better-sqlite3`, `fs`, `path`, `react`.

**A6 — Health endpoint hybrid**
- Reason: v2.1 had ambiguity — provider-level endpoint vs model-level `ImageProvider.health(modelId)` interface.
- Fix: `GET /providers/health` is canonical **model-level** data. Default returns batch: `{ [providerId]: { [modelId]: status } }`. Query params `?provider=X&model=Y` narrow scope to single model flat response.

### SHOULD-FIX applied (Group B)

**B1 — Optimistic concurrency on PUT /profiles/:id**
- Reason: AppProfile has `version` field but no contract for conflict detection.
- Fix: `PUT` body now requires `expectedVersion`. Server reads current version inside transaction; 409 `VERSION_CONFLICT` with current version in response body if mismatch.

**B2 — Capability provenance**
- Reason: Codex round 2 already caught Imagen capability error; capability registry needs audit trail to prevent re-drift.
- Fix: Every capability entry has `sourceUrl: string` + `verifiedAt: string` (ISO date). Unit test validates both fields are populated and well-formed.

**B3 — Aspect ratio + language source of truth**
- Reason: v2.1 had aspect/language at workflow run body top-level but didn't forbid them in per-workflow `inputSchema` — risk of duplicate fields.
- Fix: Workflow `inputSchema` may NOT declare `aspectRatio` or `language`. Enforced by test `workflow-input-schema.test.ts` scanning every registered workflow. Server-side validation (`POST /workflows/:id/run` precondition 8) rejects requests that put aspect/language inside `input`.

**B4 — Cancel semantics v1**
- Reason: Codex Q2 flagged operational gap — SSE runner has no abort path.
- Fix: `DELETE /api/workflows/runs/:batchId` sets abort flag in `abort-registry`. Runner checks `abortSignal` between iterations and passes it to provider `generate(params.abortSignal)`. Provider SDKs support AbortSignal natively. SSE disconnect triggers abort within 30s (server-side heartbeat detect + flag set). Partial assets remain in DB with valid `batch_id`; batch gets `status='aborted'` + `aborted_at` timestamp.
- v1 explicit limit: **no resume**. Resume adds state-restoration complexity not worth v1 scope.

### POST-V1 DEFERRED (Group C)

**C1 — Tag-filter index strategy**
- v1 implementation: `tags TEXT` column with JSON string + `LIKE '%"tag"%'` scan.
- Performance: acceptable up to ~10k assets. Slow at 100k+.
- Post-v1: add `asset_tags` join table with `(asset_id, tag)` index.

**C2 — DB size monitoring + VACUUM + archive**
- v1 implementation: stats endpoint reports DB size. Warning banner at 500MB. Hard stop (refuse asset inserts) at 2GB.
- Post-v1: auto-VACUUM on schedule; archive tool to export old batches to ZIP + delete from DB.

---

## P0 — Runtime Boundary (v2.0, refined in v2.1/v2.2)

- Backend framework: **Hono** (port 5174)
- Frontend: React + Vite (port 5173, proxy `/api` → 5174)
- Shared core: `src/core/*` — universal types, schemas, pure logic only
- Server-only: `src/server/*` — providers, keys, DB, profile repo, profile assets (renamed from `src/core` in v2.2)
- Key management: Option A — Select Key button, multi-slot per provider (3-5 designed)
- Key storage: AES-256-GCM encrypted file `./data/keys.enc` with scrypt KDF
- Vertex service accounts: separate JSON files `./keys/vertex-{slotId}.json` (gitignored, never leaked to client)
- Key never leaves server: v2.2 enforced by `dto-mapper.ts` per module + `dto-no-paths.test.ts` audit
- Logger redactor: `/AIza[\w-]{35}/`, `/ya29\.[\w-]+/`, `/eyJ[\w-]+\.[\w-]+\.[\w-]+/`
- Server binds `127.0.0.1` only

---

## P1a — Provider Compatibility Matrix (v2.0, refined)

- Hybrid approach: declarative base + per-workflow override with required reason
- UI: grey out incompatible + warning banner
- Server enforcement: `INCOMPATIBLE_WORKFLOW_PROVIDER` at `/api/workflows/:id/run`
- v2.1: `ModelInfo.providerId`, `AspectRatio`/`LanguageCode` union types, runtime-validator
- v2.2: capability provenance (sourceUrl + verifiedAt); Imagen capability corrections

### v1 matrix

| | NB Pro | NB 2 | Imagen 4 |
|---|---|---|---|
| artwork-batch | ✅ | ✅ | ✅ |
| ad-production | ✅ (best) | ✅ | ✅ |
| style-transform | ✅ | ✅ | ❌ no imageEditing |
| aso-screenshots | ✅ (best) | ✅ | ✅ |

---

## P1b — Replay Semantics (v2.0, refined)

- 2 modes: `deterministic` (Imagen + seed + no watermark), `best_effort` (all other)
- Profile snapshot user-selectable per replay
- ReplayClass enum with badges ✓/↻/⊘
- v2.1: API contract synced (`mode: "replay" | "edit"`, `useCurrentProfile: boolean`)
- v2.2: `replay_payload` nullable + `not_replayable` derived; `language` field in payload

---

## P2a — Extraction-First + Anti-Patterns

- 15 rules in CONTRIBUTING.md (unchanged from v2.1)
- v2.2: ESLint + LOC check wired to enforce rules automatically
- Dropped modes: SEXY_ANIME, SUPER_SEXY (not utility-safe)
- Kept: Memory, Cartoon, AI_Art, Festive, Xmas, Baby, Avatar, All_In_One

---

## P2b — Design Tokens

- 4 workflow colors + 6 semantic colors × 5 variants = 50 literal class strings
- `src/core/design/tokens.ts` — universal, imported by client only in practice
- Unit test asserts no `${` interpolation

---

## Global Scope

- Workflows v1: artwork-batch, ad-production, style-transform, aso-screenshots
- Providers v1: Gemini NB Pro, Gemini NB 2, Imagen 4, Mock
- Storage: JSON profiles, SQLite assets, encrypted keys
- CMS: local CRUD on AppProfile
- Timeline: **8-10 weeks active / 10-12 weeks calendar**

---

## Rejected Suggestions (with evidence)

### Codex round 2 — Model ID `gemini-2.5-flash-image` instead of `gemini-3.1-flash-image-preview`

**Rejected.** Verified via https://ai.google.dev/gemini-api/docs/image-generation:

> Nano Banana: The Gemini 2.5 Flash Image model (`gemini-2.5-flash-image`). [gen 1]
> Nano Banana Pro: The Gemini 3 Pro Image Preview model (`gemini-3-pro-image-preview`).
> Nano Banana 2: The Gemini 3.1 Flash Image Preview model (`gemini-3.1-flash-image-preview`).

Three distinct model IDs. Nano Banana 2 is the newest (launched 2026-02-26), 50% cheaper than NB Pro. Pham's choice is correct.

---

---

## Session #27b — Phase 5 Step 5b (PromptLab v1 scope)

**Inline-only diff viewer (side-by-side deferred).** DiffViewer renders a
single prose block with `<del>/<ins>` semantic HTML + `+/−` text markers
for colorblind users. A side-by-side two-pane layout would require scroll
sync + wider breakpoint handling, which is noise for prompt-sized inputs
(typically <500 tokens). Polish backlog.

**Per-asset history only (no cross-profile browser).** `GET /api/assets/
:id/prompt-history` is the single read endpoint in v1. The Q2 schema
lock reserves `profile_id` + `parent_history_id` columns but the Session
#27b writer always sets `parent_history_id = NULL` and no route exposes
`?profileId=`. Tree view + cross-asset history browser deferred to a
polish release when there's a concrete UX for them.

**Legacy asset = edit blocked, replay allowed.** Assets persisted before
Session #27a carry a legacy payload shape (`promptRaw` + primitives, no
`contextSnapshot.profileSnapshot`). The dual-reader still makes them
replayable, but mode=edit rejects with `LEGACY_PAYLOAD_NOT_EDITABLE` —
synthesizing a profileSnapshot from the current profile would silently
drift from the batch-time profile (data corruption by optimism). The
PromptLab entry button ships the verbatim tooltip copy Pham approved.

**negativePrompt universally hidden except on mock.** All real v1
providers (Gemini NB Pro, Gemini NB 2, Imagen 4) register
`supportsNegativePrompt: false` — Imagen 4 dropped the feature in
3.0-generate-002+; Gemini image adapters never supported it. The
PromptEditor reads `model.capability.supportsNegativePrompt` and only
renders the field when true. The backend capability gate
(`CAPABILITY_NOT_SUPPORTED`) stays the authoritative check — the client
hide is a second layer so users don't see an input they can't submit.
The mock model keeps `supportsNegativePrompt: true` so unit + integration
tests can exercise both the happy edit path and the capability gate.

**Edit-only history log.** `prompt_history` rows are created exclusively
when `mode=edit` (overridePayload present). Pure replays (mode=replay)
skip the log — they produce deterministic (or best-effort) duplicates
of the source, not distinct iterations. This keeps the PromptLab sidebar
focused on the edit lineage and avoids cluttering it with byte-identical
replays. Unit + integration tests enforce both sides of the boundary.

**Prefill is a hint, not a clobber.** Clicking a history entry in the
PromptLab sidebar shows a dismissible prefill hint below the editor
instead of overwriting the textarea contents. Two reasons: (1) the user
may have in-flight edits they'd lose to a click-to-load; (2) the textarea
is a controlled React input and a programmatic value write would fight
the user's next keystroke. The hint pattern lets the user manually copy/
paste, keeping intent explicit.

**`EDIT_REQUIRES_PROMPT` dropped.** The ErrorCode literal survived
Session #27a as dead code (no emit site). Session #27b removes it from
the union; the grep-for-dead-code audit catches this class of drift.
Listed here so future greps on the name return the rationale, not just
the absence.

---

## Session #28a — Phase 5 Step 3a (AssetListFilter backend)

**Plural CSV wire contract with legacy singular back-compat.** `GET /api/
assets` accepts plural CSV params (`profileIds=a,b,c`, `workflowIds=…`,
`tags=…`, `providerIds=…`, `modelIds=…`, `replayClasses=…`) as the v1
contract. The legacy singular `?profileId=X` / `?workflowId=Y` keep
parsing for backward compat — `AssetListFilterSchema.transform()` merges
them into the plural array via `mergeLegacy()` (plural wins when both
are provided). Rationale: Gallery calls and the 15 existing integration
tests that use singular params keep working untouched, and the pre-
Session-#29 frontend won't regress when the UI is still on the old
`AssetFilterBar` card.

**Tag filter stays on the JSON `tags TEXT` column (LIKE scan).** Bro's
pre-code clarification confirmed DECISIONS §C1 still holds — no
`asset_tags` JOIN table in Session #28a. OR mode = `(tags LIKE ? OR
tags LIKE ?)`, AND mode = same shape joined with AND. Params encode the
JSON string fragment (`%"tag"%`) so a literal `"tag"` inside the JSON
array matches. Backslash + double-quote escape on each tag value (`%`
and `_` intentionally pass through — v1 tags are UI-driven + short;
revisit if free-text tag input with SQL-wildcard characters lands).
When dogfood surfaces filter pain at >10k assets, migrate to the
`asset_tags` JOIN table (post-v1 work per §C1).

**`batchId` stays singular.** All other filter dimensions went plural
for multi-select UI, but exact-batch-match has no set semantics — the
batchId deep-link from Workflow → Gallery is one batch per link. Plural
batchIds would be dead weight in v1.

**`totalCount` skipped from the response.** `GET /api/assets` keeps the
existing `{ assets, limit, offset }` shape — no `totalCount` field. The
Session #29 empty state UI derives from `assets.length === 0 && filter-
is-active`, not a count. Adding totalCount = one extra `COUNT(*)` query
per fetch + wire-shape change. Session #30+ can add it when
paginated-list UX needs "X of Y" strings.

**Cursor-based pagination deferred to Session #30+.** Session #28 bro-
initial spec called for base64-encoded `{createdAt, id}` cursor
pagination, but that's a breaking change to the existing offset/limit
contract (consumers: Gallery `useAssets`, Workflow batchId filter,
all 15 assets-routes integration tests + every other caller passing
offsets). Bro confirmed switching-cost analysis → cursor migration
isolated as its own session. 28a keeps offset/limit. Inline TODO
marker in `@/core/schemas/asset-list-filter` header.

**Path layout locked.** Schema lives at
`@/core/schemas/asset-list-filter` (universal, client-safe), query
builder at `@/server/asset-store/asset-list-query` (alongside the
existing asset-repo, not a new `src/server/assets/` directory), and
the client `useAssets` hook stays inline in `src/client/api/hooks.ts`
(no new `src/client/hooks/` directory). Matches the existing barrel
conventions; no reorganization churn.

**`EDIT_FIELD_NOT_ALLOWED` pattern carried over.** The Session #27a
error-code hierarchy (`MALFORMED_PAYLOAD` / `EDIT_FIELD_NOT_ALLOWED` /
`CAPABILITY_NOT_SUPPORTED` / `LEGACY_PAYLOAD_NOT_EDITABLE`) is unrelated
to filter validation — filter errors surface as generic `BAD_REQUEST`
with the Zod `issues` array. Kept the 27a vocabulary focused on the
replay/edit pipeline.

---

## §D — Filter empty-state semantics (Session #29 addendum)

**`replayClasses` wire shape preserves present-but-empty.** Session #29
Q-29.E picked option b: UI "0 of 3 checkboxes selected" must round-trip
to the server as a distinct state from "absent". Rationale: UI 0/3 is
an honest user intent ("show me nothing in these classes"), and
client-side `[]` → silently treating as `undefined` would lie about
the filter on the URL + break back-button reproducibility.

Implementation:

- **Schema helper** `csvArrayPreserveEmpty<T>` in
  `src/core/schemas/asset-list-filter.ts`. Unlike the sibling
  `csvArray`, it does NOT collapse `""` → `undefined` — instead:
  `undefined` → `undefined`, `""` → `[]`, CSV string → `string[]`.
  Applied **only** to `replayClasses`; every other plural field
  (`profileIds` / `workflowIds` / `tags` / `providerIds` / `modelIds`)
  keeps the empty-collapses-to-undefined behavior, because their UIs
  don't have a meaningful "present-but-empty" state (unchecking all
  providers = no provider filter, not "match no providers").
- **Query builder** `buildAssetListQuery` branches on
  `filter.replayClasses === []` → emits `WHERE … AND 1 = 0` so the
  query returns zero rows. Non-empty array path unchanged
  (`replay_class IN (?, ?, …)`).
- **Wire contract** `?replayClasses=` (key present, value empty) =
  match-none; `?replayClasses=deterministic,best_effort` = subset; key
  absent = no filter (all-3-on equivalent). UI collapses all-3-checked
  back to `undefined` so the URL stays clean in the common case.

This pattern is **not** extended to other plural fields. If a future
filter gains a similar "0 of N selected" UI (e.g. workflow opt-out),
re-apply `csvArrayPreserveEmpty` on a per-field basis; don't flip the
base `csvArray` behavior (existing clients rely on empty-CSV = absent
for tags + profileIds + friends).

**Chips render in specificity order, not card-position.** Session #29
Q-29.A pushback from bro. The `AssetFilterChips` summary row orders
dimensions by how narrowly they constrain the result-set, not by where
the controls appear on the bar: `batch → profile → workflow → tags →
replayClass → provider → model → date`. Stored as a static
`CHIP_ORDER` array in `AssetFilterChips.tsx` — easy to tweak post-
dogfood. Click-to-edit (the chip body scrolls + flashes + focuses its
matching bar section) carries the spatial-mapping affordance, so
positional parity isn't needed.

**URL encoding: per-value `encodeURIComponent` + un-escaped comma
separators.** Session #29 Q-29.C. `?tags=sunset,neon` stays readable
in the browser address bar, unicode + spaces + slashes in individual
values are safely percent-encoded, commas between values remain
literal. The tag input forbids commas in values (comma is a chip
delimiter) so the round-trip is lossless. Pattern applies uniformly
to every plural field (`profileIds`, `workflowIds`, `providerIds`,
`modelIds`, `replayClasses`).

---

## §E — Profile CMS v1 semantics (Session #30 addendum)

**Optimistic concurrency UI deferred to v2 migration session.** Session
#30 opening audit confirmed `AppProfileSchema.version = z.literal(1)`
(`src/core/schemas/app-profile.ts:33`), meaning the version field never
bumps on mutation and the 409 `VERSION_CONFLICT` flow is **unreachable
under v1**. Two tabs editing the same profile both send
`expectedVersion: 1` → server check passes → silent last-write-wins.
The 409 can only fire if a client fabricates `expectedVersion` (e.g.
0 or 2).

Bro initially authored Q-30.E as "preserve user edits on 409 + warning
banner + last-write-wins semantic documented". After audit, F1 was
reversed: v1 ships a simplified path (warning toast + refetch on 409,
LWW otherwise) and the preserve-edits UI is deferred to the dedicated
v2 migration session — matching the Session #27a RATE_LIMIT deferral
pattern (CF #6) where unreachable-under-current-schema flows are
postponed until the schema change brings them into scope.

Implementation:
- `src/client/api/profile-hooks.ts describeSaveFailure` maps 409 →
  `{message: "Profile modified elsewhere. Refreshing.", variant:
  "warning"}`.
- `src/client/pages/ProfileEdit.tsx handleSave` bumps `refreshKey` on
  409, which triggers `useProfileDetail` to refetch and reseed form
  state (losing any dirty edits — documented in the deferred
  preserve-edits flow).
- The server contract (`src/server/routes/profiles.ts:142-157`)
  remains unchanged — it already emits the `{error:
  "VERSION_CONFLICT", currentVersion, expectedVersion}` body shape
  that a future v2-aware editor can consume for 3-way merge or
  preserve-edits rendering.

**Profile id is the slug; no separate slug field.** Audit confirmed
no `slug` in `AppProfileSchema`. Server auto-derives `id` via
`slugify(body.name)` (or `shortId("profile", 8)` fallback if name
slugs to empty) when `body.id` is absent on POST. Id is immutable
after create — URL uses id, UI displays name. No slug editor, no
lock affordance, no "edit slug" warning. Q-30.F dropped entirely.
VN diacritic handling is preserved (`id.ts slugify` maps `đ/Đ → d/D`
explicitly; NFKD-decomposition strips other diacritics).

**Clone-to-draft: client-side prefill, assets cleared.** Q-30.C
pushback rationale: immediate-save duplicates create orphans when
users abandon the editor + bypass naming review. Client-side draft
flow: `cloneProfileToDraft(source)` returns a `ProfileCreateInput`
with `name: "${source.name} (Copy)"`, cleared assets, and deep-cloned
arrays (`doList`, `dontList`, `competitors`, `features`,
`keyScenarios`, `forbiddenContent`). `navigator.go("profile-edit",
{initialProfile: clone})` opens the editor in create-mode with the
prefill. Save → POST (no id) → server slugifies new name → new id.

Assets are cleared (not shared) because profile-asset rows carry a
single `profileId` FK (`src/server/asset-store` repo). Cloning asset
IDs would put the owning `profileId` on the original — delete of the
original then hits HAS_ASSETS guard pointing at rows that *visually*
belong to the clone, and deleting the clone cascades to files the
original still renders. Weak referential integrity is a v1 constraint;
revisit if asset-sharing becomes a real use case.

**Client-side export envelope + filename.** Q-30.D picked client-side
wrap using the already-fetched `ProfileDto` (or a fresh `GET
/api/profiles/:id` for Profiles list row actions). Envelope:

```json
{
  "schemaVersion": 1,
  "profile": { ...ProfileDto... },
  "notes": "Asset IDs reference binary files not included. Re-upload assets after import."
}
```

Filename: `${slugify(profile.name) || profile.id}.profile.json`.
Pretty-printed (2-space indent). Backend endpoint `GET
/api/profiles/:id/export` (`src/server/routes/profiles.ts:116-122`)
is unused post-#30 — deprecation deferred to the next backend-touching
session so the removal isn't an isolated backend commit. Import is
**not** implemented in v1 (notes field explicitly warns re: binary
asset gap); sibling to Phase 5+ polish.

**F6 Delete dialog = state machine, not simple confirm.** Original
bro spec was a confirm dialog. F6 upgraded it mid-audit after noting
the backend already emits a rich 409 `PROFILE_HAS_ASSETS` body with
`assetCount`. State machine:

```
confirm  ──(click Delete)──▶  busy
busy     ──(204)──────────▶   (close + refresh list)
busy     ──(409 HAS_ASSETS)─▶ blocked { assetCount, message }
busy     ──(other error)───▶  confirm { error }
blocked  ──(View Gallery)──▶  gallery?profileIds={id}  (close)
blocked  ──(Close)─────────▶  (close, profile kept)
```

The blocked state is explicit UX improvement over a generic error
toast: it tells the user *why* deletion failed + offers the concrete
next step (remove the assets first) + a one-click deep-link to the
gallery already filtered to that profile. Rationale: delete is
irreversible and the HAS_ASSETS guard is a frequent-enough block at
real-profile scale that a dedicated dialog beats a toast the user
must re-read.

`/api/profiles/:id` DELETE response bypasses the error-handler
envelope (profiles.ts:163-183 header comment, Session #13 Q2) —
client uses raw `fetch` in `deleteProfile` rather than the typed
`apiDelete` so `assetCount` isn't lost in the `ApiError` type-cast
(which expects `{code, message}` and drops the `{error,
assetCount}` shape the route actually emits).

**Assets section is out-of-band from the form's Save button.** Upload
(`POST /api/profiles/:id/upload-asset`) mutates the profile server-
side (`touchUpdatedAt: true` + mutates `appLogoAssetId` /
`storeBadgeAssetId` / `screenshotAssetIds`). Delete requires both
`DELETE /api/profile-assets/:id` + a follow-up `PUT
/api/profiles/:id` to null the reference (backend mergeUpdate replaces
assets entirely). Rather than coupling this two-step mutation to the
form's Save, the AssetsSection owns its own network workflow and
calls `onChanged` to bump the page's `refreshKey` — `useProfileDetail`
refetches, form state re-seeds from the new DTO, and the Save button
sends the form's identity/visual/positioning/context slice **without**
touching `assets` in the PUT body (server keeps whatever assets are
currently on disk). Create-mode renders an Assets placeholder since
the upload endpoint targets `:id` which doesn't exist yet.

---

## §F — Session #31 (Phase 5 Step 6 — AppProfileSchema v2 migration + preserve-edits-on-409)

**F.1 — Migration pattern: on-read via `z.union` + `.transform`.
Rejected in-place-on-write.** Bro pushback on the handoff's in-place
recommendation. Four reasons against in-place-on-write:

1. *Fragments disk state* — v1 + v2 coexist indefinitely until every
   profile is individually saved, yielding mixed-version on-disk state
   that's easy to mistake for data loss.
2. *Assumes additive-only changes* — breaks the first time v3 renames
   or removes a field (in-place can only set defaults, not translate).
3. *Boot-time shape check masks real bugs* — a v1-shaped file passes
   the v2 schema if v2 happens to be a superset; no signal that a
   migration is needed.
4. *Consumer code stays bilingual forever* — every read site must
   handle both shapes until the last save touches the last file, which
   may never happen.

Accepted pattern (`src/core/schemas/app-profile.ts`):

```ts
const ProfileBodyFields = z.object({ /* shape minus version */ })
const V1Schema = ProfileBodyFields.extend({ version: z.literal(1) })
const V2Schema = ProfileBodyFields.extend({ version: z.number().int().min(1) })

function migrateToV2(parsed: V1 | V2): V2 { /* transform */ }

export const AppProfileSchema = z.union([V1Schema, V2Schema]).transform(migrateToV2)
export type AppProfile = z.output<typeof AppProfileSchema>
```

Rules for extending to v3+:

- Add `V3Schema` branch to the union.
- Extend `migrateToV2` → `migrateToV3` chain (or compose
  `migrateV1ToV2` + `migrateV2ToV3`). Each migration step
  unidirectional (forward only).
- Consumers import `AppProfile` = latest output type; never see v1/v2.
- Run `scripts/migrate-profiles-v1-to-v2.ts` (rename per version
  bump) as a one-off to converge on-disk state. Idempotent — safe to
  re-run.

**F.2 — v2a minimal scope: pure version type widening.** Q-31.C.1
locked "v2a" over "v2b" (which would add an explicit `schemaVersion`
field separate from the OC counter). v2a means:

- V1 `version: z.literal(1)`, V2 `version: z.number().int().min(1)`.
- Transform is **identity** (`parsed as V2`) — v1's `1` already
  satisfies v2's number check; no field added or renamed.
- On-disk v1 files stay as-is until next PUT bumps them; migration
  script is effectively a validation pass for v2a.
- Test case #6 from bro's Q-31.C spec ("migration fn sets defaults for
  v2-only required fields") is a comment placeholder in
  `tests/unit/app-profile-migration.test.ts`; activates when v3 adds
  a required field.

Rationale for v2a over v2b: handoff scope explicitly said "no shape
change". v2a stays inside that scope while establishing the v3+
pattern. v2b's `schemaVersion` vs OC `version` separation is cleaner
long-term but expands surface now for no immediate gain.

**F.3 — Version bump location: PUT route, not saver.** `saveProfile`
stays storage-neutral: writes whatever the caller passes (create
passes `version: 1`, import echoes, PUT passes `existing.version +
1`). The alternative (bump inside saver with a `bumpVersion: boolean`
option) couples storage to OC lifecycle; route-level bump keeps the
concerns separate.

Saver change scope for v2: zero. Route change scope: one line +
comment.

**F.3.1 — 409 body augmentation: keep legacy flat shape, add
`code` + `details`.** Existing tests + docs assert the flat
`{error: "VERSION_CONFLICT", currentVersion, expectedVersion}`
shape that bypasses the error-handler envelope (see Session #13 Q1
at `profiles.ts:6-12`). Client `ApiError` reads
`{code, message, details?}`, so `currentVersion` was lost on the
wire pre-v2. Augmented shape:

```json
{
  "error": "VERSION_CONFLICT",
  "code": "VERSION_CONFLICT",
  "message": "...",
  "currentVersion": N,
  "expectedVersion": M,
  "details": { "currentVersion": N, "expectedVersion": M }
}
```

Redundant but non-breaking: existing tests pass, new `ApiError.details.currentVersion`
client read path works. Same augmentation applied to
`/api/profile-assets/:id` 409 body for consistency.

**F.4 — Preserve-edits-on-409 state machine: non-dismissible banner +
discard-with-confirm.** Reopens the F1 flow deferred in Session #30
(unreachable under `version: z.literal(1)`, now reachable under v2
OC). Locked copy (Q-31.D):

- Banner: *"This profile was updated on the server. Your edits are
  preserved. Saving will overwrite the server's version."*
- Toast (on 409 intercept): *"Remote updated — reloaded latest, your
  edits kept."*
- Save button label swap: `"Save"` → `"Overwrite & Save"` while
  banner is visible.
- Discard CTA in banner: `"Discard my edits"` → native
  `window.confirm("Discard your unsaved edits? This cannot be
  undone.")` → revert + hide banner.

State machine:

```
saved           → banner hidden
409 conflict    → banner shown + edits preserved + remoteVersion updated
overwrite save  → 2xx → banner hidden (back to saved)
discard edits   → confirm → revert form to refetched remote → banner hidden
```

Not-dismissible rationale: the only legitimate resolutions are
Overwrite or Discard. A dismiss-X button leaves the UI in a confusing
"edits kept but banner gone" state that re-triggers the same 409 on
next save with no visual warning.

Navigation with banner + dirty state reuses the existing unsaved-
changes guard (Q-30.A pattern): `navigator.registerGuard` +
`beforeunload`. No new nav UX required.

**F.5 — Test coverage anchored for v3+.** Five union-schema unit
tests (v1 valid / v2 valid / v1 invalid / v2 invalid / unknown
version rejected) + one real-409 integration test (two concurrent
PUTs with refetch + Overwrite-Save + version bump assertion) +
Preview MCP UI smoke of the conflict banner flow. Future v3 session
extends: add V3Schema branch test + rename/default-field transform
tests (the comment placeholder in `app-profile-migration.test.ts`
activates here).

---

*Last updated: 2026-04-24 with Session #31 (Phase 5 Step 6 —
AppProfileSchema v2 migration via z.union + transform;
preserve-edits-on-409 UI re-opened from Session #30 F1 defer).*
*Status: Phase 5 all steps closed (1/2/3/4/5a/5b/6). Phase 5 polish
backlog remains (CF #10-27 in HANDOFF-SESSION32.md).*
