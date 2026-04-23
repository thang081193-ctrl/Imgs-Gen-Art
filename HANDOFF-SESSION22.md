# Session #22 Handoff — Phase 4 Step 6 (Compatibility warning banner)

Paste this at the start of Session #22 to resume cleanly.

---

## Where we stopped (end of Session #21)

- **Phase 4 Steps 4 + 5 ✅ DONE (BUNDLED)** — health cache + live wiring + cost tracking shipped, 492/492 regression green, 3 clean commits on `main`.
- Latest commits:
  - `fd5aa64` docs: Phase 4 Steps 4+5 close — PHASE-STATUS Session #21
  - `d3caf4b` feat: Phase 4 Step 5 — adapter cost + finalizeBatch + Gallery display
  - `90bacfc` feat: Phase 4 Step 4 — /providers/health cache + live wiring
- Git tree clean; **13 commits ahead of `origin/main`** (unpushed, awaiting bro decision).
- Working directory: `D:\Dev\Tools\Images Gen Art`.
- Phase 4 status: 5 of 8 steps done. Remaining: Step 6 (this session), Step 7 (live smokes), Step 8 (close).

## Source-of-truth read order (Session #22 kickoff)

1. **`PHASE-STATUS.md`** — Session #21 entry (top of file, ~lines 19–170). Bundled Step 4+5 decisions, `useCompatibility` + `lookupCompat` already plumbed to client.
2. **`BOOTSTRAP-PHASE4.md` Step 6** — Compat banner scope (lines 159–171).
3. **`MEMORY.md`** — global project rules + phase status snapshot.
4. **`PLAN-v2.2.1.md` §7** — Compatibility Matrix (11 compatible pairs: NB Pro × 4 + NB 2 × 4 + Imagen × 3; Imagen correctly fails style-transform per §7.4).
5. **`src/core/compatibility/types.ts`** — `CompatibilityResult` shape: `{status, score, source, reason?}`. The `reason` field is what the banner surfaces.

## Baseline verify BEFORE code (Session #22 opening)

```bash
npm run lint                  # expect clean
npm run typecheck             # expect 0 errors
npm run regression:full       # expect 492/492 green (45 files)
git status                    # expect clean
git log -1 --oneline          # expect fd5aa64 docs: Phase 4 Steps 4+5 close
```

If any fails → fix before Step 6 work.

## Session #22 target — Phase 4 Step 6 (Compatibility warning banner)

**Goal:** Workflow page warns when user picks an INCOMPATIBLE `(workflow, provider:model)` triple. Today the Run button already disables via `compatibleOK` in `Workflow.tsx:89` — but the user gets NO explanation why. Banner closes that UX gap.

**Files dự kiến** (per BOOTSTRAP-PHASE4.md Step 6):

- `src/client/components/CompatibilityBanner.tsx` (NEW) — pure presentational: takes `(workflowId, providerId, modelId, matrix)` props, renders nothing when compatible, yellow/red banner with `reason` copy when incompatible.
- `src/client/pages/Workflow.tsx` — mount `<CompatibilityBanner />` above the input form (same vertical column as `ProviderModelSelector`). Compat state already computed at line 61 (`const compat = ... lookupCompat(...)`) — reuse it.

**What's already there** (Session #16 legacy, no rewrite needed):
- `useCompatibility()` in `src/client/api/hooks.ts:101` — fetches `/api/providers/compatibility` once at mount.
- `lookupCompat(matrix, workflowId, providerId, modelId)` in `hooks.ts:109` — returns `CompatibilityResult | null`.
- `ProviderModelSelector.tsx` already reads `lookupCompat` at line 40 to dim incompat rows.
- `Workflow.tsx:82-90` — `canRun` gate includes `compatibleOK`. Run button disables automatically.

**QA gate:** manual browser smoke (Claude_Preview MCP):
- Pick style-transform + Imagen 4 → red banner appears with reason text; Run button disabled.
- Pick style-transform + NB 2 → banner hidden; Run button enabled if rest of form valid.
- Pick artwork-batch + any provider → banner hidden (all 4 models compatible per §7 matrix).

## 4 scope Qs for bro BEFORE coding Session #22

**Q1 — Banner placement: above input form or above `ProviderModelSelector`?**
Option (a): above input form — groups the selector + banner + form together visually, UI flow reads "pick → warning → fill → run".
Option (b): above selector — warning appears AT the source (the selector causing the problem).
Rec: (a). Selector already visually dims incompat rows; banner complements with explanation below the selector. Keeps selector self-contained.

**Q2 — Banner variant: single red "incompatible" state or tri-state (ok / warning / error)?**
`CompatibilityResult.status` is binary (`compatible` / `incompatible`), but `CompatibilityOverride` has richer reasons (Mock fallback vs. Imagen-no-editing vs. language-unsupported). Could split into:
- `incompatible` (red) — hard block, generation will 409
- `warning` (amber) — compatible but caveats (e.g., "Mock provider — generates solid-color PNGs, not real artwork")
Rec: **single red variant** for v1. The amber warning-on-Mock case is niche (Mock is for dev/tests, not end-user batches). Extra variant = extra LOC + mental load without clear user need. Revisit if Phase 6 demands.

**Q3 — Copy source: `reason` field or composed from failed requirements?**
`CompatibilityResult.reason?: string` is set by the declarative resolver (lists missing capabilities) or by a `CompatibilityOverride` (manual copy). All 4 workflows already populate meaningful reasons (e.g., `"Imagen 4 lacks supportsImageEditing required by style-transform"`). Alternative: re-derive from `selectedWorkflow.requirement` + `selectedModel.capability`.
Rec: **use `reason` field as-is**. Single source of truth, backend owns the copy, future requirement changes auto-propagate without client rewrite. Fallback: `"This provider:model is not compatible with the selected workflow."` for the rare case `reason` is undefined.

**Q4 — Run button: keep existing gate or add explicit `aria-disabled` + hover tooltip?**
Current: `canRun` is false → button has `disabled` attribute → browser default cursor. User sees "disabled" but not "why disabled".
Options:
- (a) keep button disabled as-is (banner is the explanation) — simplest
- (b) add `title` attribute on disabled Run button = `reason` — tooltip on hover
- (c) both (a) + (b) for redundancy
Rec: (c). Banner catches reading eyes; tooltip catches the user who hovered Run without scanning up. Single line of code (`title={compat?.reason ?? undefined}`).

**Estimated time Session #22:** 1–2h. Expected regression delta: 492 → ~495 (maybe +3 unit tests if we test the banner's rendering logic; more likely 0 new tests — client-UI convention is typecheck + browser smoke per Session #16, and Modal/AssetThumbnail weren't unit-tested either).

## Bonus considerations to confirm with bro

**Bonus A — "Why this pair is incompatible" link behavior.** If banner text is long (Imagen reason has ~60 chars), consider truncate + "Learn more →" that opens a details popover listing the specific missing capability flags. Rec: **skip for v1.** Full reason already fits in 1–2 lines; no popover infra needed. Revisit Phase 6 polish.

**Bonus B — Animation / transition on show-hide.** When user switches from compat pair → incompat pair, banner should feel responsive but not distracting. Rec: **instant show/hide, no animation.** Matches existing Workflow page's minimal-chrome aesthetic. If bro wants smooth, add `transition-all duration-150` on mount only.

**Bonus C — Color variant for banner.** Per Session #16 design tokens, `COLOR_CLASSES.red.badge` = `"bg-red-500/10 text-red-400 border-red-500/30"`. Reuse that or ad-hoc `bg-red-950/40 border-red-500 text-red-200`? Rec: **ad-hoc**. Banner is larger than a badge and wants different contrast. Don't extend the 5-variant table (design-tokens.test.ts would protest).

**Bonus D — Hide banner during workflow loading.** `anyLoading` covers matrix fetch; if true, banner should be null to avoid flickering "incompatible" before matrix arrives. Rec: **implicit via `compat === null` guard.** If matrix hasn't loaded, `lookupCompat` returns null, banner renders nothing. Clean.

## Carry-over from Session #21

- **Manual browser smoke of cost UI $0 path confirmed** via Claude_Preview MCP. Non-zero cost smoke (Gemini real adapter) still UNCONFIRMED — needs real keys (Session #23 live smokes flush these).
- **Live smokes still UNCONFIRMED.** Gemini (Session #18) + Vertex (Session #19) live tests need bro's real env. Budget ~$0.20 Gemini + ~$0.20 Vertex = ~$0.40. NOT a blocker for Session #22 (compat banner is pure client work).
- **`BOOTSTRAP-PHASE4.md` Step 2 SDK reference is stale** — says `@google-cloud/vertexai@1.10.0`, should read `@google/genai@1.5.0 (vertexai: true)`. Ghi nhớ sửa lúc Phase 4 close (Session #24).
- **Health cache invalidation + cost display are hot paths in Gallery/Workflow** — if compat banner needs to trigger any data refetch (it shouldn't), use the existing `refreshKey` bump pattern (`useAssets`, `useKeys`).

## Phase 4 roadmap after Session #22

| Step | Title | Session |
|---|---|---|
| 6 | Compat banner | #22 (this) |
| 7 | 11 live smoke tests (real keys, ~$1.10/run) | #23 — needs bro env + budget approval |
| 8 | Phase 4 close + browser E2E + BOOTSTRAP SDK ref fix + PHASE-STATUS | #24 |

Session #23 is bro-gated — can't auto-run without credentials. Session #24 expects Phase 4 DONE.

## Commit discipline reminder (unchanged)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP updates. Split commits for clean git log.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend. Never `--no-verify`. Never force-push.
- Don't push to origin without bro say-so (13 commits ahead; bro's call when to push).

## Working style (unchanged)

- Bro calls: **bro**. Bilingual VN/EN. Short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- `<300` LOC hard cap per file.
- Pin exact versions (no `^`). No new deps without asking.
- After client UI changes: `preview_start` + smoke via Claude_Preview MCP before claiming done.

---

*Session #21 closed 2026-04-23 — health cache + cost tracking both live. Next: compat warning banner.*
