# Session #31 — Phase 5 Step 6 (AppProfileSchema v2 + preserve-edits-on-409)

Locked 2026-04-24. Source-of-truth for Session #31 scope. Cite
`PLAN §X` when creating files, `DECISIONS §F` for architectural
decisions rationale.

## Q answers (locked)

| Q | Answer | Ref |
|---|---|---|
| **Q-31.A** | Option A — Step 6 v2 kickoff full ship this session | handoff |
| **Q-31.C** | Migration-on-read via `z.union` + transform. **Rejected** in-place-on-write (fragments state, additive-only assumption, masks bugs, v1-consumer rot). | `DECISIONS §F.1` |
| **Q-31.C.1** | **v2a** minimal — V1 `version: z.literal(1)` → V2 `version: z.number().int().min(1)`. Transform = identity (shape unchanged otherwise). Test #6 ("defaults for v2-only required fields") becomes comment placeholder for v3+. | `DECISIONS §F.2` |
| **Q-31.D** | Preserve-edits UI: non-dismissible banner + state machine (saved / conflict / overwrite-save / discard-with-confirm) + "Overwrite & Save" label + "Discard my edits" CTA with native `window.confirm`. | `DECISIONS §F.4` |

## File inventory

### New

- **`src/core/schemas/app-profile.ts`** — rewrite to
  `ProfileBodyFields.extend({version})` × 2 branches +
  `z.union([V1, V2]).transform(migrateToV2)`. Export `AppProfile` =
  `z.output<…>`.
- **`scripts/migrate-profiles-v1-to-v2.ts`** — idempotent one-off.
  Iterate `data/profiles/*.json`, parse via union, re-write. For v2a
  the transform is identity so on-disk bytes may be unchanged; future
  v3 extends the transform. Exit 0 on success, 1 on any parse failure.
- **`tests/unit/app-profile-migration.test.ts`** — 5 cases:
  v1 valid / v2 valid (identity) / v1 invalid (bad shape) / v2 invalid
  (version < 1) / unknown version rejected. Placeholder comment for v3
  "defaults for new required fields" test pattern.

### Modified

- **`src/server/profile-repo/saver.ts`** — no change. Storage neutral:
  saver writes whatever caller passes. Version lifecycle managed by
  the route layer (create = 1, PUT = existing+1, import = echo).
- **`src/server/routes/profiles.ts`** — PUT handler bumps
  `next.version = existing.version + 1` before save. 409 body
  augmented with `code: "VERSION_CONFLICT"` + `details: {
  currentVersion, expectedVersion }` so `ApiError` envelope flows
  through to client (legacy flat `error/currentVersion/expectedVersion`
  retained for back-compat; see `DECISIONS §F.3`).
- **`src/server/routes/profile-assets.ts`** — mirror: 409 body add
  `code` + `details` (consistency with profiles.ts).
- **`src/client/pages/ProfileEdit.tsx`** — conflict state machine
  (`conflict: { remoteVersion: number } | null`). Banner (non-
  dismissible), Save button label swap, Discard CTA → `window.confirm`
  → revert to refetched `initial`. `handleSave` branches on conflict
  present.
- **`src/client/api/profile-hooks.ts`** — `describeSaveFailure` 409
  branch reworded (no longer "Refreshing"). Add
  `parseVersionConflict(err: ApiError): { currentVersion: number } |
  null` helper (reads `err.details.currentVersion`).
- **`src/client/pages/profile-edit-helpers.ts`** — `buildUpdateInput`
  unchanged (signature already takes `expectedVersion: number`).
- **`tests/integration/profiles-crud.test.ts`** — update stale-version
  test to assert `currentVersion: 2` (post-bump) instead of `1`.
  Assert `updated.version === 2` on successful PUT. Add a second
  real-409 case: two concurrent PUTs, second fails, second client
  refetches and Overwrite-Saves with `currentVersion=3`.
- **`tests/integration/profiles-routes.test.ts`** — similar
  adjustments: update-test asserts bump; conflict-test asserts
  current-version-post-bump + new `code: "VERSION_CONFLICT"` +
  `details.currentVersion` fields.
- **`tests/integration/profile-assets-routes.test.ts`** — any 409
  assertions adjusted for augmented body.

## Execution order

1. ✅ PLAN file + DECISIONS §F header (this file).
2. ✅ Schema refactor (`app-profile.ts`) + new unit test file.
3. ✅ Route bump + 409 augmentation (profiles.ts +
   profile-assets.ts) + existing integration test adjustments.
4. ✅ Migration script.
5. ✅ Client preserve-edits wiring (ProfileEdit + profile-hooks).
6. ✅ Regression (`npm run regression:full`) — expect 672 + N pass.
7. ✅ Preview MCP smoke — ProfileEdit 409 flow (dual-tab simulation
   or injected version mismatch via dev tools).
8. ✅ Close docs (PHASE-STATUS + DECISIONS §F final +
   HANDOFF-SESSION32) + commit chain (3 commits: schema/server /
   migration / client+docs).

## LOC budget (soft 250 / hard 300 per file)

- `app-profile.ts`: ~70 → ~110 LOC (union + transform + body fields).
- `profiles.ts` route: 187 → ~200 LOC (bump + 409 body).
- `ProfileEdit.tsx`: 249 → ~310 LOC — **watch cap**. If over, extract
  `ProfileConflictBanner` component.
- `migrate-profiles-v1-to-v2.ts`: ~60 LOC.
- New unit test: ~80 LOC.

## Risks + mitigations

- **Regression risk** on 409 body shape: existing tests assert flat
  `error` key — MUST keep those fields (additive augmentation only).
- **Client 409 path untested** pre-v2 (unreachable). Post-v2 real 409
  is reachable — new integration test covers it end-to-end + Preview
  MCP smoke covers UI.
- **Version counter unbounded**: `z.number().int().min(1)`. Practical
  ceiling well beyond `Number.MAX_SAFE_INTEGER` for this app's write
  rate (1 save = 1 bump). No ceiling added.
- **Migration script safety**: read-validate-write loop. If any file
  fails parse, abort with non-zero exit (fail loud, no silent drop).

## Out of scope

- Cursor pagination (CF#14), tag autocomplete (CF#19), date picker
  (CF#16), PromptLab polish (CF#10/11/12), profile import (CF#21),
  3-way merge (CF#22), bulk ops (CF#23), list search (CF#24), read-
  only route (CF#25), parallel ENOTEMPTY race (CF#27), export endpoint
  deprecation (CF#26). All deferred to Session #32+.
