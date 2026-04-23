# ArtForge — Contributing Guide

> **Code quality charter.** Rules below are enforced in code review. Violations block merge unless discussed and explicitly waived with reason.

---

## Code Philosophy

1. **Clean, lean, no over-engineering** — first version picks obvious path. Abstract only when duplication repeats 3+ times.
2. **Modular, no overlapping code** — each module one responsibility; shared logic lives in `src/core/*`.
3. **Storage vs Action separation** — passive storage layer never calls external APIs; action layer never holds storage state.
4. **QA 3-steps** — every module has unit + integration + (optional) live test.

---

## 15 Anti-Pattern Rules

### Rule 1 — No dynamic Tailwind classes

All Tailwind class names must exist as **literal unbroken strings** in source files. Vite JIT scans plain text; interpolation like `bg-${color}-600` does not produce the class.

❌ Banned:
```typescript
<button className={`from-${meta.color}-600 to-${meta.color}-800`} />
```

✅ Allowed:
```typescript
// In src/core/design/tokens.ts
export const COLOR_CLASSES = {
  violet: { active: "bg-gradient-to-br from-violet-600 to-violet-800" },
  blue:   { active: "bg-gradient-to-br from-blue-600 to-blue-800" },
}

// In component
<button className={COLOR_CLASSES[meta.colorVariant].active} />
```

**Exception:** none. If a new color is added, add an entry to `COLOR_CLASSES`.

**Automated check:** `tests/unit/design-tokens.test.ts` asserts no `${` in any class string inside `COLOR_CLASSES`.

---

### Rule 2 — No mixing UI state with business logic

Workflow runners, prompt builders, and provider adapters are **pure async logic**. They must not import React, must not hold UI state.

❌ Banned:
```typescript
// src/workflows/ad-production/runner.ts
import { useState } from "react"  // ← forbidden in runner
export async function* runAdProduction() {
  const [progress, setProgress] = useState(0)  // ← forbidden
  // ...
}
```

✅ Allowed:
```typescript
// src/workflows/ad-production/runner.ts
export async function* runAdProduction(
  params: WorkflowRunParams
): AsyncGenerator<WorkflowEvent> {
  yield { type: "started", total: params.input.count, batchId: "..." }
  // ... pure logic, emits events
}

// UI consumes events via SSE hook
function AdProductionPage() {
  const { events } = useSSE(`/api/workflows/ad-production/run`, body)
  // React state only here
}
```

---

### Rule 3 — No calling Provider directly from client

Client never imports Gemini/Vertex SDKs. All generation goes through server HTTP API.

❌ Banned:
```typescript
// src/client/pages/Workflow.tsx
import { GoogleGenAI } from "@google/genai"  // ← forbidden
const ai = new GoogleGenAI({ apiKey: "..." })
```

✅ Allowed:
```typescript
// src/client/pages/Workflow.tsx
import { apiClient } from "@/client/api/client"
const response = await apiClient.workflows[":id"].run.$post({ ... })
```

**Automated check:** ESLint `no-restricted-imports` rule bans `@google/genai` and `@google-cloud/vertexai` inside `src/client/**`.

---

### Rule 4 — No SDK imports outside `src/server/**`

Gemini and Vertex SDKs are **server-only**. Never in `src/client/**`, never in `src/core/**`, never in `src/workflows/**`. Per the v2.2 boundary, all provider SDK calls live in `src/server/providers/*` and nowhere else.

❌ Banned:
```typescript
// src/core/prompt-builder/concept.ts
import { GoogleGenAI } from "@google/genai"  // ← forbidden; src/core is universal
```

❌ Banned:
```typescript
// src/workflows/artwork-batch/runner.ts
import { GoogleGenAI } from "@google/genai"  // ← forbidden; go through dispatcher → provider registry
```

✅ Allowed:
```typescript
// src/server/providers/gemini.ts
import { GoogleGenAI } from "@google/genai"  // OK — server-only module
```

**Enforcement:** ESLint `no-restricted-imports` in `eslint.config.js`:
- `src/core/**` cannot import `@google/genai`, `@google-cloud/*`, `better-sqlite3`, `fs`, `path`, `react`
- `src/client/**` cannot import `@google/genai`, `@google-cloud/*`, `**/server/**`
- `src/workflows/**/runner.ts` cannot import `@google/genai`, `@google-cloud/*`, `react`

Workflow runners access providers only via the registry injected by the dispatcher.

---

### Rule 5 — No hardcoded API key or env var in client

Client never reads `process.env.GEMINI_API_KEY` or similar. Client only queries `/api/providers` to know which providers have active keys.

❌ Banned:
```typescript
// src/client/contexts/ProviderContext.tsx
const hasKey = !!process.env.VITE_GEMINI_API_KEY  // ← forbidden
```

✅ Allowed:
```typescript
// src/client/contexts/ProviderContext.tsx
const { data: providers } = useQuery("/api/providers")
const geminiActive = providers.gemini.activeSlotId !== null
```

**Automated check:** ESLint `no-process-env` rule in `src/client/**`.

---

### Rule 6 — No copy-paste between workflows

If two workflows share logic, extract to `src/core/*` or `src/core/shared/*`. Copy-paste blocked at review.

❌ Banned:
```typescript
// src/workflows/artwork-batch/runner.ts
function mulberry32(seed) { /* ... */ }  // duplicated

// src/workflows/style-transform/runner.ts
function mulberry32(seed) { /* ... */ }  // duplicated — forbidden
```

✅ Allowed:
```typescript
// src/core/shared/rand.ts
export function mulberry32(seed: number) { /* ... */ }

// both workflows import
import { mulberry32 } from "@/core/shared/rand"
```

---

### Rule 7 — No file >300 LOC (hard cap)

LOC measured by content lines (excluding blank lines + pure comment lines). Hitting 250 = refactor candidate. 300 = blocker.

**Exception:** data files (JSON, constants tables) can exceed. TS/TSX code files cannot.

**Enforcement:** CI script `scripts/check-loc.ts` fails if any file in `src/**/*.{ts,tsx}` exceeds 300 content lines (excluding `src/core/design/tokens.ts` which has tables).

---

### Rule 8 — Workflow runner is async generator, zero UI state

Runner is an **async generator function** that:
- Takes `WorkflowRunParams`
- Yields `WorkflowEvent` objects
- Can call storage layer (read profile, save asset)
- Can call provider layer (generate image)
- **Cannot** import React, hold component state, or produce side effects in UI

This clarifies vs v2.0: runner **is not** "pure function" — it has side effects (storage writes, API calls). But it has **no UI coupling**.

❌ Banned:
```typescript
export async function* runAdProduction(params, setProgress) {  // ← setProgress is UI
  yield { type: "started", ... }
}
```

✅ Allowed:
```typescript
export async function* runAdProduction(
  params: WorkflowRunParams
): AsyncGenerator<WorkflowEvent> {
  yield { type: "started", batchId, total }
  
  for (let i = 0; i < params.input.count; i++) {
    const concept = await generateConcept(...)  // storage/API side effect OK
    yield { type: "concept_generated", concept, index: i }
    
    const asset = await generateImage(...)
    yield { type: "image_generated", asset, index: i }
  }
  
  yield { type: "complete", assets, batchId }
}
```

---

### Rule 9 — No `console.log` in production path

Use the logger module. Logger has levels (`debug`, `info`, `warn`, `error`) and built-in redactor for API keys.

❌ Banned:
```typescript
console.log("API key:", apiKey)  // ← forbidden; also leaks secret
```

✅ Allowed:
```typescript
import { logger } from "@/core/shared/logger"
logger.info("Provider health check", { providerId: "gemini" })
// logger redacts any string matching API key patterns automatically
```

**Logger redactor patterns (server-side):**
- Gemini API keys: `/AIza[\w-]{35}/` → `AIza***`
- Vertex bearer tokens: `/ya29\.[\w-]+/` → `ya29.***`
- JWT tokens: `/eyJ[\w-]+\.[\w-]+\.[\w-]+/` → `eyJ***.***.***`

**Exception:** `scripts/*` CLI tools can use `console.log` (developer-facing, not runtime).

---

### Rule 10 — No magic numbers or strings

All numeric thresholds and string identifiers must be named constants. Workflow IDs, model IDs, semantic colors, default values must live in `src/core/*/constants.ts` files.

❌ Banned:
```typescript
if (concepts.length > 10) { ... }  // ← magic number
if (workflow === "style-transform") { ... }  // ← magic string
```

✅ Allowed:
```typescript
// src/core/constants.ts
export const MAX_BATCH_SIZE = 10
export const WORKFLOW_IDS = {
  ARTWORK_BATCH: "artwork-batch",
  AD_PRODUCTION: "ad-production",
  STYLE_TRANSFORM: "style-transform",
  ASO_SCREENSHOTS: "aso-screenshots",
} as const

// Usage
if (concepts.length > MAX_BATCH_SIZE) { ... }
if (workflow === WORKFLOW_IDS.STYLE_TRANSFORM) { ... }
```

---

### Rule 11 — No filesystem paths exposed to client (NEW in v2.1)

Server responses must never include absolute or relative filesystem paths. Clients receive **asset IDs** or **API URLs**, never paths.

❌ Banned:
```typescript
// src/server/routes/keys.ts
app.get("/keys", (c) => {
  return c.json({
    vertex: {
      slots: slots.map(s => ({
        id: s.id,
        label: s.label,
        serviceAccountPath: s.serviceAccountPath  // ← leaks filesystem
      }))
    }
  })
})
```

✅ Allowed:
```typescript
app.get("/keys", (c) => {
  return c.json({
    vertex: {
      slots: slots.map(s => ({
        id: s.id,
        label: s.label,
        projectId: s.projectId,
        location: s.location,
        hasCredentials: fs.existsSync(s.serviceAccountPath)  // boolean only
      }))
    }
  })
})

// Asset file served via endpoint, not path
app.get("/assets/:id/file", async (c) => {
  const asset = await repo.getAsset(c.req.param("id"))
  return c.body(fs.readFileSync(asset.filePath), 200, {
    "Content-Type": "image/png"
  })
})
```

**Automated check (Session #17):** `tests/integration/dto-no-paths-full.test.ts` holds a hand-maintained `AUDIT_TARGETS` list of every public GET route that returns JSON. On each target, the test fetches the response and recursively scans for `BANNED_KEYS` (exported from `src/server/middleware/dto-filter.ts` — same set the runtime middleware enforces, single source of truth).

**When adding a new public JSON route:**
1. Register it in `src/server/app.ts` and its per-route subapp.
2. Add an `AuditTarget` row to `AUDIT_TARGETS` in `dto-no-paths-full.test.ts`.
3. If your route legitimately needs to expose a new path-like field (e.g. public URL), submit a PR note explaining why and ensure the DTO mapper emits a URL (`/api/...`) not a filesystem path.

Adding a route without a matching `AUDIT_TARGETS` entry defeats the tripwire — the runtime scanner in `dto-filter` middleware is dev-mode only (skipped in production for perf), so the integration test is our compile-time guarantee the middleware WOULD catch a leak if it ran.

---

### Rule 12 — Extractor must fail-fast (NEW in v2.1)

Migration scripts (`scripts/extract-genart-*.ts`) must hard-fail with clear error if source file or expected export is missing. **Never emit partial JSON**.

❌ Banned:
```typescript
try {
  const artStyles = parseExport(source, "ART_STYLES")
  writeJSON("./data/templates/style-dna.json", artStyles)
} catch (e) {
  console.warn("ART_STYLES not found, skipping")  // ← silent emit
}
```

✅ Allowed:
```typescript
const requiredExports = [
  "COUNTRY_OVERRIDES", "ZONE_BASE", "I18N", "COPY_TEMPLATES", "ART_STYLES"
]

for (const exp of requiredExports) {
  if (!hasExport(source, exp)) {
    throw new ExtractionError(
      `Missing required export '${exp}' in ${source.fileName}. ` +
      `Upstream Genart-3 may have changed. Check vendor/genart-3/ for updates.`
    )
  }
}
// Only emit after ALL exports verified
```

**Rationale:** silent partial output causes subtle bugs (e.g., missing Vietnamese copy templates → workflow silently falls back to English). Hard fail makes upstream breaks visible immediately.

---

### Rule 13 — No binary/base64 in AppProfile or ReplayPayload (NEW in v2.1, refined v2.2)

AppProfile and ReplayPayload are **JSON metadata only**. Binary data (PNGs, logos, screenshots) stays on filesystem; these objects reference them by **asset ID** (v2.2: always IDs, never paths).

❌ Banned:
```json
{
  "id": "chartlens",
  "assets": {
    "appLogo": "data:image/png;base64,iVBORw0KG..."  // ← binary in JSON
  }
}
```

❌ Banned (v2.2):
```json
{
  "id": "chartlens",
  "assets": {
    "appLogo": "./data/assets/chartlens/logo.png"  // ← path leaks to client via DTO
  }
}
```

✅ Allowed (v2.2):
```json
{
  "id": "chartlens",
  "assets": {
    "appLogoAssetId": "pa_abc123"
  }
}
```

Server resolves `pa_abc123` to the file on disk via `profile_assets` table. Client fetches binary via `GET /api/profile-assets/pa_abc123/file`.

**Why:** ReplayPayload stored per-asset in SQLite. A 50KB logo × 1000 assets = 50MB bloat in DB. Also breaks query performance. Using IDs instead of paths also enforces Rule 11 (no filesystem paths to client).

**Exception:** generated image bytes are base64 **in transit** from provider to server (unavoidable), then written to disk immediately. Never stored as base64 in DB rows.

---

### Rule 14 — Schema changes require migration + replay version bump (NEW in v2.1)

Adding/removing/renaming fields in `AppProfile`, `ReplayPayload`, or SQLite tables requires:

1. **SQLite migration file** in `scripts/migrations/YYYY-MM-DD-description.sql`
2. **Schema version bump** in Zod schema (`AppProfile.version`, `ReplayPayload.version`)
3. **Backward compatibility code** to read old versions, or explicit migration path
4. **Note in DECISIONS.md** explaining the change

❌ Banned:
```typescript
// Direct schema edit without migration
export const AppProfileSchema = z.object({
  // ... existing fields
  newField: z.string()  // ← no migration = broken existing profiles
})
```

✅ Allowed:
```typescript
// Bump version + migration
export const AppProfileSchema = z.object({
  version: z.literal(2),  // was 1
  // ... existing fields
  newField: z.string().default("")  // sensible default for old profiles
})

// scripts/migrations/2026-04-25-add-newfield.ts
export async function migrate(profile: AppProfileV1): Promise<AppProfileV2> {
  return { ...profile, version: 2, newField: "" }
}
```

---

### Rule 15 — Routes don't own orchestration (NEW in v2.1)

Hono route handlers (`src/server/routes/*.ts`) are **thin** — they:
- Validate input (Zod)
- Call into `workflows-runtime/dispatcher` or `core/*` modules
- Format response

They **do not** contain business logic, compatibility checks, orchestration loops, or side effect sequences.

❌ Banned:
```typescript
// src/server/routes/workflows.ts
app.post("/workflows/:id/run", async (c) => {
  const body = await c.req.json()
  
  // ← forbidden: orchestration in route
  const profile = await loadProfile(body.profileId)
  const compat = resolveCompat(id, body.providerId, body.modelId)
  if (compat.status !== "compatible") return c.json({ error: "..." }, 400)
  
  const provider = getProvider(body.providerId)
  // ... 50 more lines of loop + event streaming ...
})
```

✅ Allowed:
```typescript
// src/server/routes/workflows.ts
app.post("/workflows/:id/run", validator("json", bodySchema), async (c) => {
  const id = c.req.param("id")
  const body = c.req.valid("json")
  
  return streamSSE(c, async (stream) => {
    for await (const event of dispatcher.run(id, body)) {
      await stream.writeSSE({ data: JSON.stringify(event) })
    }
  })
})

// src/server/workflows-runtime/dispatcher.ts
export async function* run(
  workflowId: string,
  params: WorkflowRunParams
): AsyncGenerator<WorkflowEvent> {
  // compatibility check
  // profile loading
  // delegate to workflow runner
  // ... orchestration logic here
}
```

---

## Per-File LOC Targets

| File type | Soft cap | Hard cap |
|---|---|---|
| Pure logic (`*-engine.ts`, `*-generator.ts`, `*-builder.ts`) | 200 | 300 |
| React components (`*.tsx`) | 150 | 250 |
| Type definitions (`types.ts`) | 150 | 250 |
| Server route files (`routes/*.ts`) | 100 | 200 |
| Data/constants files (JSON, tables) | unlimited | unlimited |

---

## Code Review Checklist

Before opening a PR, self-check:

- [ ] No rule violations from the 15 above
- [ ] LOC limits respected
- [ ] Unit tests added for new logic (Step 1)
- [ ] Integration test updated if workflow changed (Step 2)
- [ ] DECISIONS.md updated if architecture decision changed
- [ ] No `console.log`, no `any` types (use `unknown` + narrowing)
- [ ] Zod schemas for all new API endpoints
- [ ] No secrets in commit (check `.env.local` not staged)

---

## Exceptions Process

If a rule must be violated:
1. Document in the PR description under "Rule exception"
2. State the rule being violated
3. Explain why no compliant alternative works
4. Add a TODO comment with issue link for future cleanup (if applicable)

Rule exceptions **must be approved explicitly**. Unreviewed exceptions are treated as violations.

---

*End of CONTRIBUTING.md.*
*Last updated: 2026-04-20 with PLAN v2.2.1.*
