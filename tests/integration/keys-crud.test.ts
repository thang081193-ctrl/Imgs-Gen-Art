// Session #17 Step 9 — key slot CRUD lifecycle narrative.
//
// Two stories chained E2E:
//   gemini: POST (JSON) → GET strip → test → DELETE active → GET empty
//   vertex: POST (multipart) → GET strip → test → DELETE active → file unlink
//
// Complements per-case keys-routes.test.ts edge coverage. Here the focus
// is: "does a full lifecycle WORK without test-internal state leak
// (keyEncrypted anywhere, serviceAccountPath anywhere, file orphaned)?"

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

function postJson(path: string, body: unknown): Promise<Response> {
  return fetchApp(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-keys-crud-"))
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

describe("Gemini slot lifecycle — create → test → delete", () => {
  it("POST → GET → test → DELETE active → GET empty (no keyEncrypted in DTOs)", async () => {
    // 1. POST — auto-activates first slot.
    const createRes = await postJson("/api/keys", {
      provider: "gemini",
      label: "primary",
      key: "AIza_testkey_1234567890_abcdefghijklmnop",
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { slotId: string }
    expect(created.slotId).toMatch(/^ks_/)

    // 2. GET — slot present + active + keyEncrypted stripped.
    const getRes = await fetchApp("/api/keys")
    const getBody = await getRes.json() as {
      gemini: { activeSlotId: string; slots: Record<string, unknown>[] }
    }
    expect(getBody.gemini.activeSlotId).toBe(created.slotId)
    expect(getBody.gemini.slots).toHaveLength(1)
    expect(getBody.gemini.slots[0]).not.toHaveProperty("keyEncrypted")
    expect(getBody.gemini.slots[0]).toMatchObject({
      id: created.slotId,
      label: "primary",
    })

    // 3. POST /:id/test — Phase 3 graceful-degrades to "unknown" for gemini
    //    (real provider registers in Phase 4; Mock-only keys route for now).
    const testRes = await postJson(`/api/keys/${created.slotId}/test`, {})
    expect(testRes.status).toBe(200)
    const testBody = await testRes.json() as { status: string; slotId: string }
    expect(testBody.slotId).toBe(created.slotId)
    expect(["ok", "unknown", "down"]).toContain(testBody.status)

    // 4. DELETE active → 200 + deactivated:true + warning (Q7 semantics).
    const delRes = await fetchApp(`/api/keys/${created.slotId}`, { method: "DELETE" })
    expect(delRes.status).toBe(200)
    const delBody = await delRes.json() as {
      deleted: boolean; deactivated: boolean; warning: string
    }
    expect(delBody.deleted).toBe(true)
    expect(delBody.deactivated).toBe(true)
    expect(delBody.warning).toMatch(/active/i)

    // 5. GET after delete — empty store.
    const emptyRes = await fetchApp("/api/keys")
    const emptyBody = await emptyRes.json() as {
      gemini: { activeSlotId: null; slots: unknown[] }
    }
    expect(emptyBody.gemini.slots).toEqual([])
    expect(emptyBody.gemini.activeSlotId).toBeNull()
  })
})

describe("Vertex slot lifecycle — multipart upload → delete with file unlink", () => {
  it("POST multipart → GET strip → DELETE active → file unlinked + no orphan", async () => {
    // 1. POST multipart — upload a stub service-account JSON.
    const fakeSa = {
      project_id: "test-proj",
      client_email: "t@t.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
      type: "service_account",
    }
    const form = new FormData()
    form.append("label", "vertex-us-central1")
    form.append("projectId", "test-proj")
    form.append("location", "us-central1")
    // Multipart dispatch: route sees `file` field → treats POST as Vertex SA upload.
    form.append(
      "file",
      new Blob([JSON.stringify(fakeSa)], { type: "application/json" }),
      "sa.json",
    )
    const createRes = await fetchApp("/api/keys", { method: "POST", body: form })
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { slotId: string }
    expect(created.slotId).toMatch(/^vs_/)

    // Verify SA file landed on disk (path is INTERNAL — not in any DTO).
    const savedFiles = readdirSync(vertexDir)
    expect(savedFiles.some((f) => f.includes(created.slotId))).toBe(true)

    // 2. GET — no serviceAccountPath leak, has projectId + hasCredentials.
    const getRes = await fetchApp("/api/keys")
    const body = await getRes.json() as {
      vertex: { activeSlotId: string; slots: Record<string, unknown>[] }
    }
    expect(body.vertex.activeSlotId).toBe(created.slotId)
    expect(body.vertex.slots).toHaveLength(1)
    const slot = body.vertex.slots[0]!
    expect(slot).not.toHaveProperty("serviceAccountPath")
    expect(slot).not.toHaveProperty("keyEncrypted")
    expect(slot).toMatchObject({
      id: created.slotId,
      label: "vertex-us-central1",
      projectId: "test-proj",
      location: "us-central1",
    })
    expect(slot.hasCredentials).toBe(true)

    // 3. DELETE active vertex slot → 200 + file should be unlinked.
    const delRes = await fetchApp(`/api/keys/${created.slotId}`, { method: "DELETE" })
    expect(delRes.status).toBe(200)

    // Verify: no file with this slotId remains (Rule 11 — no orphans).
    const remaining = existsSync(vertexDir) ? readdirSync(vertexDir) : []
    expect(remaining.some((f) => f.includes(created.slotId))).toBe(false)

    // 4. GET — empty again.
    const finalRes = await fetchApp("/api/keys")
    const finalBody = await finalRes.json() as {
      vertex: { activeSlotId: null; slots: unknown[] }
    }
    expect(finalBody.vertex.slots).toEqual([])
    expect(finalBody.vertex.activeSlotId).toBeNull()
  })
})
