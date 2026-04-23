# Session #27 Handoff — Phase 5 Step 5 (PromptLab)

Paste this at the start of Session #27 to resume cleanly on any PC.

---

## Where we stopped (end of Session #26)

- **Phase 5 Step 2 shipped ✅.** Replay UI wired end-to-end per bro's Q1-Q5 + F-K approvals:
  - Gap A fold-in: `GET /api/assets/:id/replay-class` now returns **200 with `reason`** for `not_replayable` (was 400 generic).
  - Asset detail modal: probe skeleton → state-aware `Replay (exact/approximate) · $X.XX` button → `Replaying… 1.2s · $0.04 running` with Cancel → green `Replay complete ✓` + result card (thumbnail, `Open ↗`, `Open in Gallery`).
  - Gallery tiles: `EXACT` green / `APPROX` amber / `—` muted badges + `↩ replay-of` chip for replayed assets.
  - Client-side error taxonomy mapper (5/6 categories — `rate_limit` deferred until backend adds `RATE_LIMIT`).
- **Regression: 535/545 pass** (+18 net vs Session #25's 517). Typecheck + ESLint + `scripts/check-loc.ts` + `vite build` all clean.
- Latest commits (pushed to `origin/main`):
  - `a313819` **docs: Phase 5 Step 2 close — PHASE-STATUS Session #26**
  - `e1e531c` **feat(replay-ui): Phase 5 Step 2 — Replay UI + /replay-class 200-with-reason**
  - `1ab8cec` docs: Session #26 handoff (this file's predecessor)
- **Git tree: clean + pushed** to `https://github.com/thang081193-ctrl/Imgs-Gen-Art.git`. `git pull origin main` gets you to exactly where we stopped.
- Working directory on home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -3   # expect a313819 at top

# Baseline — must pass before Step 5 work
npm install            # if first pull / dep change
npm run regression:full    # expect 535 pass + 10 skipped
```

### Windows Node 20 gotcha (Pham's home PC — memory `node_toolchain.md`)

fnm multishell PATH **does NOT propagate into cmd.exe subshells** that npm spawns for scripts. `better-sqlite3@11.7.2` has Node 20 prebuilts only (NODE_MODULE_VERSION 115) — running under Node 24 fails with ABI mismatch. Working fix:

```bash
powershell.exe -Command '$env:PATH = "C:\Users\Thang Dep Dai\AppData\Roaming\fnm\node-versions\v20.20.2\installation;" + $env:PATH; npm run regression:full'
```

If `build/Release/better_sqlite3.node` is missing after `npm install`, manually fetch the prebuilt from within the package dir: `cd node_modules/better-sqlite3 && "$(which node)" ../prebuild-install/bin.js`.

Likely a non-issue on the office PC (clean Node 20 install assumed).

## Secrets / credentials state

Unchanged from Session #26:
- Vertex SA JSON at `.secrets/vertex-sa.json` on home PC. Gitignored. Required for `npm run test:live:smoke-all` + browser E2E against real Vertex.
- `GEMINI_API_KEY` still NOT provisioned — blocks Gemini live smokes only, not a PromptLab blocker.
- `data/keys.enc` seeded with one encrypted real Vertex slot — harmless.

## Source-of-truth read order (Session #27 kickoff)

1. **`PHASE-STATUS.md`** — Session #26 entry at top. 4-item Step 2 carry-forward worth re-reading (item #4 = bro's visual smoke verdict on Step 2).
2. **`PLAN-v2.2.1.md` §11 (QA tests `replay-payload.test.ts`) + §1452-1462 (Phase 5 deliverables)** — PromptLab spec is thin in PLAN: "replay dialog with mode + profile snapshot toggle + expected replayClass preview". HANDOFF-SESSION25 §59 refines it to "dedicated page + mode selector + profile snapshot toggle + expected replayClass preview + DiffViewer".
3. **`src/core/schemas/replay-payload.ts`** — the canonical `ReplayPayloadSchema` that the 4 asset-writers must migrate to (Step 5 prerequisite per below).
4. **`src/server/workflows-runtime/replay-payload-shape.ts`** — the permissive `StoredReplayPayloadSchema` the current replay-service reads. Gap between canonical and stored is the carry-forward from Session #25.
5. **`src/server/routes/replay.ts`** + **`src/server/workflows-runtime/replay-service.ts`** — the `POST /replay` path that will grow a `mode="edit"` branch + `overridePayload` validation.
6. **`src/client/components/AssetDetailModal.tsx`** + **`src/client/components/ReplaySection.tsx`** — existing Replay button is where the PromptLab entry point attaches.
7. **`CONTRIBUTING.md`** — 15 anti-pattern rules; ESLint-enforced. Rule 7 (300 LOC hard cap) bit us last session — plan file splits up-front.

## Phase 5 deliverables (per PLAN §10 — updated after Step 2)

| # | Deliverable | Status |
|---|---|---|
| 1 | **Replay API** | ✅ Session #25 |
| 2 | **Replay UI** — modal button + gallery badge chip | ✅ Session #26 |
| 3 | Gallery enhancements — tags + date + provider + model + replayClass filters | pending |
| 4 | Profile CMS — full CRUD UI | pending |
| 5 | **PromptLab** — dedicated page + history (SQLite `prompt_history`) + diff viewer | ← **Session #27 target** |
| 6 | AppProfileSchema v2 migration — trigger-driven | defer until blocked |

Order per bro's Session #25 pre-alignment: **1 → 2 → 5 → 4 → 6 → 3**.

## Session #27 target — Phase 5 Step 5 (PromptLab)

**Goal:** Ship a dedicated PromptLab page that lets the user open any existing asset, edit the prompt + a small set of override params, replay with the edited payload, and see the run history per asset (or standalone).

### Likely prerequisite fold-in — canonical payload migration

Bro's `mode="edit"` path in `POST /api/assets/:id/replay` currently returns **501 NOT_IMPLEMENTED** because the 4 workflow asset-writers emit the simplified Session #11 JSON shape (`promptRaw` + primitives, no `providerSpecificParams` / `promptTemplateId` / `contextSnapshot`). Before PromptLab can meaningfully let a user edit params, we need the canonical shape persisted so the edit surface has something consistent to render.

**Scope (~2h of Session #27):** Update all 4 files in `src/workflows/{ad-production,artwork-batch,aso-screenshots,style-transform}/asset-writer.ts` to write the canonical `ReplayPayloadSchema` (with `providerSpecificParams: { addWatermark: false }` + `promptTemplateId` + `promptTemplateVersion` + `contextSnapshot: { profileId, profileVersion, profileSnapshot }`). Collapse `StoredReplayPayloadSchema` into `ReplayPayloadSchema` (delete `replay-payload-shape.ts`). Replay-service reads via a union schema that accepts both legacy + canonical until no pre-migration rows remain.

**Alternative:** ship PromptLab read-only v1 (preview + diff display, no actual edit-and-run), defer canonical migration. Less useful but lower session load. Bro decides via **Q1** below.

### Contract with back-end (planned extensions)

```
POST /api/assets/:assetId/replay
  body: { mode: "replay" | "edit", overridePayload?: Partial<ReplayPayload> }
  (v2 under this session — v1 from Session #25 accepted mode only, no override)

  For mode="edit": overridePayload REQUIRED, validated against
  ReplayPayloadSchema.partial() + allowlist of editable fields (Q6 below).

  Events unchanged: started → image_generated → complete | error | aborted.

GET /api/assets/:assetId/prompt-history  (NEW)
  200: { history: PromptHistoryDto[] }  — all prompt iterations for this asset

GET /api/prompt-history?profileId=...  (NEW, optional v1)
  200: { history: PromptHistoryDto[] }  — global view, paginated
```

### UI deliverables

1. **PromptLab page** (`/prompt-lab?assetId=ast_xxx` or `/prompt-lab` standalone):
   - Left column: source asset thumbnail + read-only metadata (provider, model, seed, aspect, replayClass badge).
   - Middle column: **editable prompt** (textarea) + **override params** panel (checkbox for `addWatermark`, text field for `negativePrompt` — scope per Q6).
   - Right column: **DiffViewer** — word-level diff between original and edited prompt. Live-update on keystroke (debounce ~200ms).
   - Below: **Expected replayClass preview** — client-side computed from capability + current overrides. Shows badge (`EXACT` / `APPROX` / `—`) with tooltip explaining what flips it.
   - Bottom bar: **[Run edit]** button (disabled while prompt unchanged) + **[Reset]** + **[Cancel]** (back to Gallery).
   - After run: reuse existing `useReplay` hook; result card inline below.

2. **PromptHistory sidebar/panel** on the PromptLab page:
   - List of prior prompt iterations for this asset (if `assetId` in URL) with timestamp + diff-size + resulting asset link.
   - Click entry → load that prompt into the editor (non-destructive — just populates the textarea).

3. **Entry points** into PromptLab:
   - AssetDetailModal: new **[Edit & replay]** button next to the existing `Replay` button. Nav to `/prompt-lab?assetId=...`.
   - Optional: top-nav entry for standalone PromptLab (blank — pick an asset from Gallery or start from a profile default). Q5 below.

### Step 5 scope Qs for bro (BEFORE coding)

**Q1 — Canonical payload migration as Session #27 prerequisite?**
  Rec: **fold in**. Bro's PromptLab vision is full edit-and-run, not read-only. Without canonical migration, the edit surface has inconsistent fields across workflows (e.g. `contextSnapshot` missing). ~2h subsession, ~8 test updates.

**Q2 — `prompt_history` table shape: per-asset or standalone?**
  Rec: **Both.** Schema:
  ```sql
  CREATE TABLE prompt_history (
    id TEXT PRIMARY KEY,                    -- ph_<shortid>
    asset_id TEXT REFERENCES assets(id),    -- nullable: source asset (null for standalone starts)
    result_asset_id TEXT REFERENCES assets(id), -- nullable: asset produced by this run (null until run)
    parent_history_id TEXT REFERENCES prompt_history(id), -- lineage (null for first in chain)
    profile_id TEXT NOT NULL,
    prompt_raw TEXT NOT NULL,
    override_params TEXT,                   -- JSON of Partial<providerSpecificParams>
    created_at TEXT NOT NULL,
    created_by_session TEXT                 -- optional, future multi-user
  );
  CREATE INDEX idx_ph_asset ON prompt_history(asset_id);
  CREATE INDEX idx_ph_profile ON prompt_history(profile_id);
  ```
  Lets the user iterate without always hitting Run → save (save a draft on blur), and keeps lineage for "undo" / "load previous iteration".

**Q3 — Diff viewer: hand-roll or `diff` library?**
  Rec: **hand-roll word-level diff** in `src/client/utils/diff-words.ts`. Prompts are <2KB; naive O(n·m) LCS is fine + zero deps. Migrate to `diff` (npm) only if bro hits perf limits on long prompts.

**Q4 — Launch point wiring — AssetDetailModal gets the `[Edit & replay]` button?**
  Rec: **yes** — next to the existing Replay button. Visual weight secondary (slate-800 outline, not primary sky). Hidden when asset is `not_replayable` + `reason === "seed_missing"` (no seed = re-roll, PromptLab pointless). Present but disabled-with-tooltip for `provider_no_seed_support` and `watermark_applied` (user can see the edit surface but Run is blocked).

**Q5 — Standalone PromptLab entry (top-nav link, no assetId in URL)?**
  Rec: **defer to Phase 5 polish**. v1 = `/prompt-lab?assetId=X` only. Picking a profile from blank state adds profile picker + prompt-template picker UI overhead. Keep scope tight this session.

**Q6 — Editable fields in v1 edit mode?**
  Rec: **v1 editable** (replay-compatible overrides only):
  - `prompt` (required, free-form)
  - `providerSpecificParams.addWatermark` (checkbox, default false)
  - `providerSpecificParams.negativePrompt` (text, optional, Vertex-only — hide when provider doesn't support)

  **NOT editable v1** (each = different asset, not replay):
  - `providerId`, `modelId`, `aspectRatio`, `language`, `seed`

  Changing any of the non-editable set = fresh asset via Workflow page, not PromptLab.

**Q7 — `mode="edit"` validation strategy?**
  Rec: **server-side Zod** with an allowlist. `overridePayload` validated against `ReplayPayloadSchema.pick({ prompt: true, providerSpecificParams: true }).partial()`. Any field outside the allowlist → 400 `EDIT_FIELD_NOT_ALLOWED`. Enforced in `replay.body.ts` — no opportunity for client to slip a forbidden field through.

**Q8 — History retention?**
  Rec: **keep forever v1**. Table is tiny (short strings + metadata). Add cap / TTL only when `prompt_history` exceeds ~10K rows in practice (none of us is writing that fast).

**Q9 — "Expected replayClass preview" — client-side or server probe?**
  Rec: **client-side**. `computeReplayClass` is a pure function (`src/core/shared/replay-class.ts`); capability is in the static model registry that the client already consumes via `useProviders()`. Re-run on every keystroke (cheap).

**Q10 — DiffViewer rendering: inline (single block) or side-by-side?**
  Rec: **inline, GitHub-style** — removed words red strikethrough, added words green. Side-by-side eats horizontal space in a page that already has 3 columns (source / edit / history).

## Step 5 LOC estimate (Session #27 rough plan)

| File | Change | Rough LOC |
|---|---|---|
| **Canonical migration** | 4 asset-writers (`src/workflows/*/asset-writer.ts`) | ~40 total |
| Delete `src/server/workflows-runtime/replay-payload-shape.ts` | | −40 |
| `src/server/workflows-runtime/replay-service.ts` | Swap stored schema → canonical (with legacy reader fallback) | ~20 |
| `src/server/routes/replay.body.ts` | Add `overridePayload` field + allowlist | ~30 |
| `src/server/routes/replay.ts` | Wire edit mode through to service | ~15 |
| `src/server/workflows-runtime/replay-service.ts` | `executeReplay` accepts `overridePayload` param | ~25 |
| `scripts/migrations/2026-04-23-prompt-history.sql` | New table | ~25 |
| `src/server/asset-store/prompt-history-repo.ts` | new CRUD | ~90 |
| `src/server/routes/prompt-history.ts` | GET endpoints | ~60 |
| `src/core/dto/prompt-history-dto.ts` | DTO + mapper | ~40 |
| `src/client/pages/PromptLab.tsx` | Main page | ~220 |
| `src/client/components/PromptEditor.tsx` | Editor + override params | ~120 |
| `src/client/components/DiffViewer.tsx` | Word-diff render | ~80 |
| `src/client/utils/diff-words.ts` | Pure diff algorithm | ~60 |
| `src/client/utils/use-prompt-history.ts` | Hook | ~70 |
| `src/client/navigator.ts` | Add `prompt-lab` page | ~5 |
| `src/client/App.tsx` | Route wire | ~10 |
| `src/client/components/ReplaySection.tsx` | `[Edit & replay]` button | ~20 |
| tests | unit + integration | ~200 |

Total ~1000 LOC src + tests. **Session #27 is bigger than Step 2** — plan for 4-5h or split across 2 sessions (see below).

### Split option (if bro prefers shorter session)

- **Session #27a (~2h):** canonical payload migration only + `mode="edit"` server-side + tests. No UI. Unblocks PromptLab without touching client.
- **Session #27b (~3h):** PromptLab page + history + diff viewer + entry-point button.

Rec: **split**. Migration + mode=edit is a self-contained testable backend change with clean gates (regression stays green, new mode=edit integration test passes). PromptLab UI can land cleanly on top with no server-side surprises.

## Phase 5 carry-forward (cumulative)

From Step 1 (Session #25):
1. **Canonical replay payload migration** — Step 5 prerequisite per above (folding in).
2. **Live determinism test** — extend `tests/live/providers.vertex-live.test.ts` with replay-roundtrip case. Billable, bro-gated.
3. **Windows regression flake** — `data/assets/chartlens/2026-04-23` occasional `ENOTEMPTY` under vitest threads pool. Retries pass.

From Step 2 (Session #26):
4. **Component + hook tests** — pending `@testing-library/react` + jsdom setup. `useReplay` state machine, `AssetDetailModal` / `ReplaySection` render paths, `ReplayBadge` tooltip wiring — currently verified only via dev-server smoke.
5. **Backend `RATE_LIMIT` error code** — client mapper has the slot; backend doesn't emit it. Fold in when adapters grow 429-detection.
6. **`replay-service.ts` soft-cap creep (252 LOC)** — `probeReplayClass` addition pushed past 250 soft cap. Split candidates: move `probeReplayClass` to its own file, OR merge with carry-forward #1 (delete `replay-payload-shape.ts` → frees ~20 LOC).
7. **Visual UI smoke for Step 2** — bro to run golden-path smoke (Gallery → tile → modal → Replay → Open↗ / Open-in-Gallery) and flag any visual issues for a follow-up polish commit.

## Commit discipline (unchanged)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP / HANDOFF updates. Split commits.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend. Never `--no-verify`. Never force-push.
- Push as you go — Phase 5 is not held for phase close.
- If going the split route (Session #27a + #27b), each sub-session gets its own feat + docs commits.

## Working style (unchanged)

- Bro is called **bro**. Bilingual VN/EN fine; short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 content LOC hard cap per src file (250 soft, 300 fail). **Plan file splits up-front** — last session hit 335 LOC before extracting ReplaySection.
- Pin exact versions (no `^`). No new deps without asking.
- Live smoke run = billable action — confirm budget with bro before invoking.

## Hot-button gotchas carried from Phase 5 Steps 1-2

1. **Replay sub-router mount order** in `src/server/app.ts`: `createReplayRoute()` MUST register on `/api/assets` BEFORE `createAssetsRoute()` so `/:assetId/replay-class` wins over the base `/:id` handler. Same pattern will apply to `createPromptHistoryRoute()` if it mounts on `/api/assets/:id/prompt-history`.
2. **Test asset seeding needs parent batch:** `assets.batch_id` has a FK on `batches(id)`. Unit tests must seed a batch row first.
3. **DTO field name is `replayedFromAssetId`, not `replayedFrom`:** internal `AssetInternal` uses `replayedFrom` but `toAssetDto` maps it.
4. **Stored replay payload ≠ canonical schema:** the v2 migration work is exactly the carry-forward #1 / Step 5 prerequisite. Plan a union-reader during the transition window.
5. **SSE framing "pump first event" pattern:** both `src/server/routes/replay.ts` + `workflows.ts` await `generator.next()` before entering `streamSSE(c, ...)` so precondition errors surface as real HTTP statuses instead of SSE error frames. PromptLab's edit mode will reuse this.
6. **Module-scoped cache in `useReplayClass`:** the probe cache persists across component mounts (Q4 Infinity staleTime). `_resetReplayClassCacheForTests` available for test cleanup.
7. **LOC cap extraction:** if PromptLab.tsx crosses 250 LOC, split child components (PromptEditor / DiffViewer / HistoryPanel) before hitting 300.

## PHASE-STATUS excerpt (quick-look state)

Current state per `PHASE-STATUS.md` header:

> Current phase: **Phase 5 — IN PROGRESS** (Step 2 landed: Replay UI — asset-detail modal primary button with state-dependent copy, Gallery tile EXACT / APPROX / — badge chip, replayed-from chip, `/replay-class` reshape to 200-with-reason for `not_replayable`. 535/545 regression pass — +18 net vs Session #25 close. Phase 4 remains closed.)

## Session #27 estimate

**4-5h for full Step 5 landing** assuming Q1-Q10 pre-aligned: canonical migration + mode=edit + PromptLab page + history + diff viewer + entry-point button + tests.

**OR 2h (Session #27a) + 3h (Session #27b)** if bro prefers split — backend migration + mode=edit first as an independent testable commit, then UI layer on top. Highly recommended for this scope.

If time remaining after full Step 5: start Step 4 (Profile CMS) scaffold OR tackle carry-forward #4 (jsdom + component tests) to pay down testing debt.

---

*Session #26 closed 2026-04-23 — Phase 5 Step 2 CLOSED, 2 commits pushed to origin/main (e1e531c feat → a313819 docs). Next: Phase 5 Step 5 (PromptLab) — possibly split across Sessions #27a+#27b. Handoff file = `HANDOFF-SESSION27.md` (this file).*
