// Session #17 Step 9 — profile CRUD lifecycle narrative.
//
// One single happy-path story exercising the full lifecycle:
//   POST create → GET read → PUT update (correct expectedVersion)
//   → PUT with stale expectedVersion (409) → DELETE → GET 404.
//
// Complements the per-case coverage in profiles-routes.test.ts: that file
// asserts every branch in isolation; this file asserts they CHAIN.

import { existsSync, readdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"
const TEST_PREFIX = `zz-crud-${process.pid}-${Date.now()}-`
const PROFILES_DIR = resolve(process.cwd(), "data", "profiles")

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

function postJson(path: string, body: unknown, method = "POST"): Promise<Response> {
  return fetchApp(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function scrubTestFiles(): void {
  if (!existsSync(PROFILES_DIR)) return
  for (const f of readdirSync(PROFILES_DIR)) {
    if (f.startsWith(TEST_PREFIX)) rmSync(resolve(PROFILES_DIR, f), { force: true })
  }
}

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  scrubTestFiles()
})

describe("Profile CRUD lifecycle — one narrative story", () => {
  it("create → read → update → stale-update 409 → delete → read 404", async () => {
    const id = `${TEST_PREFIX}story`
    const createPayload = {
      id,
      name: "Crud Story",
      tagline: "narrative test fixture",
      category: "utility" as const,
      assets: {
        appLogoAssetId: null,
        storeBadgeAssetId: null,
        screenshotAssetIds: [],
      },
      visual: {
        primaryColor: "#102030",
        secondaryColor: "#405060",
        accentColor: "#708090",
        tone: "minimal" as const,
        doList: ["clean"],
        dontList: ["noise"],
      },
      positioning: {
        usp: "testing",
        targetPersona: "tester",
        marketTier: "global" as const,
      },
      context: {
        features: ["feature a"],
        keyScenarios: ["scenario a"],
        forbiddenContent: ["fc a"],
      },
    }

    // 1. POST /api/profiles → 201 + version=1
    const createRes = await postJson("/api/profiles", createPayload)
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { id: string; version: number }
    expect(created.id).toBe(id)
    expect(created.version).toBe(1)

    // 2. GET /api/profiles/:id → 200 + same body shape (no path leaks)
    const getRes = await fetchApp(`/api/profiles/${id}`)
    expect(getRes.status).toBe(200)
    const fetched = await getRes.json() as {
      id: string; version: number; name: string
      assets: { appLogoUrl: string | null; screenshotUrls: string[] }
    }
    expect(fetched.id).toBe(id)
    expect(fetched.version).toBe(1)
    expect(fetched.name).toBe("Crud Story")
    // ProfileDto exposes appLogoUrl (path → URL mapping) not the raw asset id.
    // Null here because we never uploaded a logo.
    expect(fetched.assets.appLogoUrl).toBeNull()
    expect(fetched.assets.screenshotUrls).toEqual([])

    // 3. PUT with correct expectedVersion → 200 + version bumps 1→2.
    //    Session #31 v2 migration (DECISIONS §F.3) — PUT now bumps.
    const putRes = await postJson(
      `/api/profiles/${id}`,
      { name: "Crud Story — Updated", expectedVersion: 1 },
      "PUT",
    )
    expect(putRes.status).toBe(200)
    const updated = await putRes.json() as { name: string; version: number }
    expect(updated.name).toBe("Crud Story — Updated")
    expect(updated.version).toBe(2)

    // 4. PUT with stale expectedVersion → 409 VERSION_CONFLICT.
    //    currentVersion is 2 (post-bump); 999 expected forces the 409.
    const staleRes = await postJson(
      `/api/profiles/${id}`,
      { name: "Stale write attempt", expectedVersion: 999 },
      "PUT",
    )
    expect(staleRes.status).toBe(409)
    const conflict = await staleRes.json() as {
      error: string
      code: string
      currentVersion: number
      expectedVersion: number
      details: { currentVersion: number; expectedVersion: number }
    }
    expect(conflict.error).toBe("VERSION_CONFLICT")
    expect(conflict.code).toBe("VERSION_CONFLICT")
    expect(conflict.expectedVersion).toBe(999)
    expect(conflict.currentVersion).toBe(2)
    expect(conflict.details.currentVersion).toBe(2)
    expect(conflict.details.expectedVersion).toBe(999)

    // 5. DELETE /api/profiles/:id → 204 (no assets blocker since in-memory store is empty)
    const delRes = await fetchApp(`/api/profiles/${id}`, { method: "DELETE" })
    expect(delRes.status).toBe(204)

    // 6. GET after delete → 404 NOT_FOUND
    const gone = await fetchApp(`/api/profiles/${id}`)
    expect(gone.status).toBe(404)
    const errBody = await gone.json() as { code: string }
    expect(errBody.code).toBe("NOT_FOUND")
  })

  // Session #31 — real preserve-edits-on-409 flow: two concurrent
  // PUTs from separate client tabs; the loser refetches the latest
  // version and issues an Overwrite-Save that succeeds (DECISIONS §F.4).
  it("preserve-edits-on-409 — two tabs, loser refetches + Overwrite-Saves", async () => {
    const id = `${TEST_PREFIX}preserve-edits`
    const baseBody = {
      id,
      name: "Two Tab Story",
      tagline: "v1 baseline",
      category: "utility" as const,
      assets: {
        appLogoAssetId: null,
        storeBadgeAssetId: null,
        screenshotAssetIds: [],
      },
      visual: {
        primaryColor: "#010203",
        secondaryColor: "#040506",
        accentColor: "#070809",
        tone: "minimal" as const,
        doList: ["x"],
        dontList: ["y"],
      },
      positioning: {
        usp: "u", targetPersona: "p", marketTier: "global" as const,
      },
      context: {
        features: ["f"], keyScenarios: ["s"], forbiddenContent: ["c"],
      },
    }

    // Create baseline — version=1.
    const createRes = await postJson("/api/profiles", baseBody)
    expect(createRes.status).toBe(201)

    // Tab A wins the race: PUT succeeds, version 1 → 2.
    const tabARes = await postJson(
      `/api/profiles/${id}`,
      { tagline: "tab A won", expectedVersion: 1 },
      "PUT",
    )
    expect(tabARes.status).toBe(200)
    const tabA = await tabARes.json() as { version: number; tagline: string }
    expect(tabA.version).toBe(2)
    expect(tabA.tagline).toBe("tab A won")

    // Tab B loses with stale expectedVersion=1. 409 body carries
    // currentVersion=2 via both legacy flat + new `details` fields.
    const tabBFail = await postJson(
      `/api/profiles/${id}`,
      { tagline: "tab B edits — preserved", expectedVersion: 1 },
      "PUT",
    )
    expect(tabBFail.status).toBe(409)
    const conflict = await tabBFail.json() as {
      details: { currentVersion: number }
    }
    expect(conflict.details.currentVersion).toBe(2)

    // Tab B refetches latest to learn remote version. UI would show
    // the banner here while preserving the user's "tab B edits" draft.
    const refetch = await fetchApp(`/api/profiles/${id}`)
    const latest = await refetch.json() as { version: number; tagline: string }
    expect(latest.version).toBe(2)
    expect(latest.tagline).toBe("tab A won")

    // Tab B Overwrite-Saves with expectedVersion = latest.version.
    // Its preserved edits ("tab B edits — preserved") overwrite tab A's.
    const overwriteRes = await postJson(
      `/api/profiles/${id}`,
      { tagline: "tab B edits — preserved", expectedVersion: latest.version },
      "PUT",
    )
    expect(overwriteRes.status).toBe(200)
    const final = await overwriteRes.json() as { version: number; tagline: string }
    expect(final.version).toBe(3)
    expect(final.tagline).toBe("tab B edits — preserved")
  })
})
