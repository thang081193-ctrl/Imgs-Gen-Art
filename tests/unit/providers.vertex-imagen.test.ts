// Vertex Imagen adapter — unit tests with mocked @google/genai SDK.
// Covers: ImageProvider contract, client cache, error map, image extract,
// RAI safety filter, AbortSignal propagation, SA file resolution + Zod
// validation, auth bypass via context.serviceAccount. Live smoke tests live
// in tests/live/providers.vertex-live.test.ts and are gated by
// VERTEX_PROJECT_ID + VERTEX_SA_PATH env vars.

import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// SDK mock MUST come before the adapter import (vi.mock is hoisted).
const mockGenerateImages = vi.fn()
const mockList = vi.fn()
const mockConstructor = vi.fn()

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateImages: mockGenerateImages, list: mockList }
    constructor(opts: unknown) {
      mockConstructor(opts)
    }
  },
}))

// Per-test SA fixture written to a tmp dir so fs.readFileSync + JSON.parse +
// Zod validation paths are exercised end-to-end (not mocked). A single tmp
// dir covers all tests; individual tests that need a "missing" file unlink
// before call.
const tmpDir = mkdtempSync(join(tmpdir(), "vertex-adapter-test-"))
const SA_FILE = join(tmpDir, "vertex-slot-1.json")
const SA_JSON = {
  type: "service_account",
  project_id: "test-project",
  private_key_id: "kid-1",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  client_email: "svc@test-project.iam.gserviceaccount.com",
  client_id: "123",
  token_uri: "https://oauth2.googleapis.com/token",
}

beforeAll(() => {
  writeFileSync(SA_FILE, JSON.stringify(SA_JSON), "utf8")
})
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

vi.mock("@/server/keys/store", () => ({
  loadStoredKeys: () => ({
    version: 1,
    gemini: { activeSlotId: null, slots: [] },
    vertex: {
      activeSlotId: "slot-1",
      slots: [
        {
          id: "slot-1",
          label: "test",
          projectId: "test-project",
          location: "us-central1",
          serviceAccountPath: SA_FILE,
          addedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    },
  }),
}))

import { MODEL_IDS } from "@/core/model-registry/models"
import { PROVIDER_IDS } from "@/core/model-registry/providers"
import { runProviderContract } from "@/core/providers/contract"
import type { VertexServiceAccount } from "@/core/providers/types"
import {
  ProviderError,
  SafetyFilterError,
  ServiceAccountFileMissingError,
} from "@/core/shared/errors"
import {
  resolveServiceAccount,
  DEFAULT_LOCATION,
} from "@/server/providers/vertex-auth"
import {
  mapSdkErrorToHealthStatus,
  mapSdkErrorToThrown,
} from "@/server/providers/vertex-errors"
import {
  extractImageFromResponse,
  type VertexImagenResponseShape,
} from "@/server/providers/vertex-extract"
import {
  vertexImagenProvider,
  _resetClientCacheForTests,
} from "@/server/providers/vertex-imagen"

// Minimal valid PNG (8-byte magic + IHDR + IDAT + IEND) — 67 bytes.
const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

const imagenResponse = (): VertexImagenResponseShape => ({
  generatedImages: [
    {
      image: {
        imageBytes: PNG_FIXTURE.toString("base64"),
        mimeType: "image/png",
      },
    },
  ],
})

function makePager<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item
    },
  }
}

beforeEach(() => {
  _resetClientCacheForTests()
  mockGenerateImages.mockReset()
  mockList.mockReset()
  mockConstructor.mockReset()
  // Default: signal-aware generate happy path — same abort semantics as the
  // contract's pre-abort + mid-flight cases.
  mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
    const signal = config?.["abortSignal"] as AbortSignal | undefined
    if (signal?.aborted) throw new DOMException("aborted", "AbortError")
    if (signal) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 15)
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t)
            reject(new DOMException("aborted", "AbortError"))
          },
          { once: true },
        )
      })
    }
    return imagenResponse()
  })
  mockList.mockResolvedValue(makePager<{ name: string }>([{ name: "models/whatever" }]))
})

runProviderContract("vertex", () => vertexImagenProvider, {
  validModelId: MODEL_IDS.IMAGEN_4,
})

describe("vertex — capability + registry shape", () => {
  it("exposes id + displayName + Imagen 4 model", () => {
    expect(vertexImagenProvider.id).toBe(PROVIDER_IDS.VERTEX)
    expect(vertexImagenProvider.displayName).toBe("Google Vertex AI")
    const ids = vertexImagenProvider.supportedModels.map((m) => m.id)
    expect(ids).toEqual([MODEL_IDS.IMAGEN_4])
  })
})

describe("vertex — client caching", () => {
  it("reuses a single GoogleGenAI instance for repeated calls with the same SA fingerprint", async () => {
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it("constructs a new instance when context.serviceAccount differs (different client_email)", async () => {
    const saA: VertexServiceAccount = {
      type: "service_account",
      project_id: "p1",
      client_email: "a@p1.iam.gserviceaccount.com",
      private_key: "k",
    }
    const saB: VertexServiceAccount = { ...saA, client_email: "b@p1.iam.gserviceaccount.com" }
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4, { serviceAccount: saA })
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4, { serviceAccount: saB })
    expect(mockConstructor).toHaveBeenCalledTimes(2)
  })

  it("constructor receives vertexai:true + project + location + googleAuthOptions.credentials", async () => {
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
    expect(mockConstructor).toHaveBeenCalledTimes(1)
    const opts = mockConstructor.mock.calls[0]![0] as Record<string, unknown>
    expect(opts["vertexai"]).toBe(true)
    expect(opts["project"]).toBe("test-project")
    expect(opts["location"]).toBe("us-central1")
    const auth = opts["googleAuthOptions"] as { credentials: { client_email: string } }
    expect(auth.credentials.client_email).toBe(SA_JSON.client_email)
  })
})

describe("vertex — health() flows", () => {
  it("returns 'ok' + latency when the auth probe completes", async () => {
    const status = await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
    expect(status.status).toBe("ok")
    expect(status.latencyMs).toBeGreaterThanOrEqual(0)
    expect(status.checkedAt).toEqual(new Date(status.checkedAt).toISOString())
  })

  it("returns 'down' when the modelId is unknown to the adapter", async () => {
    const status = await vertexImagenProvider.health("imagen-99-not-real")
    expect(status.status).toBe("down")
    expect(status.message).toContain("imagen-99-not-real")
  })

  it("propagates context.abortSignal into models.list()", async () => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    mockList.mockImplementation((args: { config?: { abortSignal?: AbortSignal } } | undefined) => {
      seenSignal = args?.config?.abortSignal
      return Promise.resolve(makePager<{ name: string }>([{ name: "models/x" }]))
    })
    await vertexImagenProvider.health(MODEL_IDS.IMAGEN_4, { abortSignal: controller.signal })
    expect(seenSignal).toBe(controller.signal)
  })

  it("returns 'auth_error' with zero latency when no slot is active and no context.serviceAccount", async () => {
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: { activeSlotId: null, slots: [] },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-imagen")
      const status = await fresh.vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
      expect(status.status).toBe("auth_error")
      expect(status.latencyMs).toBe(0)
      expect(status.message).toMatch(/No active Vertex key/i)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
    }
  })

  it("returns 'auth_error' when the SA file is missing on disk", async () => {
    const missingTmp = mkdtempSync(join(tmpdir(), "vertex-missing-"))
    const missingPath = join(missingTmp, "ghost.json")
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: {
          activeSlotId: "slot-missing",
          slots: [
            {
              id: "slot-missing",
              label: "ghost",
              projectId: "p",
              location: "us-central1",
              serviceAccountPath: missingPath,
              addedAt: "2026-04-23T00:00:00.000Z",
            },
          ],
        },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-imagen")
      const status = await fresh.vertexImagenProvider.health(MODEL_IDS.IMAGEN_4)
      expect(status.status).toBe("auth_error")
      expect(status.message).toMatch(/missing/i)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
      rmSync(missingTmp, { recursive: true, force: true })
    }
  })
})

describe("vertex — generate() wiring", () => {
  it("passes params.abortSignal through to config.abortSignal", async () => {
    const controller = new AbortController()
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "probe",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
      abortSignal: controller.signal,
    })
    expect(seenConfig?.["abortSignal"]).toBe(controller.signal)
  })

  it("forwards seed + echoes seedUsed", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    const result = await vertexImagenProvider.generate({
      prompt: "seeded",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
      seed: 777,
    })
    expect(seenConfig?.["seed"]).toBe(777)
    expect(result.seedUsed).toBe(777)
  })

  it("forwards providerSpecificParams.addWatermark:false", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "replay",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
      providerSpecificParams: { addWatermark: false },
    })
    expect(seenConfig?.["addWatermark"]).toBe(false)
  })

  it("defaults addWatermark:true when providerSpecificParams is absent", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "default",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
    })
    expect(seenConfig?.["addWatermark"]).toBe(true)
  })

  it("passes params.language through into config.language (Q3 pass-through)", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "bonjour",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
      language: "fr",
    })
    expect(seenConfig?.["language"]).toBe("fr")
  })

  it("omits language from config entirely when params.language is undefined", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "no-lang",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "1:1",
    })
    expect(seenConfig).not.toHaveProperty("language")
  })

  it("forwards aspectRatio into config", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateImages.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return imagenResponse()
    })
    await vertexImagenProvider.generate({
      prompt: "ar",
      modelId: MODEL_IDS.IMAGEN_4,
      aspectRatio: "9:16",
    })
    expect(seenConfig?.["aspectRatio"]).toBe("9:16")
    expect(seenConfig?.["numberOfImages"]).toBe(1)
  })

  it("wraps non-safety SDK errors as ProviderError", async () => {
    mockGenerateImages.mockRejectedValueOnce({ status: 500, message: "upstream boom" })
    await expect(
      vertexImagenProvider.generate({
        prompt: "x",
        modelId: MODEL_IDS.IMAGEN_4,
        aspectRatio: "1:1",
      }),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it("throws NoActiveKeyError when no slot is active (generate, not health)", async () => {
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: { activeSlotId: null, slots: [] },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-imagen")
      const freshErrors = await import("@/core/shared/errors")
      await expect(
        fresh.vertexImagenProvider.generate({
          prompt: "x",
          modelId: MODEL_IDS.IMAGEN_4,
          aspectRatio: "1:1",
        }),
      ).rejects.toBeInstanceOf(freshErrors.NoActiveKeyError)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
    }
  })
})

describe("vertex-auth — resolveServiceAccount()", () => {
  it("context.serviceAccount wins when provided", () => {
    const sa: VertexServiceAccount = {
      type: "service_account",
      project_id: "ctx-project",
      client_email: "ctx@x.iam.gserviceaccount.com",
      private_key: "k",
    }
    const resolved = resolveServiceAccount({ serviceAccount: sa })
    expect(resolved.projectId).toBe("ctx-project")
    expect(resolved.location).toBe(DEFAULT_LOCATION)
    expect(resolved.credentials).toBe(sa)
  })

  it("throws ProviderError when context.serviceAccount has no project_id", () => {
    const bad = { type: "service_account", client_email: "x@y.z", private_key: "k" } as unknown as VertexServiceAccount
    expect(() => resolveServiceAccount({ serviceAccount: bad })).toThrow(ProviderError)
  })

  it("falls back to active slot + reads SA file + returns slot.projectId", () => {
    const resolved = resolveServiceAccount()
    expect(resolved.projectId).toBe("test-project")
    expect(resolved.location).toBe("us-central1")
    expect(resolved.credentials.client_email).toBe(SA_JSON.client_email)
  })

  it("throws ServiceAccountFileMissingError when the SA file was deleted", async () => {
    const missingTmp = mkdtempSync(join(tmpdir(), "vertex-missing2-"))
    const missingPath = join(missingTmp, "x.json")
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: {
          activeSlotId: "slot-x",
          slots: [
            {
              id: "slot-x",
              label: "x",
              projectId: "p",
              location: "us-central1",
              serviceAccountPath: missingPath,
              addedAt: "2026-04-23T00:00:00.000Z",
            },
          ],
        },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-auth")
      const freshErrors = await import("@/core/shared/errors")
      expect(() => fresh.resolveServiceAccount()).toThrow(freshErrors.ServiceAccountFileMissingError)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
      rmSync(missingTmp, { recursive: true, force: true })
    }
  })

  it("throws ProviderError on malformed SA JSON", async () => {
    const badTmp = mkdtempSync(join(tmpdir(), "vertex-bad-json-"))
    const badPath = join(badTmp, "bad.json")
    writeFileSync(badPath, "{not json", "utf8")
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: {
          activeSlotId: "slot-b",
          slots: [
            {
              id: "slot-b",
              label: "bad",
              projectId: "p",
              location: "us-central1",
              serviceAccountPath: badPath,
              addedAt: "2026-04-23T00:00:00.000Z",
            },
          ],
        },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-auth")
      const freshErrors = await import("@/core/shared/errors")
      expect(() => fresh.resolveServiceAccount()).toThrow(freshErrors.ProviderError)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
      unlinkSync(badPath)
      rmSync(badTmp, { recursive: true, force: true })
    }
  })

  it("throws ProviderError when SA JSON fails Zod validation (missing private_key)", async () => {
    const schemaTmp = mkdtempSync(join(tmpdir(), "vertex-bad-schema-"))
    const schemaPath = join(schemaTmp, "bad.json")
    writeFileSync(schemaPath, JSON.stringify({ type: "service_account", project_id: "p" }), "utf8")
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: {
          activeSlotId: "slot-s",
          slots: [
            {
              id: "slot-s",
              label: "schema",
              projectId: "p",
              location: "us-central1",
              serviceAccountPath: schemaPath,
              addedAt: "2026-04-23T00:00:00.000Z",
            },
          ],
        },
      }),
    }))
    try {
      const fresh = await import("@/server/providers/vertex-auth")
      const freshErrors = await import("@/core/shared/errors")
      expect(() => fresh.resolveServiceAccount()).toThrow(freshErrors.ProviderError)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.resetModules()
      unlinkSync(schemaPath)
      rmSync(schemaTmp, { recursive: true, force: true })
    }
  })
})

describe("vertex-extract — pure function guards", () => {
  const ctx = { modelId: MODEL_IDS.IMAGEN_4 }

  it("returns Buffer + mimeType for a valid response", () => {
    const { bytes, mimeType, width, height } = extractImageFromResponse(imagenResponse(), ctx)
    expect(bytes).toBeInstanceOf(Buffer)
    expect(bytes.length).toBe(PNG_FIXTURE.length)
    expect(mimeType).toBe("image/png")
    expect(width).toBe(1)
    expect(height).toBe(1)
  })

  it("throws SafetyFilterError on raiFilteredReason", () => {
    expect(() =>
      extractImageFromResponse(
        { generatedImages: [{ raiFilteredReason: "BLOCKED_SAFETY" }] },
        ctx,
      ),
    ).toThrow(SafetyFilterError)
  })

  it("throws ProviderError when generatedImages is empty", () => {
    expect(() => extractImageFromResponse({ generatedImages: [] }, ctx)).toThrow(ProviderError)
  })

  it("throws ProviderError when image.imageBytes is missing", () => {
    expect(() =>
      extractImageFromResponse(
        { generatedImages: [{ image: { mimeType: "image/png" } }] },
        ctx,
      ),
    ).toThrow(ProviderError)
  })

  it("throws ProviderError on unsupported mime type", () => {
    expect(() =>
      extractImageFromResponse(
        {
          generatedImages: [
            { image: { imageBytes: "AAAA", mimeType: "image/webp" } },
          ],
        },
        ctx,
      ),
    ).toThrow(ProviderError)
  })
})

describe("vertex-errors — SDK error → HealthStatus map", () => {
  it("401 → auth_error", () => {
    const h = mapSdkErrorToHealthStatus({ status: 401, message: "Unauthenticated" }, performance.now())
    expect(h.status).toBe("auth_error")
  })

  it("403 → auth_error", () => {
    const h = mapSdkErrorToHealthStatus({ status: 403, message: "Forbidden" }, performance.now())
    expect(h.status).toBe("auth_error")
  })

  it("429 → rate_limited", () => {
    const h = mapSdkErrorToHealthStatus({ status: 429, message: "rate" }, performance.now())
    expect(h.status).toBe("rate_limited")
  })

  it("402 → quota_exceeded", () => {
    const h = mapSdkErrorToHealthStatus({ status: 402, message: "Payment required" }, performance.now())
    expect(h.status).toBe("quota_exceeded")
  })

  it("5xx → down", () => {
    const h = mapSdkErrorToHealthStatus({ status: 503, message: "unavailable" }, performance.now())
    expect(h.status).toBe("down")
  })

  it("google.rpc.Status UNAUTHENTICATED → auth_error", () => {
    const h = mapSdkErrorToHealthStatus(
      { error: { status: "UNAUTHENTICATED", message: "missing creds" } },
      performance.now(),
    )
    expect(h.status).toBe("auth_error")
  })

  it("google.rpc.Status RESOURCE_EXHAUSTED → quota_exceeded", () => {
    const h = mapSdkErrorToHealthStatus(
      { error: { status: "RESOURCE_EXHAUSTED", message: "over" } },
      performance.now(),
    )
    expect(h.status).toBe("quota_exceeded")
  })

  it("ServiceAccountFileMissingError short-circuits to auth_error", () => {
    const err = new ServiceAccountFileMissingError({
      slotId: "s1",
      expectedPath: "/tmp/ghost.json",
    })
    const h = mapSdkErrorToHealthStatus(err, performance.now())
    expect(h.status).toBe("auth_error")
    expect(h.message).toMatch(/missing/i)
  })

  it("checkedAt is a valid ISO string", () => {
    const h = mapSdkErrorToHealthStatus({ status: 500 }, performance.now())
    expect(h.checkedAt).toEqual(new Date(h.checkedAt).toISOString())
  })
})

describe("vertex-errors — mapSdkErrorToThrown", () => {
  it("re-throws AbortError unchanged", () => {
    const err = new DOMException("aborted", "AbortError")
    expect(() => mapSdkErrorToThrown(err, { modelId: "x" })).toThrow(err)
  })

  it("re-throws ProviderError unchanged", () => {
    const err = new ProviderError("boom", { providerId: "vertex", modelId: "x" })
    expect(() => mapSdkErrorToThrown(err, { modelId: "x" })).toThrow(err)
  })

  it("re-throws SafetyFilterError unchanged", () => {
    const err = new SafetyFilterError("blocked", { providerId: "vertex", reason: "RAI" })
    expect(() => mapSdkErrorToThrown(err, { modelId: "x" })).toThrow(err)
  })

  it("re-throws ServiceAccountFileMissingError unchanged", () => {
    const err = new ServiceAccountFileMissingError({ slotId: "s", expectedPath: "/tmp/x" })
    expect(() => mapSdkErrorToThrown(err, { modelId: "x" })).toThrow(err)
  })

  it("wraps generic SDK errors as ProviderError with sdkCode", () => {
    try {
      mapSdkErrorToThrown({ status: 502, message: "bad gateway" }, { modelId: "foo" })
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError)
      const p = err as ProviderError
      expect(p.details).toMatchObject({
        providerId: "vertex",
        modelId: "foo",
        sdkCode: "502",
      })
    }
  })

  it("wraps google.rpc.Status errors as ProviderError with the string code", () => {
    try {
      mapSdkErrorToThrown(
        { error: { status: "PERMISSION_DENIED", message: "nope" } },
        { modelId: "foo" },
      )
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError)
      const p = err as ProviderError
      expect(p.details).toMatchObject({
        providerId: "vertex",
        modelId: "foo",
        sdkCode: "PERMISSION_DENIED",
      })
    }
  })
})
