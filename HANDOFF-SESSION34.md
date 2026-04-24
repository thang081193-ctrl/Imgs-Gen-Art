# Session #34 Handoff — Gallery delete UI + Home H1 chơi-chữ polish

Paste at the start of Session #34 to resume cleanly on any PC.

Session #33 shipped the JM Slate theme overlay (dark/light + JM Studio brand
mark) same-day after Session #32 closed Phase 6. Bro then opened post-theme
dogfood and hit the first real gap: **no Gallery delete UI** (backend
`DELETE /api/assets/:id` exists and works, but nothing wired client-side).
Bro also asked for a more playful + premium treatment on the "Images Gen Art"
H1. Both scopes batched into Session #34.

Session #33 got long — scope + alignment + theme impl + DECISIONS §H + two
user requests all in one turn — so both fixes carry forward as their own
session. All 6 design Qs are already locked (see below). No pre-align
needed. Start Session #34 by firing code directly.

---

## Where we stopped (end of Session #33 — 2026-04-24)

- **Phases 1-6 CLOSED. v1 READY.** Theme overlay layer also shipped.
- **Regression:** 700 pass / 10 skipped / 1 todo / 711 total. Clean.
- **Git tree:** 2 Session #33 commits on top of S#32 close (`7e5b99d`):
  - `5a8d625 feat(ui): JM Slate theme overlay + dark/light toggle + JM Studio brand mark`
  - `72e6dbc docs: Session #33 theme sprint — DECISIONS §H`
  - plus this handoff = 3rd S#33 commit when pushed.
- origin/main at `72e6dbc` before this handoff commit.
- Bro's home PC path: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`. Node 20
  via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5       # expect 3 S#33 commits on top of 7e5b99d
npm install
npm run regression:full    # expect 700 pass / 711 total CLEAN
npm run dev                # http://localhost:5173 — toggle Sun/Moon top-right
```

## Scope for Session #34

Two independent fixes, batch into 2 commits.

### F1 — Gallery delete UI (~1-1.5h)

Real dogfood finding: user clicks around the Gallery and finds they can't
delete assets from the UI. Backend is ready.

**Design Qs locked (A1 + B1):**
- **Q-D.A A1** — Delete button lives inside `AssetDetailModal`, not on the
  thumbnail hover (avoids accidental click). Matches the existing
  `DeleteProfileDialog` pattern from Session #30 Step 4.
- **Q-D.B B1** — Reuse the existing `ConfirmDialog.tsx` (used elsewhere in
  the project) instead of `window.confirm`. Keeps theming consistent.

**Implementation:**

1. Create `src/client/utils/use-delete-asset.ts` — React hook wrapping
   `apiDelete("/api/assets/:id")`. Returns `{ mutate, loading, error }`.
   Imports `apiDelete` from `@/client/api/client`.
2. Extend `src/client/components/AssetDetailModal.tsx`:
   - Add a Delete button in the modal footer (red-tinted, `bg-red-900/60
     text-red-300 hover:bg-red-800 border border-red-800/70`).
   - Button click opens `ConfirmDialog` with:
     - Title: "Delete asset?"
     - Body: `Asset <id-short> will be removed. This can't be undone.`
     - Confirm label: "Delete"
     - Cancel label: "Keep"
   - On confirm: call `useDeleteAsset.mutate(asset.id)`.
   - On success: dismiss the dialog, close the modal, emit a toast
     (`showToast({ variant: "success", message: "Asset deleted." })`),
     trigger `onDelete` callback prop so `Gallery.tsx` can refetch.
3. Extend `src/client/pages/Gallery.tsx`:
   - Pass `onDelete` prop to `AssetDetailModal` that bumps `refreshKey`
     (or whatever invalidates `useAssets`).
4. Tests:
   - **Integration** — verify `DELETE /api/assets/:id` is already covered
     in `tests/integration/assets-routes.test.ts`. If yes, no server-
     side test to add. If missing, add a DELETE happy path + 404
     unknown-id case.
   - **Preview MCP smoke** — seed an asset (or use existing dogfood
     data), click thumbnail → modal → Delete → confirm dialog → Delete
     → verify asset gone from grid + toast visible + no console error.

**Commit 1 (feat(gallery)):**
```
feat(gallery): delete asset from AssetDetailModal (dogfood finding)

- use-delete-asset.ts: hook wrapping apiDelete with loading/error state.
- AssetDetailModal: Delete button in footer + ConfirmDialog integration
  + onDelete callback prop so Gallery can refetch.
- Gallery: pass refetch trigger as onDelete.
- Preview MCP smoke verified end-to-end.
```

### F2 — Home H1 "Images Gen Art" chơi-chữ polish (~1-1.5h)

Bro wants the Home page H1 to feel more premium + playful typographically.
Touches only `src/client/pages/Home.tsx` line 20 area. `<title>` and
`og:title` meta stay as-is (those are for crawlers + browser tabs, not
visual polish).

**Design Qs locked (F1 + T6):**
- **Q-B.A F1** — Self-host **Inter Variable** (woff2). Modern, geometric,
  designed for UI, pairs well with JM Slate. Self-host not CDN per
  Q-T.E (§H) — offline-safe, no tracking, no FOUT. One file covers
  every weight via `font-weight: 100 900;`.
- **Q-B.B T6** — Combine treatments:
  - "Images" — regular weight 400, default ink color
  - "Gen" — lighter weight 300 + italic, muted color (slate-400)
  - "Art" — black weight 900 + gradient `background-clip: text`
    (dark: sky-400 → indigo-500 → violet-600; light: violet-600 →
    blue-600 for contrast on light bg)

**Implementation:**

1. Download Inter Variable font file. **No new npm dep** — `@fontsource-
   variable/inter` would pin cleanly but per repo rule "no new deps
   without asking" (CONTRIBUTING), go manual:
   ```bash
   mkdir -p public/fonts
   curl -L -o public/fonts/InterVariable.woff2 https://rsms.me/inter/font-files/InterVariable.woff2
   ls -la public/fonts/InterVariable.woff2  # expect ~800KB
   ```
   rsms.me is Inter's official upstream (rsms/inter on GitHub).
2. Extend `src/client/styles/theme.css` with `@font-face` at the top
   of the file (before :root):
   ```css
   @font-face {
     font-family: "Inter Variable";
     font-style: normal;
     font-weight: 100 900;
     font-display: swap;
     src: url("/fonts/InterVariable.woff2") format("woff2-variations");
   }
   ```
   Then update `--jm-font-sans` to prepend Inter Variable:
   ```css
   --jm-font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont,
                    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
   ```
   Apply to body (already uses `font-family: var(--jm-font-sans)` from
   JM Slate starter pattern). **BUT** — check `src/client/styles/
   theme.css` actually sets `font-family` on `html, body` or relies on
   Tailwind defaults. If relying on Tailwind defaults (which uses
   system stack), add `html { font-family: var(--jm-font-sans); }` in
   theme.css.
3. Rework `src/client/pages/Home.tsx` H1 (line 20 currently
   `Images Gen Art` plain). Replace with three `<span>` tags:
   ```tsx
   <h1 className="text-5xl font-black tracking-tight">
     <span className="font-normal">Images</span>
     {" "}
     <span className="font-light italic text-slate-400">Gen</span>
     {" "}
     <span className="font-black bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 bg-clip-text text-transparent">
       Art
     </span>
   </h1>
   ```
   Light theme: gradient still reads well on light bg because sky →
   violet is bold enough. If bro says it looks washed out in light,
   swap the gradient per-theme via Tailwind dark: variants OR a CSS
   var-driven gradient. Defer unless bro flags visually.
4. **Preview MCP smoke:** load Home in both dark + light, verify
   Inter Variable loaded (DevTools → Computed → font-family), three-
   span treatment visible, gradient on "Art" crisp.

**Commit 2 (feat(ui)):**
```
feat(ui): Inter Variable + Home H1 chơi-chữ treatment

- public/fonts/InterVariable.woff2 (NEW, ~800KB) self-hosted from
  rsms.me. One file covers weight 100-900 via font-variation-settings.
- theme.css: @font-face for Inter Variable + --jm-font-sans prepends
  it + html { font-family } binds the var to the app.
- Home.tsx: rework H1 — "Images" regular / "Gen" italic light muted /
  "Art" black with sky→indigo→violet gradient (background-clip: text).
- Preview MCP smoke verified in both themes.
```

### F3 — Session close (~20min)

1. Final regression pass (should still be 700+ depending on whether
   F1 added integration tests).
2. DECISIONS §I entry covering F1 + F2 decisions + why Inter over
   alternatives + chơi-chữ treatment rationale (optional — §H already
   documents the theme; §I can be concise).
3. Update memory `phase_status.md` — Session #34 closed, promote
   "Inter Variable self-hosted" out of §H.3 carry-forwards.
4. Write `HANDOFF-SESSION35.md` if any new carry-forwards emerge;
   otherwise note in memory that S#35 = bug-fix-only mode per
   HANDOFF-SESSION33 playbook (still the baseline handoff for
   post-ship support).
5. Commit 3 (optional): `docs: Session #34 close — DECISIONS §I`.

## Out of scope (carry-forward for Session #35+)

Same list as HANDOFF-SESSION33 + HANDOFF-SESSION33 §H.3, unchanged:

- Sharp-derived icon-only favicon crop.
- jm-* semantic class migration.
- Theme-aware brand-color ramps (if T6 gradient looks weak on light,
  promote here).
- Bulk-delete Gallery UI (Q-D.A A3 deferred — gate on real count > 20).
- §C1 asset_tags JOIN migration.
- §G.1 server-side async flush await.
- Tree view via parentHistoryId.
- Side-by-side diff panel.
- Cursor-based pagination.
- Profile import UI.
- 3-way merge UI.
- Bulk profile operations.
- Profile list search/filter.
- Read-only profile view route.

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- All 6 scope Qs already locked — no pre-align needed, fire code.
- <300 content LOC hard cap (250 soft, 300 fail).
- Pin exact versions. No new deps without asking (font file is a static
  asset, not a dep).
- `test:live:smoke-all` = billable — confirm budget before firing.
- Show evidence before claiming done (HANDOFF rule #7).
- Preview MCP smoke required for both F1 + F2 (both UI-visible).

## Session #34 estimate

- F1 delete UI: 1-1.5h
- F2 Inter + H1 treatment: 1-1.5h
- F3 close: 20min
- Buffer: 30min

Total: **~3h**. Budget 4h.

---

*Session #33 closed 2026-04-24 (theme sprint + handoff write). Phase 6
CLOSED + theme overlay shipped. Next: Session #34 = delete UI + H1
polish, 2 commits batched. Handoff file = `HANDOFF-SESSION34.md` (this
file). Post-Session #34, return to HANDOFF-SESSION33 bug-fix-only mode.*
