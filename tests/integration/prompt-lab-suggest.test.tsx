// @vitest-environment jsdom
//
// S#40 Phase B2 — PromptLab integration smoke for the suggest flow:
// click PromptAssistPanel "Use this prompt" → editor textarea picks up
// the suggested text via the prefillRequest nonce plumbing.
//
// Mocks the API hooks (useAsset / useProviders / useReplay / etc.) so
// the page renders in deterministic state without SSE/network. The real
// PromptEditor + PromptAssistPanel are mounted to prove the wiring.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { AssetDto } from "@/core/dto/asset-dto"

const ASSET: AssetDto = {
  id: "ast_test",
  modelId: "mock-image-1",
  providerId: "mock",
  promptRaw: "original prompt",
  promptResolved: "original prompt",
  status: "ok",
  fileUrl: "/api/assets/ast_test/file",
  thumbUrl: "/api/assets/ast_test/thumb",
  createdAt: "2026-04-25T00:00:00.000Z",
  width: 1024,
  height: 1024,
  bytes: 1024,
  batchId: null,
  workflowId: null,
  profileId: null,
  tags: [],
  styleId: null,
  replayClass: "deterministic",
  editable: { canEdit: true, reason: null },
} as unknown as AssetDto

vi.mock("@/client/api/hooks", () => ({
  useAsset: () => ({ data: ASSET, error: null, loading: false }),
  useProviders: () => ({
    data: {
      providers: [],
      models: [
        {
          id: "mock-image-1",
          providerId: "mock",
          displayName: "Mock",
          capability: { supportsNegativePrompt: false },
        },
      ],
    },
    error: null,
    loading: false,
  }),
}))

vi.mock("@/client/utils/use-replay-class", () => ({
  useReplayClass: () => ({ data: null, error: null, loading: false }),
}))

vi.mock("@/client/utils/use-prompt-history", () => ({
  usePromptHistory: () => ({
    data: [],
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}))

vi.mock("@/client/utils/use-replay", () => ({
  useReplay: () => ({
    state: "idle",
    batchId: null,
    result: null,
    error: null,
    elapsedMs: 0,
    start: vi.fn(),
    cancel: vi.fn(async () => {}),
    reset: vi.fn(),
  }),
}))

import { PromptLab } from "@/client/pages/PromptLab"
import type { Navigator } from "@/client/navigator"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeNavigator(): Navigator {
  return {
    page: "prompt-lab",
    params: { assetId: "ast_test" },
    go: vi.fn(),
    back: vi.fn(),
  } as unknown as Navigator
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PromptLab × PromptAssistPanel suggest flow", () => {
  it("renders PromptAssistPanel on the right rail", () => {
    render(<PromptLab navigator={makeNavigator()} showToast={() => {}} />)
    expect(screen.getByTestId("prompt-assist-panel")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-assist-tab-reverse")).toBeInTheDocument()
  })

  it("'Use this prompt' from idea form populates the editor textarea", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ prompt: "expanded campaign prompt" }),
      ),
    )

    render(<PromptLab navigator={makeNavigator()} showToast={() => {}} />)

    // Switch to Idea tab
    fireEvent.click(screen.getByTestId("prompt-assist-tab-idea"))

    // Type idea + submit
    fireEvent.change(screen.getByTestId("idea-textarea"), {
      target: { value: "promote winter sale" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Expand to prompt/i }))

    // Wait for result + click Use this prompt
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Use this prompt/i }),
      ).toBeInTheDocument()
    })

    // Editor textarea should currently hold the asset's original prompt.
    const editorTextarea = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLTextAreaElement).value === "original prompt",
    ) as HTMLTextAreaElement | undefined
    expect(editorTextarea).toBeDefined()
    expect(editorTextarea!.value).toBe("original prompt")

    fireEvent.click(screen.getByRole("button", { name: /Use this prompt/i }))

    await waitFor(() => {
      expect(editorTextarea!.value).toBe("expanded campaign prompt")
    })
  })

  it("repeated 'Use this prompt' with same text still applies (nonce bump)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ prompt: "the same prompt" })),
    )

    render(<PromptLab navigator={makeNavigator()} showToast={() => {}} />)
    fireEvent.click(screen.getByTestId("prompt-assist-tab-idea"))
    fireEvent.change(screen.getByTestId("idea-textarea"), {
      target: { value: "abc" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Expand to prompt/i }))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Use this prompt/i }),
      ).toBeInTheDocument()
    })

    const editorTextarea = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLTextAreaElement).value === "original prompt",
    ) as HTMLTextAreaElement
    fireEvent.click(screen.getByRole("button", { name: /Use this prompt/i }))
    await waitFor(() => {
      expect(editorTextarea.value).toBe("the same prompt")
    })

    // Manually edit, then click again — nonce bumps so the same suggested
    // text still re-applies.
    fireEvent.change(editorTextarea, { target: { value: "user override" } })
    expect(editorTextarea.value).toBe("user override")
    fireEvent.click(screen.getByRole("button", { name: /Use this prompt/i }))
    await waitFor(() => {
      expect(editorTextarea.value).toBe("the same prompt")
    })
  })
})
