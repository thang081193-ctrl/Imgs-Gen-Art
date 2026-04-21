// Unit tests for DTO mappers. Rule 11 — no secrets, no paths in DTOs.
// Step 3 scope: keys. Later steps extend with profile/asset mappers.

import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { toKeySlotDto, toVertexSlotDto } from "@/server/keys/dto-mapper"
import type { KeySlot, VertexSlot } from "@/server/keys/types"

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
