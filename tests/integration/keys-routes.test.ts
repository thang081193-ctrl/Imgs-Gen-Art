// BOOTSTRAP-PHASE3 Step 6 — HTTP smoke for /api/keys.
//
// Test isolation: IMAGES_GEN_ART_KEYS_PATH + IMAGES_GEN_ART_VERTEX_DIR are
// set to an mkdtempSync scope in beforeAll so the encrypted store and
// Vertex SA files live in a throwaway directory; the real `data/keys.enc`
// and `/keys/` dir are never touched. afterAll scrubs the temp dir.
//
// Covers Session #14 decisions:
//   Q7  — DELETE active slot → 200 deactivated:true + warning
//   Q8  — POST /:id/test returns full shape; Phase 3 degrades to
//         status="unknown" when provider not registered (gemini/vertex).
//   Bonus — Vertex multipart upload writes SA file to /keys/ dir.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"

const TEST_VERSION = "0.0.0-test"

let tmpRoot: string
let keysPath: string
let vertexDir: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

async function postJson(path: string, body: unknown, method: string = "POST"): Promise<Response> {
  return fetchApp(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function createGeminiSlot(label: string, key: string): Promise<string> {
  const res = await postJson("/api/keys", { provider: "gemini", label, key })
  expect(res.status).toBe(201)
  const body = await res.json() as { slotId: string }
  return body.slotId
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-keys-test-"))
  keysPath = join(tmpRoot, "keys.enc")
  vertexDir = join(tmpRoot, "vertex-files")
  process.env.IMAGES_GEN_ART_KEYS_PATH = keysPath
  process.env.IMAGES_GEN_ART_VERTEX_DIR = vertexDir
})

afterAll(() => {
  delete process.env.IMAGES_GEN_ART_KEYS_PATH
  delete process.env.IMAGES_GEN_ART_VERTEX_DIR
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  if (existsSync(keysPath)) rmSync(keysPath, { force: true })
  if (existsSync(vertexDir)) rmSync(vertexDir, { recursive: true, force: true })
})

describe("GET /api/keys", () => {
  it("returns empty store when no slots exist", async () => {
    const res = await fetchApp("/api/keys")
    expect(res.status).toBe(200)
    const body = await res.json() as {
      gemini: { activeSlotId: null; slots: unknown[] }
      vertex: { activeSlotId: null; slots: unknown[] }
    }
    expect(body.gemini.activeSlotId).toBeNull()
    expect(body.gemini.slots).toEqual([])
    expect(body.vertex.activeSlotId).toBeNull()
    expect(body.vertex.slots).toEqual([])
  })

  it("strips keyEncrypted from gemini slot DTOs", async () => {
    await createGeminiSlot("primary", "super-secret-key")
    const res = await fetchApp("/api/keys")
    const body = await res.json() as {
      gemini: { slots: Record<string, unknown>[] }
    }
    expect(body.gemini.slots).toHaveLength(1)
    expect(body.gemini.slots[0]).not.toHaveProperty("keyEncrypted")
    expect(body.gemini.slots[0]).toHaveProperty("id")
    expect(body.gemini.slots[0]).toHaveProperty("label", "primary")
  })
})

describe("POST /api/keys (gemini JSON)", () => {
  it("creates a slot and auto-activates first one", async () => {
    const slotId = await createGeminiSlot("first", "k-1")
    const list = await (await fetchApp("/api/keys")).json() as {
      gemini: { activeSlotId: string }
    }
    expect(list.gemini.activeSlotId).toBe(slotId)
  })

  it("rejects missing key field → 400", async () => {
    const res = await postJson("/api/keys", { provider: "gemini", label: "x" })
    expect(res.status).toBe(400)
  })

  it("rejects non-gemini provider literal → 400", async () => {
    const res = await postJson("/api/keys", { provider: "other", label: "x", key: "y" })
    expect(res.status).toBe(400)
  })
})

describe("POST /api/keys/:id/activate", () => {
  it("switches active slot between two gemini slots", async () => {
    const firstId = await createGeminiSlot("first", "k-1")
    const secondId = await createGeminiSlot("second", "k-2")

    const list0 = await (await fetchApp("/api/keys")).json() as { gemini: { activeSlotId: string } }
    expect(list0.gemini.activeSlotId).toBe(firstId)

    const act = await postJson(`/api/keys/${secondId}/activate`, {})
    expect(act.status).toBe(200)

    const list1 = await (await fetchApp("/api/keys")).json() as { gemini: { activeSlotId: string } }
    expect(list1.gemini.activeSlotId).toBe(secondId)
  })

  it("unknown slot id → 404 SLOT_NOT_FOUND", async () => {
    const res = await postJson("/api/keys/ks_ghost/activate", {})
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("SLOT_NOT_FOUND")
  })
})

describe("DELETE /api/keys/:id — Q7 semantics", () => {
  it("deleting non-active slot → 204 no body", async () => {
    const firstId = await createGeminiSlot("first", "k-1")
    await createGeminiSlot("second", "k-2")   // not active

    // Activate first explicitly
    await postJson(`/api/keys/${firstId}/activate`, {})

    // Delete the non-active second slot
    const list = await (await fetchApp("/api/keys")).json() as { gemini: { slots: { id: string }[] } }
    const targetId = list.gemini.slots.find((s) => s.id !== firstId)?.id as string

    const res = await fetchApp(`/api/keys/${targetId}`, { method: "DELETE" })
    expect(res.status).toBe(204)
  })

  it("deleting active slot → 200 deactivated:true + warning (no auto-activate-next)", async () => {
    const firstId = await createGeminiSlot("first", "k-1")
    await createGeminiSlot("second", "k-2")

    // first is active by auto-activate (first slot auto-activates)
    const res = await fetchApp(`/api/keys/${firstId}`, { method: "DELETE" })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      deleted: boolean
      deactivated: boolean
      warning: string
    }
    expect(body.deleted).toBe(true)
    expect(body.deactivated).toBe(true)
    expect(body.warning).toMatch(/no active key/i)

    const list = await (await fetchApp("/api/keys")).json() as {
      gemini: { activeSlotId: string | null; slots: unknown[] }
    }
    // Q7: no auto-activate — activeSlotId should be null even though a
    // second slot still exists.
    expect(list.gemini.activeSlotId).toBeNull()
    expect(list.gemini.slots).toHaveLength(1)
  })

  it("unknown slot → 404 SLOT_NOT_FOUND", async () => {
    const res = await fetchApp("/api/keys/ks_nope/", { method: "DELETE" })
    expect(res.status).toBe(404)
  })
})

describe("POST /api/keys/:id/test — Session #14 Q8 + wiring", () => {
  it("returns full response shape (Phase 3 degrades gemini to status=unknown)", async () => {
    const slotId = await createGeminiSlot("test-slot", "api-key-abc")
    const res = await postJson(`/api/keys/${slotId}/test`, {})
    expect(res.status).toBe(200)
    const body = await res.json() as {
      slotId: string
      modelId: string
      status: string
      checkedAt: string
      message?: string
    }
    expect(body.slotId).toBe(slotId)
    expect(body.modelId).toBeTruthy()       // defaulted from modelsByProvider("gemini")[0]
    expect(body.status).toBe("unknown")     // Phase 3 fallback
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(body.message).toMatch(/phase 4/i)
  })

  it("rejects explicit modelId that does not belong to slot's provider → 400", async () => {
    const slotId = await createGeminiSlot("test-slot", "api-key-abc")
    const res = await postJson(`/api/keys/${slotId}/test`, { modelId: "mock-fast" })
    expect(res.status).toBe(400)
  })

  it("unknown slot → 404 SLOT_NOT_FOUND", async () => {
    const res = await postJson("/api/keys/ks_ghost/test", {})
    expect(res.status).toBe(404)
  })
})

describe("POST /api/keys — vertex multipart upload", () => {
  it("creates a Vertex slot, writes SA file, round-trips on GET", async () => {
    const serviceAccountJson = JSON.stringify({
      type: "service_account",
      project_id: "test-proj",
      client_email: "svc@test-proj.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n",
    })

    const form = new FormData()
    form.append("label", "vertex-primary")
    form.append("projectId", "test-proj")
    form.append("location", "us-central1")
    form.append(
      "file",
      new Blob([serviceAccountJson], { type: "application/json" }),
      "service-account.json",
    )

    const res = await fetchApp("/api/keys", { method: "POST", body: form })
    expect(res.status).toBe(201)
    const body = await res.json() as { slotId: string; provider: string }
    expect(body.provider).toBe("vertex")
    expect(body.slotId).toMatch(/^vs_/)

    // File exists on disk with the exact content
    const filePath = resolve(vertexDir, `vertex-${body.slotId}.json`)
    expect(existsSync(filePath)).toBe(true)
    const written = readFileSync(filePath, "utf8")
    expect(written).toBe(serviceAccountJson)

    // GET exposes hasCredentials: true (no serviceAccountPath leak)
    const listBody = await (await fetchApp("/api/keys")).json() as {
      vertex: { slots: { id: string; hasCredentials: boolean; [k: string]: unknown }[] }
    }
    const vSlot = listBody.vertex.slots.find((s) => s.id === body.slotId)
    expect(vSlot).toBeDefined()
    expect(vSlot?.hasCredentials).toBe(true)
    expect(vSlot).not.toHaveProperty("serviceAccountPath")
  })

  it("rejects multipart with non-JSON file → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const form = new FormData()
    form.append("label", "bad-mime")
    form.append("projectId", "p")
    form.append("location", "us-central1")
    form.append("file", new Blob(["text"], { type: "text/plain" }), "sa.txt")

    const res = await fetchApp("/api/keys", { method: "POST", body: form })
    expect(res.status).toBe(415)
    const err = await res.json() as { error: string; allowed: string[] }
    expect(err.error).toBe("UNSUPPORTED_MEDIA_TYPE")
    expect(err.allowed).toContain("application/json")
  })

  it("deleting an active Vertex slot removes the SA file from disk", async () => {
    const form = new FormData()
    form.append("label", "v-del")
    form.append("projectId", "p")
    form.append("location", "us-central1")
    form.append(
      "file",
      new Blob(["{\"type\":\"service_account\"}"], { type: "application/json" }),
      "sa.json",
    )
    const res = await fetchApp("/api/keys", { method: "POST", body: form })
    const { slotId } = await res.json() as { slotId: string }
    const filePath = resolve(vertexDir, `vertex-${slotId}.json`)
    expect(existsSync(filePath)).toBe(true)

    const del = await fetchApp(`/api/keys/${slotId}`, { method: "DELETE" })
    expect(del.status).toBe(200)   // Q7: active → 200 with deactivated flag
    expect(existsSync(filePath)).toBe(false)
  })
})
