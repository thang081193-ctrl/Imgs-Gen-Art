// BOOTSTRAP-PHASE3 Step 5 — HTTP smoke for /api/profiles.
//
// Tests exercise the real data/profiles/ directory (loader/saver don't
// accept a dir override at the route layer). To avoid colliding with the 3
// seeded profiles (chartlens, ai-chatbot, plant-identifier), every test
// that writes uses a pid-scoped prefix; afterEach scrubs anything that
// matches. The seeded profiles are read-only touched (GET /:id, list
// returns >= 3).
//
// Asset-count DELETE guard — covered via an in-memory asset store so a
// genuine `assetRepo.insert()` row exists pointing at a test profile;
// countByProfile() reads it and the route returns 409.

import { existsSync, readdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"
const TEST_PREFIX = `zz-test-${process.pid}-${Date.now()}-`
const PROFILES_DIR = resolve(process.cwd(), "data", "profiles")

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

function freshBody(idSuffix: string) {
  return {
    id: `${TEST_PREFIX}${idSuffix}`,
    name: "Test Profile",
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
      usp: "test usp",
      targetPersona: "integration tester",
      marketTier: "global" as const,
    },
    context: {
      features: ["feature a"],
      keyScenarios: ["scenario a"],
      forbiddenContent: ["forbidden a"],
    },
  }
}

function scrubTestFiles(): void {
  if (!existsSync(PROFILES_DIR)) return
  for (const f of readdirSync(PROFILES_DIR)) {
    if (f.startsWith(TEST_PREFIX)) {
      rmSync(resolve(PROFILES_DIR, f), { force: true })
    }
  }
}

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  scrubTestFiles()
})

describe("GET /api/profiles", () => {
  it("returns list including the 3 seeded profiles", async () => {
    const res = await fetchApp("/api/profiles")
    expect(res.status).toBe(200)
    const body = await res.json() as { profiles: { id: string }[] }
    const ids = body.profiles.map((p) => p.id)
    expect(ids).toContain("chartlens")
    expect(ids).toContain("ai-chatbot")
    expect(ids).toContain("plant-identifier")
  })

  it("summary DTO has logoUrl null when no appLogoAssetId", async () => {
    const res = await fetchApp("/api/profiles")
    const body = await res.json() as {
      profiles: { id: string; logoUrl: string | null }[]
    }
    const chartlens = body.profiles.find((p) => p.id === "chartlens")
    expect(chartlens?.logoUrl).toBeNull()
  })
})

describe("GET /api/profiles/:id", () => {
  it("returns full DTO for seeded profile", async () => {
    const res = await fetchApp("/api/profiles/chartlens")
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; version: number; assets: { appLogoUrl: string | null } }
    expect(body.id).toBe("chartlens")
    expect(body.version).toBe(1)
    expect(body.assets.appLogoUrl).toBeNull()
  })

  it("unknown id → 404 NOT_FOUND", async () => {
    const res = await fetchApp("/api/profiles/does-not-exist-123")
    expect(res.status).toBe(404)
    const err = await res.json() as { code: string }
    expect(err.code).toBe("NOT_FOUND")
  })
})

describe("POST /api/profiles", () => {
  it("creates a profile at the supplied id → 201", async () => {
    const body = freshBody("create-happy")
    const res = await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(201)
    const dto = await res.json() as { id: string; version: number }
    expect(dto.id).toBe(body.id)
    expect(dto.version).toBe(1)
  })

  it("derives id from slugified name when id omitted", async () => {
    const body = freshBody("ignored-will-regen")
    const bodyNoId: Partial<typeof body> = { ...body }
    delete bodyNoId.id
    bodyNoId.name = `${TEST_PREFIX}SlugFromName`
    const res = await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyNoId),
    })
    expect(res.status).toBe(201)
    const dto = await res.json() as { id: string }
    // slugify lowercases + replaces non-alnum with '-'
    expect(dto.id.startsWith("zz-test-")).toBe(true)
    expect(dto.id).toMatch(/slugfromname$/)
  })

  it("rejects duplicate id → 400", async () => {
    const body = freshBody("dup")
    const first = await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(first.status).toBe(201)
    const second = await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(second.status).toBe(400)
  })

  it("rejects body missing required fields → 400", async () => {
    const res = await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: `${TEST_PREFIX}partial` }),
    })
    expect(res.status).toBe(400)
  })
})

describe("PUT /api/profiles/:id", () => {
  it("updates tagline with matching expectedVersion → 200", async () => {
    const body = freshBody("put-happy")
    await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const res = await fetchApp(`/api/profiles/${body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, tagline: "updated tagline" }),
    })
    expect(res.status).toBe(200)
    const dto = await res.json() as { tagline: string; version: number }
    expect(dto.tagline).toBe("updated tagline")
    // Session #31 v2 — PUT bumps version on success (DECISIONS §F.3).
    expect(dto.version).toBe(2)
  })

  it("version conflict returns augmented 409 shape (legacy flat + code + details)", async () => {
    const body = freshBody("put-conflict")
    await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const res = await fetchApp(`/api/profiles/${body.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 99, tagline: "nope" }),
    })
    expect(res.status).toBe(409)
    const err = await res.json() as {
      error: string
      code: string
      currentVersion: number
      expectedVersion: number
      details: { currentVersion: number; expectedVersion: number }
    }
    // Legacy flat fields — retained for back-compat (DECISIONS §F.3.1).
    expect(err.error).toBe("VERSION_CONFLICT")
    expect(err.currentVersion).toBe(1)
    expect(err.expectedVersion).toBe(99)
    // New Session #31 fields — flows conflict info through ApiError envelope.
    expect(err.code).toBe("VERSION_CONFLICT")
    expect(err.details.currentVersion).toBe(1)
    expect(err.details.expectedVersion).toBe(99)
  })

  it("unknown id → 404", async () => {
    const res = await fetchApp(`/api/profiles/${TEST_PREFIX}nope`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, tagline: "x" }),
    })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/profiles/:id", () => {
  it("deletes a profile with no assets → 204", async () => {
    const body = freshBody("del-happy")
    await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const res = await fetchApp(`/api/profiles/${body.id}`, { method: "DELETE" })
    expect(res.status).toBe(204)

    const check = await fetchApp(`/api/profiles/${body.id}`)
    expect(check.status).toBe(404)
  })

  it("unknown id → 404 PROFILE_NOT_FOUND", async () => {
    const res = await fetchApp(`/api/profiles/${TEST_PREFIX}ghost`, {
      method: "DELETE",
    })
    expect(res.status).toBe(404)
    const err = await res.json() as { error: string }
    expect(err.error).toBe("PROFILE_NOT_FOUND")
  })

  it("profile with assets → 409 PROFILE_HAS_ASSETS", async () => {
    const body = freshBody("del-blocked")
    await fetchApp("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    getAssetRepo().insert({
      id: "asset_test_block_del",
      profileId: body.id,
      profileVersionAtGen: 1,
      workflowId: "artwork-batch",
      batchId: null,
      variantGroup: null,
      promptRaw: "x",
      promptTemplateId: null,
      promptTemplateVersion: null,
      inputParams: "{}",
      replayPayload: null,
      replayClass: "deterministic",
      providerId: "mock",
      modelId: "mock-fast",
      seed: 1,
      aspectRatio: "1:1",
      language: null,
      filePath: "data/assets/x/x.png",
      width: 1024,
      height: 1024,
      fileSizeBytes: 10,
      status: "completed",
      errorMessage: null,
      generationTimeMs: 10,
      costUsd: 0,
      tags: null,
      notes: null,
      replayedFrom: null,
    })

    const res = await fetchApp(`/api/profiles/${body.id}`, { method: "DELETE" })
    expect(res.status).toBe(409)
    const err = await res.json() as {
      error: string
      profileId: string
      assetCount: number
    }
    expect(err.error).toBe("PROFILE_HAS_ASSETS")
    expect(err.profileId).toBe(body.id)
    expect(err.assetCount).toBe(1)
  })
})

describe("GET /api/profiles/:id/export", () => {
  it("returns raw AppProfile JSON with Content-Disposition header", async () => {
    const res = await fetchApp("/api/profiles/chartlens/export")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition") ?? "").toContain("chartlens.json")
    const body = await res.json() as { version: number; id: string }
    expect(body.version).toBe(1)
    expect(body.id).toBe("chartlens")
  })

  it("unknown id → 404", async () => {
    const res = await fetchApp("/api/profiles/nope-xxx/export")
    expect(res.status).toBe(404)
  })
})

describe("POST /api/profiles/import", () => {
  it("round-trips from export → import with same shape", async () => {
    const exp = await fetchApp("/api/profiles/chartlens/export")
    const profile = await exp.json() as Record<string, unknown>
    // Rename so we don't collide with the seeded id
    const imported = { ...profile, id: `${TEST_PREFIX}imported` }

    const res = await fetchApp("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(imported),
    })
    expect(res.status).toBe(201)
    const dto = await res.json() as { id: string; version: number }
    expect(dto.id).toBe(`${TEST_PREFIX}imported`)
    expect(dto.version).toBe(1)
  })

  it("rejects import when profile already exists → 400", async () => {
    const exp = await fetchApp("/api/profiles/chartlens/export")
    const profile = await exp.json() as Record<string, unknown>
    const res = await fetchApp("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    })
    expect(res.status).toBe(400)
  })

  it("rejects malformed body → 400", async () => {
    const res = await fetchApp("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, id: "x" }), // missing most required fields
    })
    expect(res.status).toBe(400)
  })
})
