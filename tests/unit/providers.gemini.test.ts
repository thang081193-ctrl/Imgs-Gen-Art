// Gemini adapter — unit tests with mocked @google/genai SDK.
// Covers: ImageProvider contract, client cache, error map, image extract,
// safety filter, AbortSignal propagation, health-list walk (model found /
// not found). Live smoke tests live in tests/live/providers.gemini-live.test.ts
// and are gated by GEMINI_API_KEY.

import { beforeEach, describe, expect, it, vi } from "vitest"

// Must declare SDK mock BEFORE importing the adapter module (vi.mock is hoisted).
const mockGenerateContent = vi.fn()
const mockList = vi.fn()
const mockConstructor = vi.fn()

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent, list: mockList }
    constructor(opts: { apiKey: string }) {
      mockConstructor(opts)
    }
  },
}))

// Mock the key store so the adapter finds an "active slot" without touching
// disk. decrypt() is mocked to identity so the encrypted payload we set is
// the plaintext returned.
const FAKE_PLAINTEXT_KEY = "AIzaTESTFAKEKEY00000000000000000000000000"
vi.mock("@/server/keys/store", () => ({
  loadStoredKeys: () => ({
    version: 1,
    gemini: {
      activeSlotId: "slot-1",
      slots: [
        {
          id: "slot-1",
          label: "test",
          keyEncrypted: FAKE_PLAINTEXT_KEY,
          addedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    },
    vertex: { activeSlotId: null, slots: [] },
  }),
}))

vi.mock("@/server/keys/crypto", () => ({
  decrypt: (s: string) => s,
  encrypt: (s: string) => s,
}))

import { MODEL_IDS } from "@/core/model-registry/models"
import { PROVIDER_IDS } from "@/core/model-registry/providers"
import { runProviderContract } from "@/core/providers/contract"
import {
  NoActiveKeyError,
  ProviderError,
  SafetyFilterError,
} from "@/core/shared/errors"
import { geminiProvider, _resetClientCacheForTests } from "@/server/providers/gemini"
import {
  extractImageFromResponse,
  type GeminiResponseShape,
} from "@/server/providers/gemini-extract"
import {
  mapSdkErrorToHealthStatus,
  mapSdkErrorToThrown,
} from "@/server/providers/gemini-errors"

// Minimal valid PNG (8-byte magic + IHDR + IDAT + IEND) — 67 bytes. Enough
// to satisfy the contract test's "bytes > 8 + PNG magic match" assertion.
const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR len + tag
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1×1
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
])

const pngResponse = (): GeminiResponseShape => ({
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              data: PNG_FIXTURE.toString("base64"),
              mimeType: "image/png",
            },
          },
        ],
      },
    },
  ],
})

function makePager(items: Array<{ name: string }>): AsyncIterable<{ name: string }> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item
    },
  }
}

beforeEach(() => {
  _resetClientCacheForTests()
  mockGenerateContent.mockReset()
  mockList.mockReset()
  mockConstructor.mockReset()
  // Default: signal-aware generate happy path.
  mockGenerateContent.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
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
    return pngResponse()
  })
  mockList.mockResolvedValue(
    makePager([
      { name: "models/gemini-3-pro-image-preview" },
      { name: "models/gemini-3.1-flash-image-preview" },
      { name: "models/unrelated-model" },
    ]),
  )
})

runProviderContract("gemini", () => geminiProvider, {
  validModelId: MODEL_IDS.GEMINI_NB_2,
})

describe("gemini — capability + registry shape", () => {
  it("exposes id + displayName + both NB models", () => {
    expect(geminiProvider.id).toBe(PROVIDER_IDS.GEMINI)
    expect(geminiProvider.displayName).toBe("Google Gemini")
    const ids = geminiProvider.supportedModels.map((m) => m.id)
    expect(ids).toEqual(
      expect.arrayContaining([MODEL_IDS.GEMINI_NB_PRO, MODEL_IDS.GEMINI_NB_2]),
    )
    expect(ids).toHaveLength(2)
  })
})

describe("gemini — client caching", () => {
  it("reuses a single GoogleGenAI instance for repeated calls with the same key", async () => {
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_2)
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_2)
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_PRO)
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it("constructs a new instance when the context.apiKey differs", async () => {
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_2, { apiKey: "AIzaA_00000000000000000000000000000000" })
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_2, { apiKey: "AIzaB_00000000000000000000000000000000" })
    expect(mockConstructor).toHaveBeenCalledTimes(2)
  })
})

describe("gemini — health() flows", () => {
  it("returns 'ok' + latency when target model is in the listed pager", async () => {
    const status = await geminiProvider.health(MODEL_IDS.GEMINI_NB_2)
    expect(status.status).toBe("ok")
    expect(status.latencyMs).toBeGreaterThanOrEqual(0)
    expect(status.checkedAt).toEqual(new Date(status.checkedAt).toISOString())
  })

  it("returns 'down' with descriptive message when target model is missing", async () => {
    mockList.mockResolvedValue(makePager([{ name: "models/other-model" }]))
    const status = await geminiProvider.health(MODEL_IDS.GEMINI_NB_2)
    expect(status.status).toBe("down")
    expect(status.message).toContain(MODEL_IDS.GEMINI_NB_2)
  })

  it("propagates context.abortSignal into the SDK list call", async () => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    mockList.mockImplementation((args: { config?: { abortSignal?: AbortSignal } } | undefined) => {
      seenSignal = args?.config?.abortSignal
      return Promise.resolve(
        makePager([{ name: "models/gemini-3.1-flash-image-preview" }]),
      )
    })
    await geminiProvider.health(MODEL_IDS.GEMINI_NB_2, { abortSignal: controller.signal })
    expect(seenSignal).toBe(controller.signal)
  })

  it("returns 'auth_error' with zero latency when no key slot is active and no context.apiKey", async () => {
    // Re-isolate to swap the keys/store mock in isolation; leave the top-level
    // vi.mock("@google/genai", ...) untouched so subsequent tests keep the SDK
    // intercepted. vi.resetModules + vi.doMock on keys/store rebinds just the
    // store for the fresh import; keys/crypto also needs a doMock because
    // resetModules drops its factory binding from the top-level vi.mock.
    vi.resetModules()
    vi.doMock("@/server/keys/store", () => ({
      loadStoredKeys: () => ({
        version: 1,
        gemini: { activeSlotId: null, slots: [] },
        vertex: { activeSlotId: null, slots: [] },
      }),
    }))
    vi.doMock("@/server/keys/crypto", () => ({ decrypt: (s: string) => s, encrypt: (s: string) => s }))
    try {
      const freshMod = await import("@/server/providers/gemini")
      const status = await freshMod.geminiProvider.health(MODEL_IDS.GEMINI_NB_2)
      expect(status.status).toBe("auth_error")
      expect(status.latencyMs).toBe(0)
      expect(status.message).toMatch(/No active Gemini key/i)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.doUnmock("@/server/keys/crypto")
      vi.resetModules()
    }
  })
})

describe("gemini — generate() wiring", () => {
  it("passes params.abortSignal through to config.abortSignal", async () => {
    const controller = new AbortController()
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateContent.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return pngResponse()
    })
    await geminiProvider.generate({
      prompt: "probe",
      modelId: MODEL_IDS.GEMINI_NB_2,
      aspectRatio: "1:1",
      abortSignal: controller.signal,
    })
    expect(seenConfig?.["abortSignal"]).toBe(controller.signal)
  })

  it("forwards seed into config and echoes seedUsed on result", async () => {
    let seenConfig: Record<string, unknown> | undefined
    mockGenerateContent.mockImplementation(async ({ config }: { config?: Record<string, unknown> }) => {
      seenConfig = config
      return pngResponse()
    })
    const result = await geminiProvider.generate({
      prompt: "seeded",
      modelId: MODEL_IDS.GEMINI_NB_2,
      aspectRatio: "1:1",
      seed: 42,
    })
    expect(seenConfig?.["seed"]).toBe(42)
    expect(result.seedUsed).toBe(42)
  })

  it("wraps non-safety SDK errors as ProviderError", async () => {
    mockGenerateContent.mockRejectedValueOnce({
      status: 500,
      message: "Upstream exploded",
    })
    await expect(
      geminiProvider.generate({
        prompt: "boom",
        modelId: MODEL_IDS.GEMINI_NB_2,
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
    vi.doMock("@/server/keys/crypto", () => ({ decrypt: (s: string) => s, encrypt: (s: string) => s }))
    try {
      const freshMod = await import("@/server/providers/gemini")
      const freshErrors = await import("@/core/shared/errors")
      await expect(
        freshMod.geminiProvider.generate({
          prompt: "x",
          modelId: MODEL_IDS.GEMINI_NB_2,
          aspectRatio: "1:1",
        }),
      ).rejects.toBeInstanceOf(freshErrors.NoActiveKeyError)
    } finally {
      vi.doUnmock("@/server/keys/store")
      vi.doUnmock("@/server/keys/crypto")
      vi.resetModules()
    }
  })
})

describe("gemini-extract — pure function guards", () => {
  const ctx = { modelId: MODEL_IDS.GEMINI_NB_2 }

  it("returns Buffer + mimeType for a valid response", () => {
    const { bytes, mimeType } = extractImageFromResponse(pngResponse(), ctx)
    expect(bytes).toBeInstanceOf(Buffer)
    expect(bytes.length).toBe(PNG_FIXTURE.length)
    expect(mimeType).toBe("image/png")
  })

  it("throws SafetyFilterError on promptFeedback.blockReason", () => {
    expect(() =>
      extractImageFromResponse(
        { promptFeedback: { blockReason: "SAFETY", blockReasonMessage: "bad words" } },
        ctx,
      ),
    ).toThrow(SafetyFilterError)
  })

  it("throws ProviderError when candidates is empty", () => {
    expect(() => extractImageFromResponse({ candidates: [] }, ctx)).toThrow(ProviderError)
  })

  it("throws ProviderError when no part has inlineData", () => {
    expect(() =>
      extractImageFromResponse(
        { candidates: [{ content: { parts: [{ text: "no image" }] } }] },
        ctx,
      ),
    ).toThrow(ProviderError)
  })

  it("throws ProviderError on unsupported mime type", () => {
    expect(() =>
      extractImageFromResponse(
        {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: "AAAA", mimeType: "image/webp" } }],
              },
            },
          ],
        },
        ctx,
      ),
    ).toThrow(ProviderError)
  })
})

describe("gemini-errors — SDK error → HealthStatus map", () => {
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

  it("message-based quota fallback when status is absent", () => {
    const h = mapSdkErrorToHealthStatus({ message: "Your quota limit was exceeded" }, performance.now())
    expect(h.status).toBe("quota_exceeded")
  })

  it("checkedAt is a valid ISO string", () => {
    const h = mapSdkErrorToHealthStatus({ status: 500 }, performance.now())
    expect(h.checkedAt).toEqual(new Date(h.checkedAt).toISOString())
  })
})

describe("gemini-errors — mapSdkErrorToThrown", () => {
  it("re-throws AbortError unchanged (DOMException path)", () => {
    const abortErr = new DOMException("aborted", "AbortError")
    expect(() => mapSdkErrorToThrown(abortErr, { modelId: "x" })).toThrow(abortErr)
  })

  it("re-throws ProviderError unchanged", () => {
    const pErr = new ProviderError("boom", { providerId: "gemini", modelId: "x" })
    expect(() => mapSdkErrorToThrown(pErr, { modelId: "x" })).toThrow(pErr)
  })

  it("re-throws SafetyFilterError unchanged", () => {
    const sErr = new SafetyFilterError("blocked", { providerId: "gemini", reason: "SAFETY" })
    expect(() => mapSdkErrorToThrown(sErr, { modelId: "x" })).toThrow(sErr)
  })

  it("wraps generic SDK errors as ProviderError with sdkCode", () => {
    try {
      mapSdkErrorToThrown({ status: 502, message: "bad gateway" }, { modelId: "foo" })
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError)
      const p = err as ProviderError
      expect(p.details).toMatchObject({
        providerId: "gemini",
        modelId: "foo",
        sdkCode: "502",
      })
    }
  })
})
