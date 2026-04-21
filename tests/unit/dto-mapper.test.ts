// Unit tests for DTO mappers. Rule 11 — no secrets, no paths in DTOs.
// Step 3 scope: keys. Step 5 scope: profile mappers (toProfileDto /
// toProfileSummaryDto resolve asset IDs into opaque `/api/...` URLs).

import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { toKeySlotDto, toVertexSlotDto } from "@/server/keys/dto-mapper"
import type { KeySlot, VertexSlot } from "@/server/keys/types"
import { toProfileDto, toProfileSummaryDto } from "@/server/profile-repo/dto-mapper"
import type { AppProfile } from "@/core/schemas/app-profile"

describe("keys DTO mapper — Rule 11 (no secrets, no paths)", () => {
  it("toKeySlotDto strips keyEncrypted entirely", () => {
    const slot: KeySlot = {
      id: "ks_abc123",
      label: "dev key",
      keyEncrypted: "BASE64_SECRET_DO_NOT_LEAK==",
      addedAt: "2026-04-21T00:00:00.000Z",
      lastUsedAt: "2026-04-21T01:00:00.000Z",
    }
    const dto = toKeySlotDto(slot)
    expect((dto as Record<string, unknown>).keyEncrypted).toBeUndefined()
    const json = JSON.stringify(dto)
    expect(json).not.toContain("keyEncrypted")
    expect(json).not.toContain("BASE64_SECRET_DO_NOT_LEAK")
    expect(dto.id).toBe("ks_abc123")
    expect(dto.label).toBe("dev key")
    expect(dto.lastUsedAt).toBe("2026-04-21T01:00:00.000Z")
  })

  it("toKeySlotDto omits lastUsedAt when domain has none", () => {
    const slot: KeySlot = {
      id: "ks_new",
      label: "fresh",
      keyEncrypted: "X",
      addedAt: "2026-04-21T00:00:00.000Z",
    }
    const dto = toKeySlotDto(slot)
    expect(dto.lastUsedAt).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(dto, "lastUsedAt")).toBe(false)
  })

  it("toVertexSlotDto strips serviceAccountPath + returns hasCredentials=true when file exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "keys-dto-"))
    const saPath = join(tmp, "sa.json")
    writeFileSync(saPath, "{}")
    try {
      const slot: VertexSlot = {
        id: "vs_111",
        label: "prod",
        projectId: "my-project",
        location: "us-central1",
        serviceAccountPath: saPath,
        addedAt: "2026-04-21T00:00:00.000Z",
      }
      const dto = toVertexSlotDto(slot)
      expect(dto.hasCredentials).toBe(true)
      expect((dto as Record<string, unknown>).serviceAccountPath).toBeUndefined()
      expect(JSON.stringify(dto)).not.toContain("serviceAccountPath")
      expect(dto.projectId).toBe("my-project")
      expect(dto.location).toBe("us-central1")
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("toVertexSlotDto returns hasCredentials=false when file missing", () => {
    const slot: VertexSlot = {
      id: "vs_222",
      label: "broken",
      projectId: "p",
      location: "us-central1",
      serviceAccountPath: join(tmpdir(), "does-not-exist-abc123xyz.json"),
      addedAt: "2026-04-21T00:00:00.000Z",
    }
    const dto = toVertexSlotDto(slot)
    expect(dto.hasCredentials).toBe(false)
  })
})

const sampleProfile: AppProfile = {
  version: 1,
  id: "sample",
  name: "Sample",
  tagline: "Testing profile DTO mapping",
  category: "utility",
  assets: {
    appLogoAssetId: "pa_logo_1",
    storeBadgeAssetId: null,
    screenshotAssetIds: ["pa_ss_1", "pa_ss_2"],
  },
  visual: {
    primaryColor: "#112233",
    secondaryColor: "#445566",
    accentColor: "#778899",
    tone: "minimal",
    doList: ["simple"],
    dontList: ["busy"],
  },
  positioning: {
    usp: "usp",
    targetPersona: "persona",
    marketTier: "global",
  },
  context: {
    features: ["f1"],
    keyScenarios: ["s1"],
    forbiddenContent: ["x"],
  },
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
}

describe("profile DTO mapper — Rule 11 (asset IDs → opaque URLs)", () => {
  it("toProfileDto resolves asset IDs to /api/profile-assets/{id}/file", () => {
    const dto = toProfileDto(sampleProfile)
    expect(dto.assets.appLogoUrl).toBe("/api/profile-assets/pa_logo_1/file")
    expect(dto.assets.storeBadgeUrl).toBeNull()
    expect(dto.assets.screenshotUrls).toEqual([
      "/api/profile-assets/pa_ss_1/file",
      "/api/profile-assets/pa_ss_2/file",
    ])
  })

  it("toProfileDto never surfaces raw asset IDs or filesystem paths", () => {
    const dto = toProfileDto(sampleProfile)
    const json = JSON.stringify(dto)
    expect(json).not.toContain("appLogoAssetId")
    expect(json).not.toContain("storeBadgeAssetId")
    expect(json).not.toContain("screenshotAssetIds")
    expect(json).not.toContain("./data/")
  })

  it("toProfileDto preserves visual + positioning + context + timestamps", () => {
    const dto = toProfileDto(sampleProfile)
    expect(dto.visual).toEqual(sampleProfile.visual)
    expect(dto.positioning).toEqual(sampleProfile.positioning)
    expect(dto.context).toEqual(sampleProfile.context)
    expect(dto.version).toBe(1)
    expect(dto.createdAt).toBe(sampleProfile.createdAt)
    expect(dto.updatedAt).toBe(sampleProfile.updatedAt)
  })

  it("toProfileSummaryDto exposes only id/name/tagline/category/version/logoUrl/updatedAt", () => {
    const summary = toProfileSummaryDto(sampleProfile)
    expect(summary).toEqual({
      id: "sample",
      name: "Sample",
      tagline: "Testing profile DTO mapping",
      category: "utility",
      version: 1,
      logoUrl: "/api/profile-assets/pa_logo_1/file",
      updatedAt: "2026-04-20T00:00:00.000Z",
    })
  })

  it("toProfileSummaryDto returns logoUrl=null when no logo asset", () => {
    const noLogo: AppProfile = {
      ...sampleProfile,
      assets: { ...sampleProfile.assets, appLogoAssetId: null },
    }
    const summary = toProfileSummaryDto(noLogo)
    expect(summary.logoUrl).toBeNull()
  })
})
