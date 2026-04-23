# Session #25 Handoff — Phase 5 entry (CMS + Gallery + PromptLab)

Paste this at the start of Session #25 to resume cleanly on the home PC.

---

## Where we stopped (end of Session #24)

- **Phase 4 is CLOSED ✅.** All 8 steps shipped, 343/343 unit regression green, 3/3 Vertex live smokes green, browser E2E against real Vertex Imagen 4 passed for all 4 workflows (happy path + compat banner + Cancel visibility + Gallery real-PNG display).
- Latest commits (pushed to `origin/main`):
  - `1c91b6b` **feat: Phase 4 Step 8 close — Phase 4 CLOSED**
  - `f959e20` docs: Phase 4 Step 7 close — PHASE-STATUS Session #23
  - `2f9b665` feat: Phase 4 Step 7 — 11 live smoke tests for workflow × provider combos
- **Git tree: clean + pushed** to `https://github.com/thang081193-ctrl/Imgs-Gen-Art.git`. `git pull origin main` on home PC will get you to exactly where we stopped.
- Working directory: `D:\Dev\Tools\Images Gen Art` (in-house project; no secret rotation needed per bro).

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Images\ Gen\ Art
git pull origin main
git log --oneline -3   # expect 1c91b6b at top

# Baseline — must pass before any new work
npm install            # if first pull
npm run regression     # expect 343/343 unit pass (~2s)
npm run typecheck      # 0 errors
npm run lint           # clean
```

If any step fails on the home PC (platform drift, different Node version), STOP and investigate before touching Phase 5 code.

## Secrets / credentials state

- Vertex SA JSON lives at `D:\Dev\Tools\Images Gen Art\.secrets\vertex-sa.json` on the current PC. **Not in git** (`.gitignore:23` → `/.secrets/`). If bro wants to run live tests on home PC:
  - Copy the SA JSON to `.secrets/vertex-sa.json` (or a path of choice)
  - `export VERTEX_PROJECT_ID="dogwood-rigging-492017-f0"`
  - `export VERTEX_SA_PATH="/full/path/to/vertex-sa.json"`
  - `npm run test:live:smoke-all` — 3 Vertex combos, ~$0.12, ~30s
- `GEMINI_API_KEY` **not provisioned** — Gemini live smokes still deferred (8 combos, ~$0.80 when ready). Not a Phase 4 gate, not a Phase 5 blocker.
- `data/keys.enc` on the current PC has one encrypted real Vertex slot (seeded Session #24 Step 8 browser E2E). Harmless; can be wiped via Settings UI `Remove` button if it causes confusion on fresh sessions.

## Source-of-truth read order (Session #25 kickoff)

1. **`PHASE-STATUS.md`** — Session #24 entry (top of file). Phase 4 CLOSED summary + carry-forward list.
2. **`PLAN-v2.2.1.md` §8 + §10 Phase 5** — lines 1331-1365 (Replay System) + 1452-1462 (Phase 5 deliverables). Core contracts + API shape.
3. **`PLAN-v2.2.1.md` §6.4** around line 921+ — Public API spec including `POST /assets/:id/replay` (line 1344) + `include=replayPayload` on GET asset (line 1213).
4. **`PLAN-v2.2.1.md` §5.4** (line 632+) — `ReplayPayloadSchema` shape (already implemented in `src/core/schemas/replay-payload.ts` + persisted in DB since Session #11).
5. **`BOOTSTRAP-PHASE3.md` + `BOOTSTRAP-PHASE4.md`** — reference for Phase 5 bootstrap conventions. Phase 5 will get its own `BOOTSTRAP-PHASE5.md` in the first block of this session.
6. **`CONTRIBUTING.md`** — 15 anti-pattern rules; ESLint-enforced.
7. **`MEMORY.md`** — global project rules + phase status snapshot.

## Phase 5 deliverables (per PLAN §10 — ~1 week target)

| # | Deliverable | Rough sizing |
|---|---|---|
| 1 | **Replay API route** `POST /api/assets/:id/replay` | 1 route + 2 modes (`replay`/`edit`) + 4 preconditions + body validator. ~150 LOC route + unit + integration. |
| 2 | **Replay UI** — Gallery `Replay` button on compatible tiles | Asset detail modal extension + confirm dialog + `useReplay` hook. Feeds through existing `useWorkflowRun` if possible, OR dedicated hook. |
| 3 | **PromptLab** — dedicated page for the full replay dialog UX | Mode selector + profile snapshot toggle + expected replayClass preview + `DiffViewer`. |
| 4 | **Profile CMS** — full CRUD UI for profiles | Create / Edit / Import-Export / optimistic concurrency UX (v2 version field already in DB + `/api/profiles` routes since Session #13). |
| 5 | **Gallery enhancements** — tag filter + total count + replayClass badges | Small diffs on top of Session #16 Gallery. |
| 6 | **AppProfileSchema v2 migration** — flagged since Session #13 | Runnable migration + regression tests. |

Order suggestion (bro decides on Session #25 kickoff): **1 → 2 → 5 → 4 → 6 → 3**. Rationale: Replay API unblocks Replay UI unblocks badge-in-Gallery. Profile CMS is independent and can slot in parallel. PromptLab is the most UX-heavy; better to land after Replay is proven.

## Session #25 target — Phase 5 Step 0 (scaffold BOOTSTRAP-PHASE5.md) + align on step 1

**Goal:** Draft `BOOTSTRAP-PHASE5.md` mirroring the structure of `BOOTSTRAP-PHASE3.md` / `BOOTSTRAP-PHASE4.md` (per-step session numbering, deliverables, QA gate, anti-patterns re-check). Bro reviews + approves + decides which step to tackle first in this session.

**Pre-Phase 5 housekeeping to fold in opportunistically (from Phase 4 carry-forward):**

1. Prune dead `@google-cloud/vertexai` entry from `package.json` (1-line diff; adapter uses `@google/genai` only).
2. Delete Session #23 smoke leftover: `data/profiles/smoke-1776937297910.json` + `data/assets/smoke-1776937297910/` (optional — if staying, document as known test fixture).
3. (Stretch) Windows `tsx watch` port preflight — `scripts/portfree.mjs` or similar to kill stale 5174 before `npm run dev`. Caught us twice in Session #24.
4. (Stretch) Gemini live smokes when `GEMINI_API_KEY` available (`npm run test:live:smoke-all` — partial-env filter auto-runs 8 Gemini combos alongside the 3 Vertex ones).

None of these should bloat the Phase 5 entry commit — bundle ≤ 2 into whichever Phase 5 Step 1 commit lands first.

## Phase 5 scope Qs for bro BEFORE coding Session #25

**Q1 — Step 1 choice: Replay API vs Profile CMS vs Gallery filters?**
Rec: **Replay API first**. Highest novelty, unblocks the Replay UI + PromptLab chain. Profile CMS reuses existing `/api/profiles` backend (Session #13) — pure client work, can parallelize. Gallery enhancements are trivial increments.

**Q2 — Replay UI where: Gallery tile vs Asset detail modal vs both?**
Per PLAN §9 / §8.2: replay is triggered from an asset context. Rec: **asset detail modal** gets the primary `Replay` button + confirm → `POST /assets/:id/replay` → toast + navigate to Gallery with the new asset's batchId. Gallery tile shows a tiny chip badge (deterministic/best_effort/not_replayable) but no button — keeps tile density readable.

**Q3 — PromptLab: separate page or inline in asset-detail modal?**
PLAN §4 lists `PromptLab.tsx` as a standalone page. Rec: **separate page**, invoked from asset detail's `Replay in PromptLab` button for advanced flows. Minimalist modal replay is the fast path; PromptLab is the diff-viewer + profile-snapshot-toggle surface.

**Q4 — AppProfileSchema v2 migration: now or later?**
Flagged since Session #13. No Phase 3 or 4 change required it. Rec: **later** — batch with any schema-requiring Phase 5 work, otherwise defer to Phase 6 polish. Don't add a v2 migration just because it's flagged.

**Q5 — Gallery filter: tags only, or date/batch/provider too?**
Session #16 shipped batch ID + workflow + profile filters. Per PLAN §10: "tags, date, batch_id" listed. Batch ID already done. Rec: **tags + date** in Phase 5; treat provider/model filter as stretch. Avoids filter-UI bloat.

## Bonus considerations

**Bonus A — Replay determinism verification test.**
`tests/live/providers.vertex-live.test.ts` already has "same seed + same prompt → identical bytes" assertion at the adapter level. Phase 5 can extend: `tests/live/replay-roundtrip.test.ts` that persists an asset, then calls `POST /replay` and asserts `replayClass="deterministic"` → output bytes match original. Billable, bro-gated.

**Bonus B — replayPayload completeness check.**
v2.2 schema fix (PLAN §5.4) made `language` part of payload. Session #11 persisted it. Add `tests/unit/replay-payload-completeness.test.ts` that reads the latest schema definition and asserts a round-trip JSON matches the stored shape. Cheap.

**Bonus C — Gallery replayClass badge = design token reuse.**
`deterministic` → green (success variant); `best_effort` → yellow (warning); `not_replayable` → slate (neutral, muted). Reuses existing 5-variant table; zero new tokens.

**Bonus D — Profile CMS optimistic concurrency UX.**
PLAN §10 says "optimistic concurrency UX". Session #13 server route already returns 409 with `{currentVersion, expectedVersion}` on conflict. Phase 5 client needs to surface this: "This profile was modified — reload to see changes, or merge your edits?" Prevents silent clobbers.

**Bonus E — DiffViewer scope.**
Phase 5 per v2.1 fix. Could be a simple side-by-side JSON diff of profile snapshots, OR a rich text diff. Rec: **simple JSON diff first** — can be a `<pre>` block with `+/-` lines. Avoids new deps (`diff` package). Stretch to rich diff if time permits.

## Phase 4 commit landscape (reference)

Top-of-log commits that formed Phase 4 (all pushed):

```
1c91b6b feat: Phase 4 Step 8 close — Phase 4 CLOSED           # Session #24 (this session)
f959e20 docs: Phase 4 Step 7 close — PHASE-STATUS Session #23
2f9b665 feat: Phase 4 Step 7 — 11 live smoke tests
97728ad docs: Session #23 handoff — Phase 4 Step 7 kickoff
8d11555 docs: Phase 4 Step 6 close — PHASE-STATUS Session #22
b172d55 feat: Phase 4 Step 6 — compatibility warning banner
c70c09f docs: Session #22 handoff
… (Session #21 health + cost)
… (Session #20 key UI)
… (Session #19 Vertex adapter)
… (Session #18 Gemini adapter)
```

## Commit discipline (unchanged from Session #23)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP / HANDOFF updates. Split commits for clean git log.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend (bro approved-once, not approved-always).
- Never `--no-verify`. Never force-push.
- Push as you go now that we're past Phase 4 close (no more "hold for phase close" rule — bro can pull fresh commits between PCs).

## Working style (unchanged)

- Bro is called **bro**. Bilingual VN/EN fine; short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 LOC hard cap per src file (250 soft, 300 fail).
- Pin exact versions (no `^`). No new deps without asking.
- Live smoke run = billable action — confirm budget with bro before invoking.
- Mock ignores `addWatermark` — if Phase 5 adds any new provider-specific flag, always round-trip it through `computeReplayClass` AND the actual `provider.generate()` call. Session #24 taught us the hard way.

## Hot-button gotchas from Phase 4 (carry-forward)

1. **Workflow `run.ts` must pass `providerSpecificParams: { addWatermark: false }` to `provider.generate()`** — not just to `computeReplayClass`. Vertex rejects seed + watermark simultaneously. Phase 5 replay must preserve this contract.
2. **Dispatcher post-abort grace window = 5 events** (Session #16 policy). If Phase 5 adds new event types mid-abort, keep under the cap or redefine.
3. **Partial-env gating in live tests** — `AVAILABLE_COMBOS = SMOKE_COMBOS.filter(env)` pattern. New live tests should follow suit.
4. **Windows `tsx watch` EADDRINUSE recovery** — `taskkill //PID <n> //F` on port 5174 before restart. Hitting this repeatedly → write `scripts/portfree.mjs`.
5. **`compat.status === "compatible"` is the only green-path state** — banner shows only on `"incompatible"`. If Phase 5 introduces `"warning"` tri-state, 5+ places need to extend.

## Phase 4 → Phase 5 residuals (non-blocking, opt-in)

1. **Gemini live smokes** — 8 combos, ~$0.80. `npm run test:live:smoke-all` with `GEMINI_API_KEY` set.
2. **Full browser Cancel DELETE roundtrip** — Vertex dev quota blocked retry in Session #24. Could retry with Mock provider OR fresh quota.
3. **Prune `@google-cloud/vertexai` from package.json** — 1-line diff.
4. **Delete Session #23 smoke profile** — harmless but cluttering `data/profiles/`.
5. **Windows `tsx watch` port preflight** — 10-line script, quality-of-life.
6. **AppProfileSchema v2 migration** — defer until Phase 5 needs it.

## PHASE-STATUS excerpt (quick-look state)

Current state per `PHASE-STATUS.md` header:

> Current phase: **Phase 4 — CLOSED ✅** (Vertex side end-to-end verified: doc fixes + addWatermark bug fix + 3/3 Vertex live smokes + browser E2E across 3 compatible workflows + compat banner + Gallery PNG display. Gemini side verified by unit suite + code review only — real-key live run deferred until GEMINI_API_KEY is provisioned.)

Phase 4 Summary table (top of PHASE-STATUS.md line 8-17) shows all 8 steps ✅.

## Session #25 estimate

**1-2h** for Phase 5 scaffolding (BOOTSTRAP-PHASE5.md + scope-Q alignment + first commit of Phase 5 Step 1 if bro decides on Replay API first). Phase 5 full completion likely 4-6 sessions depending on which deliverables get combined.

---

*Session #24 closed 2026-04-23 — Phase 4 CLOSED, 1 commit pushed to origin/main. Next: Phase 5 entry (Replay + CMS + PromptLab). Handoff file = `HANDOFF-SESSION25.md` (this file).*
