// Session #32 F4 — HTTP smoke for GET /api/tags autocomplete endpoint.
//
// Seeds assets with a few tag combinations into an in-memory DB, then exercises
// the 7 acceptance cases locked at F4 kickoff + NULL-row + under-limit edges.

import { beforeEach, describe, expect, it } from "vitest"

import { asWorkflowId } from "@/core/design/types"
import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  initAssetStore,
} from "@/server/asset-store/context"

const TEST_VERSION = "0.0.0-test"

function fetchApp(path: string): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`))
}

function seedAssetWithTags(id: string, tags: string[] | undefined): void {
  getAssetRepo().insert({
    id,
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: asWorkflowId("artwork-batch"),
    promptRaw: "test",
    inputParams: "{}",
    replayClass: "deterministic",
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    filePath: `/tmp/${id}.png`,
    status: "completed",
    tags,
  })
}

interface TagsResponse {
  tags: { tag: string; count: number }[]
  total: number
}

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

describe("GET /api/tags — distinct tag autocomplete", () => {
  it("1. empty q returns all distinct tags ordered by count DESC, tag ASC", async () => {
    seedAssetWithTags("a1", ["foo", "bar"])
    seedAssetWithTags("a2", ["foo", "baz"])
    seedAssetWithTags("a3", ["foo"])
    seedAssetWithTags("a4", ["bar"])

    const res = await fetchApp("/api/tags")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    expect(body.tags).toEqual([
      { tag: "foo", count: 3 },
      { tag: "bar", count: 2 },
      { tag: "baz", count: 1 },
    ])
    expect(body.total).toBe(3)
  })

  it("2. q prefix filters results", async () => {
    seedAssetWithTags("a1", ["food", "bar", "foo"])
    seedAssetWithTags("a2", ["fool"])

    const res = await fetchApp("/api/tags?q=foo")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    const names = body.tags.map((t) => t.tag).sort()
    expect(names).toEqual(["foo", "food", "fool"])
    expect(body.total).toBe(3)
  })

  it("3. prefix match is case-insensitive", async () => {
    seedAssetWithTags("a1", ["Food", "FOOBAR"])
    seedAssetWithTags("a2", ["foo"])

    const res = await fetchApp("/api/tags?q=Foo")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    expect(body.tags.map((t) => t.tag).sort()).toEqual(["FOOBAR", "Food", "foo"])
  })

  it("4. limit above cap (51) → 400 BAD_REQUEST", async () => {
    const res = await fetchApp("/api/tags?limit=51")
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("BAD_REQUEST")
  })

  it("5. q length above cap (101 chars) → 400", async () => {
    const longQ = "a".repeat(101)
    const res = await fetchApp(`/api/tags?q=${longQ}`)
    expect(res.status).toBe(400)
  })

  it("6. malformed limit (non-numeric) → 400", async () => {
    const res = await fetchApp("/api/tags?limit=abc")
    expect(res.status).toBe(400)
  })

  it("7. no match → 200 with empty tags array and total 0", async () => {
    seedAssetWithTags("a1", ["foo"])

    const res = await fetchApp("/api/tags?q=zzz")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    expect(body.tags).toEqual([])
    expect(body.total).toBe(0)
  })

  it("NULL-tagged asset rows are ignored (untagged assets don't surface)", async () => {
    seedAssetWithTags("a1", ["foo"])
    seedAssetWithTags("a2", undefined)

    const res = await fetchApp("/api/tags")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    expect(body.tags).toEqual([{ tag: "foo", count: 1 }])
    expect(body.total).toBe(1)
  })

  it("limit under cap is honored; total still reflects all distinct matches", async () => {
    seedAssetWithTags("a1", ["foo", "bar", "baz"])

    const res = await fetchApp("/api/tags?limit=2")
    expect(res.status).toBe(200)
    const body = (await res.json()) as TagsResponse
    expect(body.tags).toHaveLength(2)
    expect(body.total).toBe(3)
  })
})
