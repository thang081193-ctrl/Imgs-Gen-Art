// @vitest-environment jsdom
//
// S#40 Phase B2 — RTL component tests for PromptAssistPanel + the 3
// subcontrols. Stubs global fetch so we exercise the full path without
// hitting the server. Covers tab switching, dropzone validation, idea
// form character counter + submit, and overlay modal parsing/usage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"

import { PromptAssistPanel } from "@/client/components/prompt-assist/PromptAssistPanel"
import { ReverseImageDropzone } from "@/client/components/prompt-assist/ReverseImageDropzone"
import { IdeaInputForm } from "@/client/components/prompt-assist/IdeaInputForm"
import { OverlayPickerModal } from "@/client/components/prompt-assist/OverlayPickerModal"
import { FromFallbackPill } from "@/client/components/prompt-assist/FromFallbackPill"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ prompt: "expanded prompt" })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("FromFallbackPill", () => {
  it("renders the offline notice with explanatory tooltip", () => {
    render(<FromFallbackPill />)
    const pill = screen.getByTestId("from-fallback-pill")
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute("title", expect.stringMatching(/template/i))
  })
})

describe("PromptAssistPanel", () => {
  it("renders collapsed when defaultOpen=false and toggles open", () => {
    render(
      <PromptAssistPanel
        defaultOpen={false}
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    expect(screen.queryByTestId("prompt-assist-tab-reverse")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Prompt-assist/i }))
    expect(screen.getByTestId("prompt-assist-tab-reverse")).toBeInTheDocument()
  })

  it("starts on Reverse tab and switches to Idea on click", () => {
    render(
      <PromptAssistPanel onUsePrompt={() => {}} onTerminalError={() => {}} />,
    )
    expect(screen.getByTestId("reverse-dropzone")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("prompt-assist-tab-idea"))
    expect(screen.getByTestId("idea-form")).toBeInTheDocument()
    expect(screen.queryByTestId("reverse-dropzone")).toBeNull()
  })

  it("Overlay tab opens the modal instead of inline switching", () => {
    render(
      <PromptAssistPanel onUsePrompt={() => {}} onTerminalError={() => {}} />,
    )
    expect(screen.queryByTestId("overlay-modal-backdrop")).toBeNull()
    fireEvent.click(screen.getByTestId("prompt-assist-tab-overlay"))
    expect(screen.getByTestId("overlay-modal-backdrop")).toBeInTheDocument()
    // Reverse remains the active inline tab
    expect(screen.getByTestId("reverse-dropzone")).toBeInTheDocument()
  })
})

describe("ReverseImageDropzone", () => {
  it("rejects non-image MIME with inline error, never calls fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ prompt: "x" }))
    vi.stubGlobal("fetch", fetchSpy)
    render(
      <ReverseImageDropzone
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    const input = screen.getByTestId("reverse-file-input") as HTMLInputElement
    const badFile = new File(["x"], "doc.pdf", { type: "application/pdf" })
    fireEvent.change(input, { target: { files: [badFile] } })
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported/i)
    fireEvent.click(screen.getByRole("button", { name: /Reverse-engineer/i }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("accepts a PNG and posts on submit", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ prompt: "reverse output" }))
    vi.stubGlobal("fetch", fetchSpy)
    render(
      <ReverseImageDropzone
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    const input = screen.getByTestId("reverse-file-input") as HTMLInputElement
    const png = new File(["bytes"], "x.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [png] } })
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Reverse-engineer/i }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText("reverse output")).toBeInTheDocument()
    })
  })

  it("renders FromFallbackPill when fromFallback:true is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ prompt: "fb prompt", fromFallback: true }),
      ),
    )
    render(
      <ReverseImageDropzone
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    const input = screen.getByTestId("reverse-file-input") as HTMLInputElement
    const png = new File(["bytes"], "x.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [png] } })
    fireEvent.click(screen.getByRole("button", { name: /Reverse-engineer/i }))
    await waitFor(() => {
      expect(screen.getByTestId("from-fallback-pill")).toBeInTheDocument()
    })
  })

  it("Use this prompt button forwards the prompt to onUsePrompt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ prompt: "the prompt" })),
    )
    const onUsePrompt = vi.fn()
    render(
      <ReverseImageDropzone
        onUsePrompt={onUsePrompt}
        onTerminalError={() => {}}
      />,
    )
    const input = screen.getByTestId("reverse-file-input") as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["b"], "x.png", { type: "image/png" })] },
    })
    fireEvent.click(screen.getByRole("button", { name: /Reverse-engineer/i }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Use this prompt/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: /Use this prompt/i }))
    expect(onUsePrompt).toHaveBeenCalledWith("the prompt")
  })
})

describe("IdeaInputForm", () => {
  it("disables submit until idea reaches 3 chars", () => {
    render(<IdeaInputForm onUsePrompt={() => {}} onTerminalError={() => {}} />)
    const submit = screen.getByRole("button", { name: /Expand to prompt/i })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId("idea-textarea"), {
      target: { value: "ab" },
    })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId("idea-textarea"), {
      target: { value: "abc" },
    })
    expect(submit).not.toBeDisabled()
  })

  it("posts to /api/prompt-assist/idea-to-prompt with the typed lane + idea", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ prompt: "ok" }))
    vi.stubGlobal("fetch", fetchSpy)
    render(<IdeaInputForm onUsePrompt={() => {}} onTerminalError={() => {}} />)
    fireEvent.change(screen.getByTestId("idea-lane-select"), {
      target: { value: "aso.play" },
    })
    fireEvent.change(screen.getByTestId("idea-textarea"), {
      target: { value: "promote winter sale" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Expand to prompt/i }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(init.body as string) as Record<string, string>
    expect(body.lane).toBe("aso.play")
    expect(body.idea).toBe("promote winter sale")
  })

  it("disables lane select when wizard provides lane prop (Q-40.J)", () => {
    render(
      <IdeaInputForm
        lane="ads.meta"
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    expect(screen.getByTestId("idea-lane-select")).toBeDisabled()
  })
})

describe("OverlayPickerModal", () => {
  const FALLBACK_PROMPT = [
    "[bold] Built for those who ship.",
    "[playful] Yep, your app does that too. Ship faster",
    "[minimal] Ship faster",
    "[urgency] Last chance: Ship faster. Try your app today.",
    "[social-proof] Why teams choose your app: what makes you different.",
  ].join("\n")

  it("does not render when open=false", () => {
    render(
      <OverlayPickerModal
        open={false}
        onClose={() => {}}
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    expect(screen.queryByTestId("overlay-modal-backdrop")).toBeNull()
  })

  it("submits, parses 5 lines, and renders 5 cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ prompt: FALLBACK_PROMPT, fromFallback: true }),
      ),
    )
    render(
      <OverlayPickerModal
        open={true}
        onClose={() => {}}
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    fireEvent.change(screen.getByTestId("overlay-headline-input"), {
      target: { value: "Ship faster" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Brainstorm 5 overlays/i }))
    await waitFor(() => {
      expect(screen.getByTestId("overlay-list")).toBeInTheDocument()
    })
    expect(screen.getByTestId("overlay-card-0")).toBeInTheDocument()
    expect(screen.getByTestId("overlay-card-4")).toBeInTheDocument()
    expect(screen.queryByTestId("overlay-card-5")).toBeNull()
    expect(screen.getByTestId("from-fallback-pill")).toBeInTheDocument()
  })

  it("Use as prompt wraps the overlay text and closes the modal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ prompt: FALLBACK_PROMPT })),
    )
    const onUsePrompt = vi.fn()
    const onClose = vi.fn()
    render(
      <OverlayPickerModal
        open={true}
        onClose={onClose}
        onUsePrompt={onUsePrompt}
        onTerminalError={() => {}}
      />,
    )
    fireEvent.change(screen.getByTestId("overlay-headline-input"), {
      target: { value: "Ship faster" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Brainstorm 5 overlays/i }))
    await waitFor(() => {
      expect(screen.getByTestId("overlay-card-0")).toBeInTheDocument()
    })
    const firstCard = screen.getByTestId("overlay-card-0")
    fireEvent.click(
      firstCard.querySelector("button.bg-emerald-700") as HTMLButtonElement,
    )
    expect(onUsePrompt).toHaveBeenCalledWith(
      'Generate an image with text overlay: "Built for those who ship."',
    )
    expect(onClose).toHaveBeenCalled()
  })

  it("Esc key closes the modal", () => {
    const onClose = vi.fn()
    render(
      <OverlayPickerModal
        open={true}
        onClose={onClose}
        onUsePrompt={() => {}}
        onTerminalError={() => {}}
      />,
    )
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })
})
