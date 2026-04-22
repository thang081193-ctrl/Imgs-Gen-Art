// BOOTSTRAP-PHASE3 Step 6 — HTTP smoke for /api/profile-assets + the
// /api/profiles/:id/upload-asset multipart flow.
//
// Isolation:
//   - IMAGES_GEN_ART_PROFILE_ASSETS_DIR → mkdtempSync scope
//   - Uses a test-only profile (`zz-test-profile-*`) scrubbed afterAll to
//     avoid touching seeded profiles (chartlens / ai-chatbot / plant-id)
//   - In-memory asset-store per test (initAssetStore + reset)
//
// Covers:
//   Q3 — kind as form field (logo/badge/screenshot)
//   Q4 — expectedVersion guard BEFORE file write
//   MIME reject → 415; oversize → 413 (synthetic via maxBytes option is too
//     invasive to test at the route layer; we verify MIME reject is enough
//     for Step 6 — full size-cap test can live in a unit test on the helper)

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"
const PROFILES_DIR = resolve(process.cwd(), "data", "profiles")
const TEST_PREFIX = `zz-pa-test-${process.pid}-${Date.now()}-`

let tmpRoot: string
let uploadDir: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

function freshProfileBody(idSuffix: string) {
  return {
    id: `${TEST_PREFIX}${idSuffix}`,
    name: "Upload Test Profile",
    tagline: "integration fixture",
    category: "utility" as const,
    assets: {
      appLogoAssetId: null,
      storeBadgeAssetId: null,
      screenshotAssetIds: [],
    },
    visual: {
      primaryColor: "#112233",
      secondaryColor: "#445566",
      accentColor: "#778899",
      tone: "minimal" as const,
      doList: ["clean"],
      dontList: ["clutter"],
    },
    positioning: {
      usp: "test",
      targetPersona: "tester",
      marketTier: "global" as const,
    },
    context: { features: ["a"], keyScenarios: ["b"], forbiddenContent: ["c"] },
  }
}

async function createProfile(idSuffix: string): Promise<string> {
  const body = freshProfileBody(idSuffix)
  const res = await fetchApp("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  return body.id
}

async function uploadFile(
  profileId: string,
  kind: "logo" | "badge" | "screenshot",
  expectedVersion: number,
  mimeType: string = "image/png",
  fileBytes: Uint8Array = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xaa, 0xbb]),
  filename: string = "test.png",
): Promise<Response> {
  const form = new FormData()
  form.append("kind", kind)
  form.append("expectedVersion", String(expectedVersion))
  form.append("file", new Blob([fileBytes], { type: mimeType }), filename)
  return fetchApp(`/api/profiles/${profileId}/upload-asset`, {
    method: "POST",
    body: form,
  })
}

function scrubTestProfiles(): void {
  if (!existsSync(PROFILES_DIR)) return
  for (const f of readdirSync(PROFILES_DIR)) {
    if (f.startsWith(TEST_PREFIX)) {
      rmSync(resolve(PROFILES_DIR, f), { force: true })
    }
  }
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-profile-assets-"))
  uploadDir = join(tmpRoot, "profile-assets")
  process.env.IMAGES_GEN_ART_PROFILE_ASSETS_DIR = uploadDir
})

afterAll(() => {
  delete process.env.IMAGES_GEN_ART_PROFILE_ASSETS_DIR
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
  scrubTestProfiles()
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  scrubTestProfiles()
})

describe("POST /api/profiles/:id/upload-asset — happy paths", () => {
  it("logo upload writes file + mutates profile.appLogoAssetId + returns 201", async () => {
    const profileId = await createProfile("logo-happy")

    const res = await uploadFile(profileId, "logo", 1)
    expect(res.status).toBe(201)
    const body = await res.json() as { assetId: string; kind: string; profileId: string }
    expect(body.kind).toBe("logo")
    expect(body.profileId).toBe(profileId)
    expect(body.assetId).toMatch(/^pa_/)

    // File exists on disk under the tmp upload dir.
    const diskPath = resolve(uploadDir, profileId, `${body.assetId}.png`)
    expect(existsSync(diskPath)).toBe(true)

    // Profile has appLogoAssetId set now; DTO exposes an imageUrl.
    const profileRes = await fetchApp(`/api/profiles/${profileId}`)
    const dto = await profileRes.json() as { assets: { appLogoUrl: string | null } }
    expect(dto.assets.appLogoUrl).toBe(`/api/profile-assets/${body.assetId}/file`)
  })

  it("screenshot kind pushes into screenshotAssetIds array", async () => {
    const profileId = await createProfile("screenshot-push")

    const first = await uploadFile(profileId, "screenshot", 1)
    expect(first.status).toBe(201)
    const firstId = (await first.json() as { assetId: string }).assetId

    const second = await uploadFile(profileId, "screenshot", 1)
    expect(second.status).toBe(201)
    const secondId = (await second.json() as { assetId: string }).assetId

    const profile = await (await fetchApp(`/api/profiles/${profileId}`)).json() as {
      assets: { screenshotUrls: string[] }
    }
    expect(profile.assets.screenshotUrls).toHaveLength(2)
    expect(profile.assets.screenshotUrls).toContain(`/api/profile-assets/${firstId}/file`)
    expect(profile.assets.screenshotUrls).toContain(`/api/profile-assets/${secondId}/file`)
  })
})

describe("POST /api/profiles/:id/upload-asset — guards (Q4 version + Q2 mime)", () => {
  it("version mismatch → 409 BEFORE file write (no orphan)", async () => {
    const profileId = await createProfile("version-guard")
    const preFileCount = existsSync(uploadDir) ? readdirSync(uploadDir).length : 0

    const res = await uploadFile(profileId, "logo", 99)
    expect(res.status).toBe(409)
    const err = await res.json() as { error: string; currentVersion: number; expectedVersion: number }
    expect(err.error).toBe("VERSION_CONFLICT")
    expect(err.currentVersion).toBe(1)
    expect(err.expectedVersion).toBe(99)

    const postFileCount = existsSync(uploadDir) ? readdirSync(uploadDir).length : 0
    expect(postFileCount).toBe(preFileCount)
  })

  it("missing profile → 404 NOT_FOUND", async () => {
    const res = await uploadFile(`${TEST_PREFIX}ghost`, "logo", 1)
    expect(res.status).toBe(404)
  })

  it("unsupported MIME (text/plain) → 415", async () => {
    const profileId = await createProfile("mime-reject")
    const form = new FormData()
    form.append("kind", "logo")
    form.append("expectedVersion", "1")
    form.append("file", new Blob(["not an image"], { type: "text/plain" }), "x.txt")
    const res = await fetchApp(`/api/profiles/${profileId}/upload-asset`, {
      method: "POST",
      body: form,
    })
    expect(res.status).toBe(415)
    const err = await res.json() as { error: string; allowed: string[] }
    expect(err.error).toBe("UNSUPPORTED_MEDIA_TYPE")
    expect(err.allowed).toContain("image/png")
  })

  it("invalid kind field → 400", async () => {
    const profileId = await createProfile("kind-invalid")
    const form = new FormData()
    form.append("kind", "icon")   // not in enum
    form.append("expectedVersion", "1")
    form.append("file", new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" }), "x.png")
    const res = await fetchApp(`/api/profiles/${profileId}/upload-asset`, {
      method: "POST",
      body: form,
    })
    expect(res.status).toBe(400)
  })
})

describe("GET /api/profile-assets/:id/file", () => {
  it("streams the uploaded file's bytes with correct Content-Type", async () => {
    const profileId = await createProfile("get-file")
    const uploadRes = await uploadFile(profileId, "logo", 1)
    const { assetId } = await uploadRes.json() as { assetId: string }

    const res = await fetchApp(`/api/profile-assets/${assetId}/file`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf[0]).toBe(0x89)  // PNG magic byte 0
    expect(buf[8]).toBe(0xaa)  // fixture byte from uploadFile()
  })

  it("unknown id → 404", async () => {
    const res = await fetchApp("/api/profile-assets/pa_nope/file")
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/profile-assets/:id", () => {
  it("removes DB row + file → 204", async () => {
    const profileId = await createProfile("del-happy")
    const uploadRes = await uploadFile(profileId, "logo", 1)
    const { assetId } = await uploadRes.json() as { assetId: string }
    const filePath = resolve(uploadDir, profileId, `${assetId}.png`)
    expect(existsSync(filePath)).toBe(true)

    const del = await fetchApp(`/api/profile-assets/${assetId}`, { method: "DELETE" })
    expect(del.status).toBe(204)
    expect(existsSync(filePath)).toBe(false)

    const check = await fetchApp(`/api/profile-assets/${assetId}/file`)
    expect(check.status).toBe(404)
  })

  it("unknown id → 404 PROFILE_ASSET_NOT_FOUND", async () => {
    const res = await fetchApp("/api/profile-assets/nope", { method: "DELETE" })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("PROFILE_ASSET_NOT_FOUND")
  })
})

describe("round-trip — upload then stream binary equality", () => {
  it("bytes written = bytes read", async () => {
    const profileId = await createProfile("roundtrip")
    const fileBytes = new Uint8Array(64)
    for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = i
    // Make it look like a PNG (helper enforces image/* mime)
    const pngWrap = new Uint8Array(8 + fileBytes.length)
    pngWrap.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    pngWrap.set(fileBytes, 8)

    const uploadRes = await uploadFile(profileId, "logo", 1, "image/png", pngWrap, "x.png")
    const { assetId } = await uploadRes.json() as { assetId: string }
    const filePath = resolve(uploadDir, profileId, `${assetId}.png`)
    const onDisk = new Uint8Array(readFileSync(filePath))
    expect(onDisk.length).toBe(pngWrap.length)
    for (let i = 0; i < onDisk.length; i++) expect(onDisk[i]).toBe(pngWrap[i])
  })
})
