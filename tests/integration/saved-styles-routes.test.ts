// Session #37 Phase A1 — integration tests for /api/saved-styles + the
// boot-time preset seeder. SQLite in-memory fixture per Q-37.G; no live
// Vertex calls. Covers:
//   1. Preset seed inserts 3 legacy rows + is idempotent on re-run
//   2. GET /api/saved-styles returns seeded presets
//   3. GET /api/saved-styles?lane=ads filters by lane prefix
//   4. POST creates a user style; kind defaults to 'user' (not 'preset-legacy')
//   5. POST 400 on slug collision
//   6. PATCH 200 on user row; 403 PRESET_LOCKED on preset row
//   7. DELETE 204 on user row; 403 on preset row; 404 on unknown id
//   8. lane column default 'legacy' lands on existing assets schema

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { SavedStyleDto } from "@/core/dto/saved-style-dto"
import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getSavedStylesRepo,
  initAssetStore,
} from "@/server/asset-store"
import { seedPresetsIfNeeded } from "@/server/saved-styles/seed-presets"
import { preloadAllTemplates } from "@/server/templates"

const TEST_VERSION = "0.0.0-test"

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

beforeAll(() => {
  preloadAllTemplates()
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  _resetAssetStoreForTests()
})

describe("seedPresetsIfNeeded — boot seeding", () => {
  it("1a. inserts 3 legacy presets on first call", () => {
    const result = seedPresetsIfNeeded(getSavedStylesRepo())
    expect(result.inserted.sort()).toEqual([
      "ad-legacy",
      "artwork-legacy",
      "style-legacy",
    ])
    expect(result.skipped).toEqual([])
  })

  it("1b. is idempotent — second call inserts 0 and skips 3", () => {
    seedPresetsIfNeeded(getSavedStylesRepo())
    const second = seedPresetsIfNeeded(getSavedStylesRepo())
    expect(second.inserted).toEqual([])
    expect(second.skipped.sort()).toEqual([
      "ad-legacy",
      "artwork-legacy",
      "style-legacy",
    ])
  })
})

describe("GET /api/saved-styles — list + filter", () => {
  beforeEach(() => seedPresetsIfNeeded(getSavedStylesRepo()))

  it("2. returns the 3 seeded presets", async () => {
    const res = await fetchApp("/api/saved-styles")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { styles: SavedStyleDto[] }
    expect(body.styles).toHaveLength(3)
    expect(body.styles.every((s) => s.kind === "preset-legacy")).toBe(true)
  })

  it("3a. ?lane=ads matches all 3 (each has at least one ads.* tag)", async () => {
    const res = await fetchApp("/api/saved-styles?lane=ads")
    const body = (await res.json()) as { styles: SavedStyleDto[] }
    expect(body.styles).toHaveLength(3)
  })

  it("3b. ?lane=aso matches only style-legacy", async () => {
    const res = await fetchApp("/api/saved-styles?lane=aso")
    const body = (await res.json()) as { styles: SavedStyleDto[] }
    expect(body.styles.map((s) => s.slug)).toEqual(["style-legacy"])
  })

  it("3c. ?lane=ads.meta exact-matches all 3", async () => {
    const res = await fetchApp("/api/saved-styles?lane=ads.meta")
    const body = (await res.json()) as { styles: SavedStyleDto[] }
    expect(body.styles).toHaveLength(3)
  })
})

describe("POST /api/saved-styles — user create", () => {
  it("4. creates a user style with kind forced to 'user'", async () => {
    const res = await fetchApp("/api/saved-styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "neon-pop",
        name: "Neon Pop",
        promptTemplate: "neon palette, high contrast",
        lanes: ["ads.meta"],
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as SavedStyleDto
    expect(body.kind).toBe("user")
    expect(body.usageCount).toBe(0)
    expect(body.previewAssetUrl).toBeNull()
  })

  it("5. 400 on slug collision with seeded preset", async () => {
    seedPresetsIfNeeded(getSavedStylesRepo())
    const res = await fetchApp("/api/saved-styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "artwork-legacy",
        name: "duplicate",
        promptTemplate: "x",
        lanes: ["ads.meta"],
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe("PATCH + DELETE — preset lock-out", () => {
  beforeEach(() => seedPresetsIfNeeded(getSavedStylesRepo()))

  async function findPresetId(slug: string): Promise<string> {
    const repo = getSavedStylesRepo()
    const found = repo.findBySlug(slug)
    if (!found) throw new Error(`preset '${slug}' missing`)
    return found.id
  }

  it("6a. PATCH 403 PRESET_LOCKED on preset row", async () => {
    const id = await findPresetId("artwork-legacy")
    const res = await fetchApp(`/api/saved-styles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rename attempt" }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("PRESET_LOCKED")
  })

  it("6b. PATCH 200 on user row; updated fields surface", async () => {
    const create = await fetchApp("/api/saved-styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "user-one",
        name: "Original",
        promptTemplate: "original",
        lanes: ["ads.meta"],
      }),
    })
    const created = (await create.json()) as SavedStyleDto
    const res = await fetchApp(`/api/saved-styles/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed", lanes: ["ads.meta", "aso.play"] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as SavedStyleDto
    expect(body.name).toBe("Renamed")
    expect(body.lanes).toEqual(["ads.meta", "aso.play"])
  })

  it("7a. DELETE 403 on preset row", async () => {
    const id = await findPresetId("style-legacy")
    const res = await fetchApp(`/api/saved-styles/${id}`, { method: "DELETE" })
    expect(res.status).toBe(403)
  })

  it("7b. DELETE 204 on user row + 404 on unknown id", async () => {
    const create = await fetchApp("/api/saved-styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "user-two",
        name: "Two",
        promptTemplate: "x",
        lanes: ["ads.google-ads"],
      }),
    })
    const created = (await create.json()) as SavedStyleDto
    const del = await fetchApp(`/api/saved-styles/${created.id}`, { method: "DELETE" })
    expect(del.status).toBe(204)
    const refetch = await fetchApp(`/api/saved-styles/${created.id}`)
    expect(refetch.status).toBe(404)
    const unknown = await fetchApp(`/api/saved-styles/style_does_not_exist`, {
      method: "DELETE",
    })
    expect(unknown.status).toBe(404)
  })
})
