# Session #40 Handoff — Phase B2 Prompt-Lab UI (consumer of B1 endpoints)

Paste at the start of S#40 to resume cleanly on any PC. Frontend-only
session per PLAN-v3 §7 row 4. Backend (3 endpoints + LLM layer + fallbacks
+ JSONL log) shipped in S#39 commit `175d4b9` on `origin/main`.

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #39 — 2026-04-25)

- **Phase B1 backend shipped + committed.** Commit `175d4b9` on `main`
  (NOT yet pushed). 31 files, +2263 / -0.
- **Regression:** **811 pass / 13 skipped / 1 todo / 825 total** (vs
  S#38 baseline 747/758 → +64 from 47 unit + 12 integration + 5 live-skipped).
- **What landed (B1):**
  - `src/server/services/llm/` — provider-agnostic LLM seam (types,
    registry, errors, mime-sniff) + Grok adapter (config, fetch, retry,
    provider). Swap vendor = ship 1 file + 1 registry case.
  - `src/server/services/prompt-assist/` — 3 use cases
    (`reverseFromImage` / `ideaToPrompt` / `textOverlayBrainstorm`) +
    profile-aware fallback composer + 5-template overlay fallback +
    LLM-free reverse stub + JSONL logger.
  - `src/server/routes/prompt-assist.ts` — REST mounted at
    `/api/prompt-assist/*` (3 endpoints, multipart for image upload,
    JSON for the rest, optional `profileId` on all 3).
  - `.env.example` — `PROMPT_LLM_PROVIDER=grok` + `XAI_API_KEY=` +
    optional Grok overrides.
- **Decisions locked S#39** (PLAN-v3 §J entries to add when next docs
  pass lands): Q-39.A through Q-39.K (architecture revised to provider-
  agnostic — see commit body for detail).
- **Backend smoke proven** — 3 curl calls returned correct fallback
  output (no `XAI_API_KEY` set on this box); JSONL log lines emitted
  with `provider:"none", model:null, outcome:"fallback"`.

## Current repo state (verify before firing B2)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main                      # if already pushed; else just `git log`
git log --oneline -3                      # expect 175d4b9 (S#39 B1) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 811 / 825 (or 811 + N new B2 tests)
```

Current Prompt-Lab UI state: `src/client/pages/PromptLab.tsx` (286 LOC,
asset-driven only — needs `assetId` query param, falls through to
"select an asset from Gallery" when missing). **No prompt-assist
hooks, no Suggest button, no overlay picker.** B2 is greenfield UI on
top of the existing PromptLab chrome (Q-40.A confirms scope).

---

## Priority pick — S#40: Phase B2 Prompt-Lab UI

### Goal

Wire the 3 prompt-assist endpoints into the client. Bro can drop an
image on a dropzone → get a reverse-engineered prompt; type an idea +
click a button → get an expanded prompt; pick from 5 overlay variants.
All 3 surface a "Grok offline — using template" notice when the
backend returns `fromFallback: true`.

### Deliverables

1. **Hooks** — `src/client/api/prompt-assist-hooks.ts` (NEW). Three
   call hooks following the existing `useReplay` style (mutation +
   state machine, NOT pure data fetcher):
   - `useReverseFromImage()` → `(image: File, opts) => Promise<Result>`
     with state `{idle | submitting | done | error}`.
   - `useIdeaToPrompt()` → `(input) => Promise<Result>`.
   - `useTextOverlayBrainstorm()` → `(input) => Promise<Result>`.
   Each result carries `{ prompt, notes?, tokens?, fromFallback? }`.
   Errors map to typed `PromptAssistError` (network vs validation vs
   unknown) — toast on the page layer, not the hook.
2. **Components** — `src/client/components/prompt-assist/` (NEW dir):
   - `PromptAssistPanel.tsx` — collapsible card, 3 tabs (Reverse /
     Idea / Overlay). Sits on PromptLab right rail (was DiffViewer
     space → see Q-40.B for layout).
   - `ReverseImageDropzone.tsx` — drag/drop + click-to-upload, file
     size cap 5 MB, image MIME guard. Calls `useReverseFromImage`.
   - `IdeaInputForm.tsx` — textarea (3 - 2000 chars) + lane select +
     platform input. Calls `useIdeaToPrompt`.
   - `OverlayPickerModal.tsx` — modal overlay, parses 5 lines from
     LLM output (`[bold] x` shape), 5 cards each with copy-to-clipboard
     + "use this as prompt" action. Calls `useTextOverlayBrainstorm`.
   - `FromFallbackPill.tsx` — small badge (yellow tint) shown when
     `fromFallback: true`. Tooltip: "LLM offline — generated from
     template; refine manually."
3. **PromptLab integration** — in `src/client/pages/PromptLab.tsx`:
   - Mount `PromptAssistPanel` on right rail (or top of middle column,
     see Q-40.B). Wire its "Use this prompt" callback to
     `editorState.prompt` so suggested prompt lands in the textarea.
   - Pass `profileId` from active profile context (Q-40.C).
4. **Active profile context** — Q-40.C: where does `profileId` come
   from? Pre-filled answer: read from `window.localStorage` key
   `activeProfileId` (set by Profiles page). Empty / missing → omit
   `profileId` from request, backend falls back to no-profile mode.
5. **Tests:**
   - `tests/unit/prompt-assist-hooks.test.tsx` — mocked fetch, all 3
     hooks (happy / error / fromFallback). ~150 LOC.
   - `tests/unit/prompt-assist-panel.test.tsx` — RTL component test:
     tab switch, dropzone accepts PNG, idea form validates, overlay
     parser splits 5 lines correctly. ~180 LOC.
   - `tests/integration/prompt-lab-suggest.test.tsx` — full PromptLab
     mount with mocked endpoint, verifies "Use this prompt" populates
     editor textarea. ~120 LOC.

### LOC budget

| File | Budget |
|------|--------|
| client/api/prompt-assist-hooks.ts                     | ~170 |
| client/components/prompt-assist/PromptAssistPanel.tsx | ~180 |
| client/components/prompt-assist/ReverseImageDropzone.tsx | ~120 |
| client/components/prompt-assist/IdeaInputForm.tsx     | ~130 |
| client/components/prompt-assist/OverlayPickerModal.tsx| ~150 |
| client/components/prompt-assist/FromFallbackPill.tsx  | ~40  |
| client/pages/PromptLab.tsx (delta only)               | +30  |
| tests/unit/prompt-assist-hooks.test.tsx               | ~150 |
| tests/unit/prompt-assist-panel.test.tsx               | ~180 |
| tests/integration/prompt-lab-suggest.test.tsx         | ~120 |
| **Total**                                             | **~1270 LOC across 10 files** |

All ≤ soft cap 250. Heaviest = `PromptAssistPanel.tsx` (180 LOC).
Cap-watch at midpoint; if it grows, split tab containers into
`PromptAssistPanel.tabs.tsx`.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-40.A — Where do the prompt-assist controls live**
- *Pre-filled:* on the existing PromptLab page (`/prompt-lab?assetId=…`).
  PLAN-v3 §1.2 references a future "Creative Project wizard" with a
  Step 3 input mode that *also* uses these endpoints — but the wizard
  itself ships in D1/D2 (S#44/S#45). For B2 we want the prompt-assist
  controls usable *today* against existing assets, so PromptLab is the
  pragmatic home. The components built here will be reused inside the
  wizard verbatim (props are wizard-shape from day one).
- *Alternative:* ship a new "Prompt Workbench" standalone page (no
  asset required). Cheaper net-new chrome but bro has to navigate
  away from Gallery → Asset → PromptLab to use it.
- *Recommend:* PromptLab integration. Asset-less standalone page
  comes free in D1 wizard.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.B — Layout slot on PromptLab**
- *Pre-filled:* right rail, top half. Current PromptLab right rail
  has `DiffViewer` (top) + `PromptHistorySidebar` (bottom). Push
  `DiffViewer` to the middle column under `PromptEditor` (it's tied
  to the editor state anyway), free the top of the right rail for
  `PromptAssistPanel`. PromptHistorySidebar stays on the right rail
  bottom.
- *Alternative A:* full-width top banner above the 3 columns. Wastes
  vertical space, breaks the "everything I'm editing fits one screen"
  goal.
- *Alternative B:* modal triggered from a "✨ Suggest" button next to
  the editor. More clicks per use, less discoverable.
- *Recommend:* right rail top half; collapsible `<details>` so bro
  can hide it once a prompt is locked in.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.C — Active profile resolution**
- *Pre-filled:* read `window.localStorage.getItem('activeProfileId')`
  inside the hook. The Profiles page already manages this slot
  (verify at S#40 start — Q-40.K). If absent, hook omits `profileId`
  from request body (backend falls back to no-profile mode, fallback
  composer returns generic stub).
- *Alternative:* prop drill from `App.tsx` via a React context. Cleaner
  but +1 wiring file for a single value.
- *Recommend:* localStorage read inside hook.
- *Risk:* if Profiles page hasn't wired the localStorage slot yet,
  pick a fixed key + add a one-line wire-up in Profiles.tsx (covered
  by carry-forward if so).
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.D — "Use this prompt" → editor textarea**
- *Pre-filled:* clicking "Use this prompt" inside any of the 3
  prompt-assist controls dispatches `setPrefillRequest(promptText)`
  (existing PromptLab state slot, already used by `PromptHistorySidebar`).
  PromptEditor reads `prefillRequest` and overwrites its textarea
  on change. Same plumbing as picking a history entry today — zero
  new wiring.
- *Alternative:* pop a confirm dialog ("Replace current prompt?").
  Useful if bro has unsaved edits but adds friction; existing
  history-pick path doesn't ask either.
- *Recommend:* reuse `setPrefillRequest`, no confirm.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.E — Overlay picker UX**
- *Pre-filled:* the LLM (or fallback) returns 5 lines like
  `[bold] x\n[playful] y\n[minimal] z\n[urgency] a\n[social-proof] b`.
  Modal renders 5 cards (one per tone), each with: tone chip (color-
  coded), the overlay text, [Copy] button, and [Use as prompt] button
  that fills the editor with `Generate an image with text overlay:
  "<the overlay>"`. Closing the modal preserves the editor's prior
  prompt.
- *Alternative:* render inline (no modal). Crowds the right rail.
- *Recommend:* modal. Already have `ConfirmDialog` chrome, lift its
  modal-skeleton.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.F — File size + MIME guards (dropzone)**
- *Pre-filled:* client-side cap **5 MB** (Hono multipart already
  supports up to ~32 MB but Grok vision call payload should stay
  small). Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`,
  `image/gif`. Reject others with inline error (no toast — keeps
  feedback local to the dropzone).
- *Recommend:* ship as pre-filled.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.G — Loading states**
- *Pre-filled:* each control shows an inline spinner + "Calling
  Grok…" text while the request is in flight. On success, swap to
  result view; on error, show inline error message + "Retry" button
  (no toast). On `fromFallback: true`, prepend `<FromFallbackPill />`
  above the result. No global loading overlay.
- *Recommend:* ship as pre-filled.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.H — Toast policy**
- *Pre-filled:* fire a toast ONLY on terminal errors (network failure,
  500 from server). Never on `fromFallback` (the pill is enough) or
  on validation errors (inline error). Reuses existing `showToast`
  passed down through `PromptLabProps`.
- *Recommend:* ship as pre-filled.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.I — Hook shape (mutation vs state machine)**
- *Pre-filled:* state-machine hooks (state: `idle | submitting | done
  | error`, action: `submit(input) => Promise<Result>`, with `reset()`).
  Matches `useReplay`'s shape so future wizard reuses are consistent.
  Returning a Promise from `submit()` lets the component await before
  navigating; the state slot drives spinner UI.
- *Alternative:* fire-and-forget callback with separate `data`/`error`
  state. Worse for sequencing.
- *Recommend:* state machine.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-40.J — Wizard shape compatibility**
- *Pre-filled:* every component takes `profileId?: string` and a
  `lane?: PromptAssistLane` prop (and `platform?: string`). When
  PromptLab uses them, it leaves `lane`/`platform` undefined; when
  the future Creative Project wizard mounts them, it threads its own
  Step 1/2 selections in. No code rewrite when D1/D2 ships.
- **STATUS: LOCKED.**

**Q-40.K — Profile localStorage slot**
- *Pre-filled:* assumed key `activeProfileId`, set by Profiles page
  when bro clicks a profile. **Verify at S#40 start** —
  `grep -nE "activeProfileId|setActiveProfile" src/client/`. If
  missing, add a one-line wire-up to `Profiles.tsx` selection handler
  (covered in B2 scope, +5 LOC).
- **STATUS: OPEN — verify at S#40 start.**

---

## Estimate

- S#40 scope: **~2h** per PLAN-v3 §7.
- Pre-align Qs: ~5 min (bro skim Q-40.A/B/C/D/E/F/G/H/I + verify K).
- Hooks (3 of them): ~25 min.
- Components (5 files): ~50 min.
- PromptLab integration + layout shuffle: ~15 min.
- Tests (unit + integration): ~25 min.
- Manual smoke (open PromptLab in browser, drop image, fire idea, pick
  overlay): ~10 min via preview MCP.
- Regression + commit: ~10 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. **No new runtime deps without asking** —
  expected new deps: zero (dropzone via plain HTML5 + drag events,
  no `react-dropzone` lib needed).
- Show evidence before claiming done (HANDOFF rule #7) — for B2
  that means: regression green + preview MCP screenshot of
  PromptAssistPanel rendered + click-through of all 3 controls
  (with fallback path since `XAI_API_KEY` likely still unset).
- Node: `fnm exec --using=20 bash -lc "…"`.
- Preview MCP: B2 IS frontend, **must verify in browser preview**
  per `<verification_workflow>`. NOTE: known host-env bug per memory
  `preview_mcp_node_env.md` — preview spawns dev:server under Node
  24, better-sqlite3 ABI fails. Workaround: start dev server manually
  via `fnm exec --using=20 bash -lc "npm run dev"` then navigate
  preview to `http://localhost:5174` (or whatever port).

---

## Carry-forward (defer unless B2 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment (cosmetic).
6. Split hooks.ts (256 LOC, 6 over soft cap).
7. **NEW from S#39:** consolidate provider-agnostic seam doc into
   PLAN-v3 §3 (currently §3 still says `services/grok.ts`; should
   point to `services/llm/` + `services/prompt-assist/`).

## Out of scope (this session)

- Creative Project wizard (D1/D2 = S#44/S#45).
- Backend changes — `/api/prompt-assist/*` is sealed for B2.
- Adding a 2nd LLM provider (just demonstrate the seam works; OpenAI
  /Anthropic adapter ships as needed in a later session).
- Saved Styles round-trip from overlay picker (could be a B2.5 if bro
  asks, but not in PLAN-v3 §7 row 4).
- Policy guard layer (C1-C3 = S#41-43).
- Any Meta Ads / Google Ads / ASO wizard work (D/E/F sessions).

---

## Remaining sessions after S#40 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 5 | S#41    | **C1 Policy schema**        | 1h  |
| 6 | S#42    | **C2 Scraper + ping**       | 2h  |
| 7 | S#43    | **C3 Enforcement + audit**  | 2h  |
| 8 | S#44    | **D1 Meta Ads backend**     | 2h  |
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after B2:** ~15.5h across 8 sessions. PLAN-v3
closes after S#48 + 1 week of bro dogfooding.

---

*Session #39 closed 2026-04-25 with B1 backend shipped + committed:
811/825 green, commit `175d4b9` on local main (push pending bro
authorization). S#40 = Phase B2 Prompt-Lab UI per PLAN-v3 §7 row 4.
Pre-align Qs pre-filled — bro skim + fire. Next: HANDOFF-SESSION41.md
for C1 Policy schema drafted at S#40 close.*
