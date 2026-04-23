# Session #27b Handoff — Phase 5 Step 5b (PromptLab UI)

Paste at the start of Session #27b to resume cleanly on any PC.

---

## Where we stopped (end of Session #27a — 2026-04-24)

- **Phase 5 Step 5a shipped ✅** (backend-only).
  - Canonical payload migration across all 4 asset-writers. Workflow-specific
    fields (`layoutId`, `copyKey`, `featureFocus`, `variantIndex`, `targetLang`,
    `sourceAssetId`, `styleDnaKey`, `serial`) dropped from `replayPayload`
    (they stay in `inputParams` — audited).
  - Dual-reader (`replay-payload-reader.ts`) accepts both canonical + pre-
    Session-#27 legacy shape. 105 live legacy rows on bro's home PC stay
    replayable.
  - `POST /api/assets/:id/replay` supports `mode=edit` + `overridePayload`
    (strict allowlist: `prompt` | `addWatermark` | `negativePrompt`).
  - 3 new error codes: `EDIT_FIELD_NOT_ALLOWED` / `CAPABILITY_NOT_SUPPORTED` /
    `LEGACY_PAYLOAD_NOT_EDITABLE` + `MALFORMED_PAYLOAD` (500).
  - `AssetDto.editable: { canEdit, reason? }` computed on-the-fly in
    `toAssetDto`. `canEdit = false` on not_replayable OR legacy payload;
    `reason: "legacy_payload"` set only for the legacy case.
- **Regression: 546/557** (+11 net vs Session #26's 535, +1 todo).
- **Git tree:** clean + pushed to `origin/main` after 27a commit.
- Working directory on home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -3   # expect the Session #27a feat+docs commits at top

npm install
npm run regression:full    # expect 546 pass + 10 skipped + 1 todo
```

Windows Node 20 workaround unchanged from Session #27 handoff (see
`HANDOFF-SESSION27.md` for the powershell PATH prefix).

## Session #27b target — Phase 5 Step 5b (PromptLab UI)

**Goal:** Ship the PromptLab page + entry points. All backend contracts are
in place from 27a — client builds on top of them with no new server work
expected.

### Backend contracts available (no new server work expected)

- `POST /api/assets/:id/replay`:
  - `{ mode: "replay" }` — pure replay (existing).
  - `{ mode: "edit", overridePayload: { prompt?, addWatermark?, negativePrompt? } }`
    — edit-and-replay. At least one override field required.
  - Error surface: 400 `EDIT_FIELD_NOT_ALLOWED` / 400 `CAPABILITY_NOT_SUPPORTED`
    / 400 `LEGACY_PAYLOAD_NOT_EDITABLE` / 400 Zod refine / 500
    `MALFORMED_PAYLOAD` (unreachable in normal flows).
- `GET /api/assets/:id/replay-class` — unchanged. Probe payload still
  drives `replayClass` + `reason` + `estimatedCostUsd`.
- `AssetDto.editable: { canEdit: boolean, reason?: "legacy_payload" }` —
  gates the PromptLab `[Edit & replay]` button.

### UI deliverables (~3h, split into sub-tasks)

1. **`prompt_history` SQLite table** (per Session #27 Q2 frozen schema):
   - `scripts/migrations/2026-04-24-prompt-history.sql` — new migration.
   - Columns: `id` (ph_xxx) / `asset_id` (FK SET NULL) / `result_asset_id`
     (FK SET NULL) / `parent_history_id` (FK SET NULL, graceful lineage
     break) / `profile_id` / `prompt_raw` / `override_params` (JSON) /
     `created_at` / `created_by_session` / `status` (pending|complete|
     failed|cancelled) / `cost_usd` (REAL, denormalized) / `error_message`.
   - Indexes: `asset_id`, `profile_id`, `created_at DESC`, partial on
     `status WHERE status != 'complete'`.
   - `src/server/asset-store/prompt-history-repo.ts` — CRUD.
   - `src/server/routes/prompt-history.ts` — `GET /api/assets/:id/prompt-history`
     + `GET /api/prompt-history?profileId=...` (optional v1).
2. **PromptLab page** (`/prompt-lab?assetId=ast_xxx`):
   - Left column — source asset thumbnail + read-only metadata
     (provider, model, seed, aspect, replayClass badge from existing
     `ReplayBadge` component).
   - Middle column — **editable prompt textarea** + **override params
     panel** (checkbox for `addWatermark`, optional text for
     `negativePrompt` — hide field universally for v1 since all real
     providers register `supportsNegativePrompt: false`; keep code path
     live for future — add a DECISIONS.md note).
   - Right column — **DiffViewer** (word-level inline diff — red `<del>`
     strikethrough + green `<ins>` with semantic HTML + aria-label).
     Hand-roll in `src/client/utils/diff-words.ts` (LCS + regex
     tokenization, zero new deps).
   - Below — **expected replayClass preview** via existing
     `computeReplayClass` (pure, client-consumable via static registry).
     Recompute on `addWatermark` toggle only, NOT on keystroke (avoids
     thrashing).
   - Bottom bar — `[Run edit]` (disabled when prompt unchanged)
     + `[Reset]` + `[Cancel]`.
3. **PromptHistory sidebar** on the PromptLab page — list of prior
   iterations for this asset; click → populate textarea (non-destructive).
4. **Entry points**:
   - `AssetDetailModal` — new `[Edit & replay]` button next to the
     existing `Replay` button. Secondary styling (slate-800 outline).
     - Disabled + tooltip per Q4 override when any of:
       - `editable.canEdit === false` (legacy payload or not_replayable)
       - tooltip copy: if `editable.reason === "legacy_payload"` →
         "This asset predates edit & replay. Create a new batch."; if
         `replayClass === "not_replayable"` → reuse the existing
         not-replayable tooltip text.
     - Priority: `replayClass === "not_replayable"` tooltip wins over
       legacy-payload tooltip (per Q6 Refinement 2 locking).
5. **Seed preservation** (per Q6 Refinement 2): seed is readonly in
   PromptLab v1. Edit mode carries source seed through unchanged. Standalone
   "fresh composition" entry (no `assetId` in URL) is deferred to Phase 5
   polish per Q5.

### Carry-forward from Session #27a

1. **HTTP capability test** (`it.todo` in `edit-and-run.test.ts`) — needs
   active Vertex/Gemini key to exercise the 400 `CAPABILITY_NOT_SUPPORTED`
   through the full HTTP stack. Defer until 27b or later.
2. **`EDIT_REQUIRES_PROMPT` ErrorCode unused** — leftover placeholder in
   `errors.ts`. Safe cleanup, out of 27b scope.
3. **Legacy profileSnapshot reconstruction** — 27b decision on whether to
   show legacy assets in PromptLab at all. Current behavior: button
   disabled with tooltip.
4. **`replay-service.ts` 251 LOC** — past soft-cap by 1. If 27b extends
   the service, split `applyOverride` to `replay-override.ts`.
5. **Visual UI smoke for Step 2** — still pending from Session #26. Bro
   to run golden-path smoke.
6. **Phase 5 Step 3 — Gallery enhancements** (tags + date + provider +
   model + replayClass filters) — still pending, not scheduled yet.

### Step 5b LOC estimate (rough)

| File | Change | LOC |
|---|---|---|
| `scripts/migrations/2026-04-24-prompt-history.sql` | new | ~30 |
| `src/server/asset-store/prompt-history-repo.ts` | new | ~100 |
| `src/server/routes/prompt-history.ts` | new | ~60 |
| `src/core/dto/prompt-history-dto.ts` | new | ~40 |
| `src/server/app.ts` | route wire | ~5 |
| `src/client/pages/PromptLab.tsx` | new main page | ~220 |
| `src/client/components/PromptEditor.tsx` | new | ~120 |
| `src/client/components/DiffViewer.tsx` | new | ~80 |
| `src/client/utils/diff-words.ts` | new pure diff | ~60 |
| `src/client/utils/use-prompt-history.ts` | new hook | ~70 |
| `src/client/components/ReplaySection.tsx` | `[Edit & replay]` button | ~30 |
| `src/client/navigator.ts` + `App.tsx` | route | ~15 |
| tests | unit + integration | ~220 |

Total ~1050 LOC src + tests. Plan file splits up-front — PromptLab.tsx
will crowd 250 LOC; extract child components early.

### Working style (unchanged)

- Bro is called **bro**. Bilingual VN/EN fine; short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 content LOC hard cap per src file (250 soft, 300 fail). Plan file
  splits up-front.
- Pin exact versions (no `^`). No new deps without asking.
- Live smoke run = billable action — confirm budget with bro before
  invoking (not expected for 27b — UI only).

### Hot-button gotchas carried from Step 5a

1. **Replay sub-router mount order** — same pattern applies to any new
   sub-route on `/api/assets`. If `createPromptHistoryRoute()` mounts on
   `/api/assets/:id/prompt-history`, it must register BEFORE
   `createAssetsRoute()`.
2. **Test profile fixtures must use 6-digit hex** — `AppProfileSchema`
   requires `/^#[0-9a-f]{6}$/i`. The writer's `ReplayPayloadSchema.parse()`
   now cascades into full profile validation. 3 workflow test files
   already fixed in 27a; any new PromptLab tests must follow suit.
3. **`AssetDto.editable` is required, not optional** — breaking change
   from Session #26. Any new DTO consumers / snapshot tests that deep-
   equal the shape will break on the new field; add `editable: { canEdit:
   true }` or similar to fixtures.

## Session #27b estimate

**2.5-3h for full Step 5b landing** assuming scope Qs in this doc are
pre-aligned. If migration + history-repo + routes tie in first as a
self-contained backend commit, the UI layer can follow cleanly.

---

*Session #27a closed 2026-04-24 — Phase 5 Step 5a CLOSED. Next: Phase 5
Step 5b (PromptLab UI). Handoff file = `HANDOFF-SESSION27b.md` (this file).*
