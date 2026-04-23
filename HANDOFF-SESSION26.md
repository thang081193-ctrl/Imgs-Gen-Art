# Session #26 Handoff — Phase 5 Step 2 (Replay UI)

Paste this at the start of Session #26 to resume cleanly on any PC.

---

## Where we stopped (end of Session #25)

- **Phase 5 Step 1 shipped ✅.** Replay API (`POST /api/assets/:id/replay` SSE + `GET /:id/replay-class` probe) backed by a generic workflow-agnostic replay-service. New batch linkage via `batches.replay_of_batch_id + replay_of_asset_id`. 517/517 full regression (up from 497 at Phase 4 close — +19 net new tests after absorbing 1 replaced Phase 3 guard).
- Latest commits (pushed to `origin/main`):
  - `8d6075a` **docs: Phase 5 Step 1 close — PHASE-STATUS Session #25**
  - `4e0ce50` **feat(replay): Phase 5 Step 1 — Replay API**
  - `4eaef86` chore(deps): remove unused @google-cloud/vertexai
- **Git tree: clean + pushed** to `https://github.com/thang081193-ctrl/Imgs-Gen-Art.git`. `git pull origin main` gets you to exactly where we stopped.
- Working directory on home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -3   # expect 8d6075a at top

# Baseline — must pass before Step 2 work
npm install            # if first pull / dep change
npm run regression:full    # expect 517 pass + 10 skipped (live tests, no creds)
```

### Windows Node 20 gotcha (Pham's home PC — memory `node_toolchain.md`)

fnm multishell PATH **does NOT propagate into cmd.exe subshells** that npm spawns for scripts. `better-sqlite3@11.7.2` has Node 20 prebuilts only (NODE_MODULE_VERSION 115) — running under Node 24 fails with ABI mismatch. Working fix:

```bash
powershell.exe -Command '$env:PATH = "C:\Users\Thang Dep Dai\AppData\Roaming\fnm\node-versions\v20.20.2\installation;" + $env:PATH; npm run regression:full'
```

If `build/Release/better_sqlite3.node` is missing after `npm install`, manually fetch the prebuilt from within the package dir: `cd node_modules/better-sqlite3 && "$(which node)" ../prebuild-install/bin.js`.

Likely a non-issue on the office PC (clean Node 20 install assumed).

## Secrets / credentials state

Unchanged from Session #25:
- Vertex SA JSON at `.secrets/vertex-sa.json` on home PC. Gitignored. Required for `npm run test:live:smoke-all` + browser E2E against real Vertex (optional for Step 2 — Mock works fine for UI wiring).
- `GEMINI_API_KEY` still NOT provisioned. Not a blocker for Step 2.
- `data/keys.enc` seeded with one encrypted real Vertex slot — harmless.

## Source-of-truth read order (Session #26 kickoff)

1. **`PHASE-STATUS.md`** — Session #25 entry at top. Includes carry-forward list + flake note.
2. **`HANDOFF-SESSION25.md` §Phase 5 deliverables + §scope Q2** — Q2 answered bro's spec for Replay button text variant by replayClass + tooltip copy. Pre-approved by bro, code target for Step 2.
3. **`PLAN-v2.2.1.md` §8 + §9** — Replay UX contract + Gallery tile wiring.
4. **`src/client/components/AssetDetailModal.tsx`** + **`src/client/pages/Gallery.tsx`** — primary touch sites for Step 2. Bro's Q2 decision: button primary in asset-detail modal, badge chip in Gallery tile.
5. **`src/server/routes/replay.ts`** — the API contract the UI will consume.
6. **`CONTRIBUTING.md`** — 15 anti-pattern rules; ESLint-enforced.

## Phase 5 deliverables (per PLAN §10 — updated after Step 1)

| # | Deliverable | Status |
|---|---|---|
| 1 | **Replay API** | ✅ Session #25 |
| 2 | **Replay UI** — modal button + gallery badge chip | ← **Session #26 target** |
| 3 | Gallery enhancements — tags + date + provider + model + replayClass filters | pending |
| 4 | Profile CMS — full CRUD UI | pending |
| 5 | PromptLab — dedicated page + history (SQLite `prompt_history` table) + diff viewer | pending |
| 6 | AppProfileSchema v2 migration — trigger-driven | defer until blocked |

Order per bro's Session #25 pre-alignment: **1 → 2 → 5 → 4 → 6 → 3** (Gallery filters in Phase 5 Step 3 now that tags promoted to core).

## Session #26 target — Phase 5 Step 2 (Replay UI)

**Goal:** Wire the existing Replay API into the Gallery UX per bro's Session #25 Q2 refinement.

### Contract with back-end (already shipped, do NOT modify)

```
POST /api/assets/:assetId/replay
  body: { mode?: "replay" }   (v1; "edit" returns 501 until canonical payload lands)
  200 SSE: started → image_generated → complete
  400: BAD_REQUEST (no payload / not_replayable / shape fail)
  401: NO_ACTIVE_KEY
  404: NOT_FOUND
  501: NOT_IMPLEMENTED (mode="edit")

GET /api/assets/:assetId/replay-class
  200: { assetId, replayClass, providerId, modelId, estimatedCostUsd, workflowId }
  400/401/404 same as above
```

### UI deliverables (Q2-approved)

1. **Asset detail modal — primary Replay button:**
   - Text varies by `replayClass`:
     - `deterministic` → `"Replay (exact) · $X.XX"`
     - `best_effort` → `"Replay (approximate) · $X.XX"`
     - `not_replayable` → hidden OR disabled with tooltip (bro's call on modal open)
   - Click flow: call `POST /replay` → toast → navigate to Gallery filtered by the new `batchId` (or to the new asset detail).
   - Cost: fetch via `GET /replay-class` on modal open; cache per asset.

2. **Gallery tile — badge chip (no button at tile level):**
   - Render from `asset.replayClass` already on the AssetDto (no extra API call).
   - Tooltips (approved verbatim in Q2):
     - `DET` → `"Deterministic replay — same seed produces identical bytes"`
     - `APX` → `"Approximate replay — similar but not identical"`
     - `—` → `"Cannot replay — watermark applied or seed missing"`
   - Colors per existing design tokens (Q2 bonus C): deterministic→success (green), best_effort→warning (yellow), not_replayable→neutral/muted.

3. **Gallery replayed-from linkage (tiny visual):** when `asset.replayedFromAssetId != null`, show a small "↩ replay of ast_xxx" chip on the tile. Clickable → source asset detail. Defer full replay-tree UI to Step 5 (PromptLab).

### Step 2 scope Qs for bro (BEFORE coding)

**Q1 — SSE consumption path.** Reuse `src/client/api/hooks.ts` `useWorkflowRun` (Session #16), or dedicated `useReplay` hook?
  Rec: **dedicated `useReplay`** — keeps event handling identical but decouples from workflow-specific types (replay never emits `concept_generated`). ~40 LOC, mirrors existing pattern.

**Q2 — Post-replay navigation.** After replay completes, should the UI:
  (a) stay in modal, show "replayed asset: ast_xxx" + link, OR
  (b) auto-navigate to Gallery filtered by the new `batchId`, OR
  (c) open the new asset detail modal replacing the old?
  Rec: **(a)** — least surprising, shows both originals + new side-by-side inside modal. User clicks "Open in Gallery" if they want filter view.

**Q3 — `not_replayable` button state.** Hidden or disabled-with-tooltip?
  Rec: **disabled-with-tooltip** — more discoverable (user knows replay is a thing but learns why this one can't).

**Q4 — Cost caching across asset modal opens.** The `/replay-class` call has a tiny cost (probe + preconditions). Cache per-asset across modal opens in the session?
  Rec: **yes, React Query default (5 min staleTime)** — refresh on mutation or explicit refetch.

**Q5 — Replay failure UX.** SSE returns `error` event mid-stream; the back-end still emits a final `complete` with empty assets. Surface:
  (a) modal toast "Replay failed — <message>", keep modal open, OR
  (b) modal dialog with "Retry / Cancel"?
  Rec: **(a)** — matches existing workflow run error UX (Session #12 dispatcher). Retry = click Replay button again.

## Step 2 LOC estimate

| File | Change | Rough LOC |
|---|---|---|
| `src/client/api/hooks.ts` (or new `hooks/replay.ts`) | `useReplay` + `useReplayClass` | ~60 |
| `src/client/components/AssetDetailModal.tsx` | Button + cost label + flow | ~80 |
| `src/client/components/AssetThumbnail.tsx` (or new `ReplayBadge.tsx`) | Badge chip + tooltip | ~50 |
| `src/client/pages/Gallery.tsx` | Wire replayed-from chip | ~20 |
| `tests/unit/...` | Component tests if jsdom available | varies |

Total ~210 src LOC. Well under hard cap per file.

## Phase 5 Step 1 carry-forward (from Session #25 PHASE-STATUS)

1. **Canonical replay payload migration** — 4 workflow asset-writers still emit simplified Session #11 JSON shape (`promptRaw` + primitives). Align with `ReplayPayloadSchema` in `src/core/schemas/replay-payload.ts` to unblock `mode="edit"` + frozen profile snapshot for PromptLab. **Not a Step 2 prerequisite.**
2. **Live determinism test** — extend `tests/live/providers.vertex-live.test.ts` with a replay-roundtrip case. Billable, bro-gated.
3. **Windows regression flake** — `data/assets/chartlens/2026-04-23` occasional `ENOTEMPTY` under vitest threads pool. Retries pass. Consider `threads: { singleThread: true }` for integration suite if painful.

## Commit discipline (unchanged from Session #25)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP / HANDOFF updates. Split commits.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend. Never `--no-verify`. Never force-push.
- Push as you go — Phase 5 is not held for phase close.

## Working style (unchanged)

- Bro is called **bro**. Bilingual VN/EN fine; short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 content LOC hard cap per src file (250 soft, 300 fail).
- Pin exact versions (no `^`). No new deps without asking.
- Live smoke run = billable action — confirm budget with bro before invoking.

## Hot-button gotchas from Phase 5 Step 1

1. **Replay sub-router mount order in `src/server/app.ts`:** `createReplayRoute()` MUST register on `/api/assets` BEFORE `createAssetsRoute()` so `/:assetId/replay-class` wins over the base `/:id` handler. Same pattern as `workflow-runs` before `workflows`.
2. **Test asset seeding needs parent batch:** `assets.batch_id` has a FK on `batches(id)`. Unit tests must seed a batch row first if they insert an asset with `batchId != null`. See `tests/unit/replay-service.test.ts` `seedSourceAsset` helper.
3. **DTO field name is `replayedFromAssetId`, not `replayedFrom`:** internal `AssetInternal` uses `replayedFrom` but `toAssetDto` maps it to `replayedFromAssetId` — surfaced as a test bug in Session #25 (`dto-mapper.ts:35`).
4. **Stored replay payload ≠ canonical schema:** 4 asset-writers emit a simplified JSON since Session #11. Current replay-service reads via `StoredReplayPayloadSchema` (permissive). When canonical migration lands, collapse both schemas into one and delete `replay-payload-shape.ts`.
5. **SSE framing "pump first event" pattern:** `src/server/routes/replay.ts` + `workflows.ts` both await `generator.next()` before entering `streamSSE(c, ...)` so precondition errors surface as real HTTP statuses instead of SSE error frames.

## PHASE-STATUS excerpt (quick-look state)

Current state per `PHASE-STATUS.md` header:

> Current phase: **Phase 5 — IN PROGRESS** (Step 1 landed: Replay API `POST /api/assets/:id/replay` + `GET /:id/replay-class`, generic workflow-agnostic service, batches.replay_of_{batch,asset}_id linkage, 19 new tests all green. Phase 4 remains closed.)

## Session #26 estimate

**2-3h** for Step 2 full landing assuming Q1-Q5 pre-aligned: hook + modal button + badge chip + Gallery chip + browser verify (Mock provider sufficient; Vertex optional). Component tests deferred if no jsdom — UI verified via dev server + screenshot.

If time remaining: start Step 3 (Gallery filters) scaffold OR canonical payload migration. Otherwise end session, next starts Step 3 or PromptLab (Step 5).

---

*Session #25 closed 2026-04-23 — Phase 5 Step 1 CLOSED, 3 commits pushed to origin/main (4eaef86 chore → 4e0ce50 feat → 8d6075a docs). Next: Phase 5 Step 2 (Replay UI). Handoff file = `HANDOFF-SESSION26.md` (this file).*
