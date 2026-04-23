# Session #20 Handoff — Phase 4 Step 3 (Key management UI)

Paste this at the start of Session #20 to resume cleanly.

---

## Where we stopped (end of Session #19)

- **Phase 4 Step 2 ✅ DONE** — Vertex Imagen adapter shipped, 460/460 regression green, 2 clean commits on `main`.
- Latest commits:
  - `2045b89` docs: Phase 4 Step 2 close — PHASE-STATUS Session #19
  - `dd9d74c` feat: Phase 4 Step 2 — Vertex Imagen adapter
- Git tree clean; 4 commits ahead of `origin/main` (unpushed, awaiting bro decision).
- Working directory: `D:\Dev\Tools\Images Gen Art`.

## Source-of-truth read order (Session #20 kickoff)

1. **`PHASE-STATUS.md`** — Session #19 entry (lines 19–200 roughly). Quartet adapter layout, SDK pivot, 3 Qs locked, deviations, known-pending.
2. **`BOOTSTRAP-PHASE4.md` Step 3** — Key management UI scope.
3. **`MEMORY.md`** — global project rules + the new `phase4_vertex_adapter.md` pointer.
4. **`PLAN-v2.2.1.md` §5.5 + §6.4** — key-storage contract + UI mockups if any.

## Baseline verify BEFORE code (Session #20 opening)

```bash
npm run lint                  # expect clean
npm run typecheck             # expect 0 errors
npm run regression:full       # expect 460/460 green (41 files)
git status                    # expect clean
git log -1 --oneline          # expect 2045b89 docs: Phase 4 Step 2 close
```

If any fails → fix before Step 3 work.

## Session #20 target — Phase 4 Step 3 (Key management UI)

**Goal:** Client UI creates / activates / deletes API keys for both providers without touching disk directly. Replaces the Phase-3 `slot-manager.addSlot` direct-test-setup pattern for real user flows.

**Files dự kiến** (per BOOTSTRAP-PHASE4.md Step 3):

- `src/client/pages/Settings.tsx` — new page, mounted at `page="settings"` in `Page` union router (currently `"home" | "workflow" | "gallery"`).
- `src/client/components/KeySlotDropdown.tsx` — per-provider dropdown showing slots, active indicator, add/activate/delete actions.
- `src/client/components/KeyAddModal.tsx` — modal form:
  - **Gemini**: `{label, key}` single text input, masked display after add.
  - **Vertex**: `{label, projectId, location, file}` multipart upload.
- `src/client/api/hooks.ts` — add `useKeys()` + `useKeyMutation()` wrapping `/api/keys` routes.
- Top-nav gains "Settings" link.

**QA gate:** manual browser smoke:
- Add Gemini key → activate → click Test button → status = `auth_error` (fake key) → delete → slot empty.
- Add Vertex key (file upload) → activate → Test → delete → file gone from disk.

## 4 scope Qs for bro BEFORE coding Session #20

**Q1 — KeyAddModal: separate component or extend ConfirmDialog?**  
ConfirmDialog (Session #16) takes text body + 2 buttons. Key-add needs form inputs. New standalone `Modal.tsx` primitive + `KeyAddModal` usage, or inline form inside existing `ConfirmDialog` variant? Rec: new `Modal.tsx` primitive (reusable later for replay-UI in Phase 5).

**Q2 — Vertex file-picker UX: drop-zone or plain `<input type="file">`?**  
Drop-zone = more polished but +LOC + DOM-drag event handling. Plain input = 5 LOC + accessible. Rec: plain input first; drop-zone is a Phase 5 polish pass.

**Q3 — "Test" button UX: inline result or toast?**  
After clicking Test, the 200-ms–30-s round-trip needs visible feedback. Options: (a) spinner inside the slot row → status badge replaces spinner; (b) toast with result; (c) both. Rec: (a) — keeps the result attached to the slot so bro can see latency next to the active/inactive state. Toast on error only.

**Q4 — Settings page routing: extend `Page` union or drawer?**  
Session #16's router is prop-drill `{page, params}` state. Options: (a) add `"settings"` to `Page` union + top-nav link → full-page view; (b) sliding drawer from right that overlays current page. Rec: (a) — simpler state model, matches existing pattern.

**Estimated time Session #20:** 2–3h. Expected regression delta: 460 → ~475 (component unit tests + 1–2 integration tests for new client states).

## Carry-over from Session #19

- **Live smokes still UNCONFIRMED.** Bro needs `VERTEX_PROJECT_ID` + `VERTEX_SA_PATH` env + active Vertex slot in keys.enc → run `npm run test:live`. Budget ~$0.20. NOT a blocker for Session #20 (client-side UI work doesn't touch the adapter runtime path).
- **BOOTSTRAP-PHASE4.md Step 2 SDK reference is stale** — says `@google-cloud/vertexai@1.10.0`, should read `@google/genai@1.5.0 (vertexai: true)`. Ghi nhớ sửa lúc Phase 4 close (Session #25).
- **`_resetClientCacheForTests`** pattern works cho cả 2 adapter; cache invalidation on key rotation vẫn pending Step 4 (`/providers/health` cache).

## Commit discipline reminder (unchanged from Session #18/#19)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP updates. Split commits for clean git log.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend. Never `--no-verify`. Never force-push.
- Don't push to origin without bro say-so.

## Working style (unchanged)

- Bro calls: **bro**. Bilingual VN/EN. Short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- `<300` LOC hard cap per file.
- Pin exact versions (no `^`). No new deps without asking.

---

*Session #19 closed 2026-04-23 — Vertex adapter live. Next: Settings UI.*
