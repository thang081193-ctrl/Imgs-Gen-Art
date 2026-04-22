// BOOTSTRAP-PHASE3 Step 6 — profile-assets-repo round-trip unit tests.
//
// Mirrors asset-store.test.ts patterns: in-memory DB via openAssetDatabase,
// runs migrations from `scripts/migrations/`, exercises each repo method
// + runtime guards.

import { describe, expect, it, beforeEach, afterEach } from "vitest"

import { openAssetDatabase, type OpenedDatabase } from "@/server/asset-store/db"
import {
  createProfileAssetsRepo,
  type ProfileAssetsRepo,
} from "@/server/asset-store/profile-assets-repo"

let opened: OpenedDatabase
let repo: ProfileAssetsRepo

beforeEach(() => {
  opened = openAssetDatabase({ path: ":memory:" })
  repo = createProfileAssetsRepo(opened.db)
})

afterEach(() => {
  opened.db.close()
})

describe("profile-assets-repo — insert + findById", () => {
  it("round-trips a logo row", () => {
    const ins = repo.insert({
      id: "pa_logo_1",
      profileId: "chartlens",
      kind: "logo",
      filePath: "data/profile-assets/chartlens/pa_logo_1.png",
      mimeType: "image/png",
      fileSizeBytes: 1234,
    })
    expect(ins.id).toBe("pa_logo_1")
    expect(ins.kind).toBe("logo")
    expect(ins.fileSizeBytes).toBe(1234)
    expect(ins.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const got = repo.findById("pa_logo_1")
    expect(got).toEqual(ins)
  })

  it("stamps uploadedAt from caller when provided", () => {
    const fixed = "2026-04-22T10:00:00.000Z"
    const ins = repo.insert({
      id: "pa_badge_1",
      profileId: "chartlens",
      kind: "badge",
      filePath: "data/profile-assets/chartlens/pa_badge_1.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: null,
      uploadedAt: fixed,
    })
    expect(ins.uploadedAt).toBe(fixed)
    expect(ins.fileSizeBytes).toBeNull()
  })

  it("findById returns null for unknown id", () => {
    expect(repo.findById("nope")).toBeNull()
  })

  it("rejects invalid kind at insert time", () => {
    expect(() =>
      repo.insert({
        id: "pa_bad",
        profileId: "chartlens",
        // @ts-expect-error invalid kind
        kind: "icon",
        filePath: "x",
        mimeType: "image/png",
      }),
    ).toThrow(/invalid kind/)
  })
})

describe("profile-assets-repo — listByProfile", () => {
  it("returns only rows for the given profile, ordered by uploadedAt", () => {
    repo.insert({
      id: "pa_ss_1",
      profileId: "chartlens",
      kind: "screenshot",
      filePath: "x",
      mimeType: "image/png",
      uploadedAt: "2026-04-22T10:00:00.000Z",
    })
    repo.insert({
      id: "pa_ss_2",
      profileId: "chartlens",
      kind: "screenshot",
      filePath: "y",
      mimeType: "image/png",
      uploadedAt: "2026-04-22T11:00:00.000Z",
    })
    repo.insert({
      id: "pa_other",
      profileId: "other-profile",
      kind: "logo",
      filePath: "z",
      mimeType: "image/png",
    })

    const rows = repo.listByProfile("chartlens")
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.id)).toEqual(["pa_ss_1", "pa_ss_2"])
  })

  it("returns empty array when profile has no assets", () => {
    expect(repo.listByProfile("ghost")).toEqual([])
  })
})

describe("profile-assets-repo — delete", () => {
  it("returns true on successful delete; row disappears", () => {
    repo.insert({
      id: "pa_del",
      profileId: "chartlens",
      kind: "logo",
      filePath: "x",
      mimeType: "image/png",
    })
    expect(repo.delete("pa_del")).toBe(true)
    expect(repo.findById("pa_del")).toBeNull()
  })

  it("returns false on unknown id (no-op)", () => {
    expect(repo.delete("nope")).toBe(false)
  })
})
