// BOOTSTRAP-PHASE3 Step 6 — /api/keys CRUD + activate + test.
//
// Slot identity is inferred from the tree a slot lives in (gemini vs vertex);
// the slot record itself doesn't carry providerId. `findSlotAnywhere` scans
// both trees so clients hold a single opaque `slotId`.
//
// POST dispatches on Content-Type:
//   application/json      → Gemini key (keys.body.GeminiCreateBodySchema)
//   multipart/form-data   → Vertex key — SA file via parseMultipartUpload +
//                           fields validated against VertexFieldsSchema.
//                           Server writes SA JSON to `keys/vertex-{slotId}.json`
//                           (root `/keys/` dir is gitignored, per PLAN §4 + .gitignore).
//
// DELETE tri-state (Q7): if the slot was the active slot → 200 with
// `{ deleted, deactivated: true, warning }` so UI can prompt explicit
// reactivation (no silent cascade). Non-active delete → 204 empty.
//
// POST /:id/test (Session #14 Q8 / provider-contract extension): wires
// provider.health(modelId, { apiKey | serviceAccount, skipCache }). Phase 3
// only Mock is registered; for gemini/vertex slots we degrade to
// `{ status: "unknown" }` so the endpoint is meaningful end-to-end and
// Phase 4 swaps in real results without any route change.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { Hono } from "hono"
import type { KeySlotDto, VertexSlotDto } from "@/core/dto/key-dto"
import { modelsByProvider } from "@/core/model-registry/models"
import type { HealthCheckContext, VertexServiceAccount } from "@/core/providers/types"
import { BadRequestError } from "@/core/shared/errors"
import {
  activateSlot,
  addGeminiSlot,
  addVertexSlot,
  decrypt,
  loadStoredKeys,
  removeSlot,
  saveStoredKeys,
  toKeySlotDto,
  toVertexSlotDto,
  type KeySlot,
  type ProviderId,
  type StoredKeys,
  type VertexSlot,
} from "@/server/keys"
import { getHealthCache } from "@/server/health"
import { validateBody } from "@/server/middleware/validator"
import { parseMultipartUpload } from "@/server/middleware/multipart"
import { getProvider, hasProvider } from "@/server/providers"
import {
  GeminiCreateBodySchema,
  KeyTestBodySchema,
  VertexFieldsSchema,
  type GeminiCreateBody,
  type KeyTestBody,
} from "./keys.body"

// Default lives at project-root `/keys/` (gitignored). Tests inject
// IMAGES_GEN_ART_VERTEX_DIR so mkdtempSync scopes the SA files per worker.
function vertexKeysDir(): string {
  return (
    process.env.IMAGES_GEN_ART_VERTEX_DIR ?? resolve(process.cwd(), "keys")
  )
}

function vertexFilePath(slotId: string): string {
  return resolve(vertexKeysDir(), `vertex-${slotId}.json`)
}

interface SlotMatch {
  provider: ProviderId
  slot: KeySlot | VertexSlot
}

function findSlotAnywhere(store: StoredKeys, slotId: string): SlotMatch | null {
  const g = store.gemini.slots.find((s) => s.id === slotId)
  if (g) return { provider: "gemini", slot: g }
  const v = store.vertex.slots.find((s) => s.id === slotId)
  if (v) return { provider: "vertex", slot: v }
  return null
}

function buildHealthContext(match: SlotMatch): HealthCheckContext {
  if (match.provider === "gemini") {
    const slot = match.slot as KeySlot
    return { apiKey: decrypt(slot.keyEncrypted), skipCache: true }
  }
  const slot = match.slot as VertexSlot
  if (!existsSync(slot.serviceAccountPath)) {
    throw new BadRequestError(
      `Vertex slot '${slot.id}' is missing its service-account file on disk`,
      { slotId: slot.id },
    )
  }
  const raw = readFileSync(slot.serviceAccountPath, "utf8")
  const sa = JSON.parse(raw) as VertexServiceAccount
  return { serviceAccount: sa, skipCache: true }
}

type KeysEnv = { Variables: { validatedBody: GeminiCreateBody | KeyTestBody } }

function tryInvalidateHealth(providerId: ProviderId): void {
  // Health cache may not be initialized in edge tests — swallow + skip.
  try {
    getHealthCache().invalidate(providerId)
  } catch {
    // init happens at boot; tests that don't exercise health can skip it.
  }
}

export function createKeysRoute(): Hono<KeysEnv> {
  const route = new Hono<KeysEnv>()

  route.get("/", (c) => {
    const store = loadStoredKeys()
    return c.json({
      gemini: {
        activeSlotId: store.gemini.activeSlotId,
        slots: store.gemini.slots.map(toKeySlotDto) satisfies KeySlotDto[],
      },
      vertex: {
        activeSlotId: store.vertex.activeSlotId,
        slots: store.vertex.slots.map(toVertexSlotDto) satisfies VertexSlotDto[],
      },
    })
  })

  route.post("/", async (c) => {
    const contentType = c.req.header("Content-Type") ?? ""

    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartUpload(c, {
        allowedMimeTypes: ["application/json"],
      })
      if (!parsed.ok) return parsed.response

      const fieldsResult = VertexFieldsSchema.safeParse(parsed.data.fields)
      if (!fieldsResult.success) {
        return c.json(
          {
            error: "BAD_REQUEST",
            message: "Invalid Vertex multipart fields",
            issues: fieldsResult.error.issues,
          },
          400,
        )
      }
      const fields = fieldsResult.data

      const store = loadStoredKeys()
      mkdirSync(vertexKeysDir(), { recursive: true })
      // Derive target path BEFORE slot creation so caller sees the real path.
      // slot-manager assigns id inside addVertexSlot; we need it up-front so
      // the filename matches the record. Workaround: add the slot with a
      // placeholder path, then rewrite the slot path to the resolved one.
      const add = addVertexSlot(store, {
        label: fields.label,
        projectId: fields.projectId,
        location: fields.location,
        serviceAccountPath: vertexFilePath("pending"),
      })
      const realPath = vertexFilePath(add.slotId)
      const finalStore: StoredKeys = {
        ...add.next,
        vertex: {
          ...add.next.vertex,
          slots: add.next.vertex.slots.map((s) =>
            s.id === add.slotId ? { ...s, serviceAccountPath: realPath } : s,
          ),
        },
      }
      writeFileSync(realPath, Buffer.from(parsed.data.file.bytes), "utf8")
      saveStoredKeys(finalStore)
      // First slot auto-activates (slot-manager.addVertexSlot) — invalidate in case.
      tryInvalidateHealth("vertex")
      return c.json({ slotId: add.slotId, provider: "vertex" }, 201)
    }

    let rawJson: unknown
    try {
      rawJson = await c.req.json()
    } catch {
      throw new BadRequestError("Invalid JSON body")
    }
    const body = GeminiCreateBodySchema.parse(rawJson)
    const store = loadStoredKeys()
    const { next, slotId } = addGeminiSlot(store, {
      label: body.label,
      plaintextKey: body.key,
    })
    saveStoredKeys(next)
    tryInvalidateHealth("gemini")
    return c.json({ slotId, provider: "gemini" }, 201)
  })

  route.post("/:id/activate", (c) => {
    const slotId = c.req.param("id")
    const store = loadStoredKeys()
    const match = findSlotAnywhere(store, slotId)
    if (!match) return c.json({ error: "SLOT_NOT_FOUND", slotId }, 404)
    saveStoredKeys(activateSlot(store, match.provider, slotId))
    tryInvalidateHealth(match.provider)
    return c.json({ activated: true, slotId, provider: match.provider })
  })

  route.delete("/:id", (c) => {
    const slotId = c.req.param("id")
    const store = loadStoredKeys()
    const match = findSlotAnywhere(store, slotId)
    if (!match) return c.json({ error: "SLOT_NOT_FOUND", slotId }, 404)

    const wasActive = store[match.provider].activeSlotId === slotId
    const next = removeSlot(store, match.provider, slotId)
    saveStoredKeys(next)

    if (match.provider === "vertex") {
      const path = (match.slot as VertexSlot).serviceAccountPath
      if (existsSync(path)) rmSync(path, { force: true })
    }

    // Always invalidate — even for non-active delete the slot inventory changed
    // (future probe may pick a different active slot or degrade to auth_error).
    tryInvalidateHealth(match.provider)

    if (wasActive) {
      return c.json({
        deleted: true,
        deactivated: true,
        slotId,
        provider: match.provider,
        warning: `Active ${match.provider} slot removed — no active key until one is activated.`,
      })
    }
    return c.body(null, 204)
  })

  route.post("/:id/test", validateBody(KeyTestBodySchema), async (c) => {
    const slotId = c.req.param("id")
    const body = c.get("validatedBody") as KeyTestBody
    const store = loadStoredKeys()
    const match = findSlotAnywhere(store, slotId)
    if (!match) return c.json({ error: "SLOT_NOT_FOUND", slotId }, 404)

    const models = modelsByProvider(match.provider)
    if (models.length === 0) {
      return c.json(
        { error: "NO_MODELS_FOR_PROVIDER", providerId: match.provider },
        404,
      )
    }
    const modelId = body.modelId ?? (models[0]?.id as string)
    if (body.modelId && !models.some((m) => m.id === body.modelId)) {
      throw new BadRequestError(
        `Model '${body.modelId}' does not belong to provider '${match.provider}'`,
        { slotId, providerId: match.provider, modelId: body.modelId },
      )
    }

    // Phase 3: gemini/vertex providers not yet registered (Phase 4). Mock is
    // the only live provider. For unregistered providers we degrade to
    // status="unknown" so the wire is exercised + Phase 4 flip is a no-op.
    if (!hasProvider(match.provider)) {
      return c.json({
        slotId,
        modelId,
        status: "unknown",
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: `Provider '${match.provider}' is not registered in Phase 3 — real health check arrives in Phase 4`,
      })
    }

    const provider = getProvider(match.provider)
    const context = buildHealthContext(match)
    const health = await provider.health(modelId, context)
    return c.json({ slotId, modelId, ...health })
  })

  return route
}
