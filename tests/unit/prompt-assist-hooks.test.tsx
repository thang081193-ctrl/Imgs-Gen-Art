// @vitest-environment jsdom
//
// S#40 Phase B2 — prompt-assist hooks unit tests. Stubs global fetch and
// drives the 3 hooks through happy / fromFallback / network-error paths.
// Also covers the parseOverlayLines helper and the active-profile slot
// (request body must include profileId when set, omit when not).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"

import {
  parseOverlayLines,
  PromptAssistError,
  useIdeaToPrompt,
  useReverseFromImage,
  useTextOverlayBrainstorm,
  type PromptAssistResult,
} from "@/client/api/prompt-assist-hooks"
import { setActiveProfileId } from "@/client/utils/active-profile"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function captureRequests(): { calls: Array<{ url: string; init: RequestInit }>; restore: () => void } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return jsonResponse({ prompt: "ok" } satisfies PromptAssistResult)
  })
  vi.stubGlobal("fetch", fn)
  return { calls, restore: () => vi.unstubAllGlobals() }
}

interface HarnessRecord {
  state: string
  result: PromptAssistResult | null
  error: PromptAssistError | null
}

function HookHarness<I>({
  useHook,
  input,
  onUpdate,
}: {
  useHook: () => {
    state: string
    result: PromptAssistResult | null
    error: PromptAssistError | null
    submit: (input: I) => Promise<PromptAssistResult>
  }
  input: I
  onUpdate: (rec: HarnessRecord & { submit: () => Promise<PromptAssistResult> }) => void
}): null {
  const h = useHook()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    onUpdate({
      state: h.state,
      result: h.result,
      error: h.error,
      submit: () => h.submit(input),
    })
  }, [h.state, h.result, h.error, tick, h, input, onUpdate])
  useEffect(() => {
    setTick((t) => t + 1)
  }, [])
  return null
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("useIdeaToPrompt", () => {
  it("happy path: state transitions idle → submitting → done with result", async () => {
    const { calls } = captureRequests()
    const records: HarnessRecord[] = []
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))

    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "winter sale promo", lane: "ads.meta" }}
        onUpdate={(r) => {
          records.push({ state: r.state, result: r.result, error: r.error })
          submit = r.submit
        }}
      />,
    )

    expect(records.at(-1)?.state).toBe("idle")
    await act(async () => {
      await submit()
    })
    expect(records.at(-1)?.state).toBe("done")
    expect(records.at(-1)?.result?.prompt).toBe("ok")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("/api/prompt-assist/idea-to-prompt")
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, string>
    expect(body.idea).toBe("winter sale promo")
    expect(body.lane).toBe("ads.meta")
    expect(body.profileId).toBeUndefined()
  })

  it("includes profileId from active-profile slot when set", async () => {
    setActiveProfileId("prof_abc")
    const { calls } = captureRequests()
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))

    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "abc", lane: "ads.meta" }}
        onUpdate={(r) => {
          submit = r.submit
        }}
      />,
    )

    await act(async () => {
      await submit()
    })
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, string>
    expect(body.profileId).toBe("prof_abc")
  })

  it("validation error: idea < 3 chars throws PromptAssistError without firing fetch", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse({ prompt: "x" }))
    vi.stubGlobal("fetch", fn)
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastError: PromptAssistError | null = null

    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "ab", lane: "ads.meta" }}
        onUpdate={(r) => {
          submit = r.submit
          lastError = r.error
        }}
      />,
    )

    await act(async () => {
      await submit().catch(() => undefined)
    })
    expect(fn).not.toHaveBeenCalled()
    expect(lastError).toBeInstanceOf(PromptAssistError)
    expect(lastError!.kind).toBe("validation")
  })

  it("network error: state goes to error, error.kind = network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastError: PromptAssistError | null = null
    let lastState = ""

    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "abc", lane: "ads.meta" }}
        onUpdate={(r) => {
          submit = r.submit
          lastError = r.error
          lastState = r.state
        }}
      />,
    )

    await act(async () => {
      await submit().catch(() => undefined)
    })
    expect(lastState).toBe("error")
    expect(lastError!.kind).toBe("network")
  })

  it("fromFallback: true is preserved in result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ prompt: "fallback prompt", fromFallback: true }),
      ),
    )
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastResult: PromptAssistResult | null = null

    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "abc", lane: "ads.meta" }}
        onUpdate={(r) => {
          submit = r.submit
          lastResult = r.result
        }}
      />,
    )

    await act(async () => {
      await submit()
    })
    expect(lastResult?.fromFallback).toBe(true)
  })
})

describe("useReverseFromImage", () => {
  it("rejects unsupported MIME without firing fetch", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse({ prompt: "x" }))
    vi.stubGlobal("fetch", fn)
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" })
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastError: PromptAssistError | null = null

    render(
      <HookHarness
        useHook={useReverseFromImage}
        input={{ image: file }}
        onUpdate={(r) => {
          submit = r.submit
          lastError = r.error
        }}
      />,
    )

    await act(async () => {
      await submit().catch(() => undefined)
    })
    expect(fn).not.toHaveBeenCalled()
    expect(lastError!.kind).toBe("validation")
    expect(lastError!.message).toMatch(/unsupported/i)
  })

  it("rejects oversized files (>5MB) without firing fetch", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse({ prompt: "x" }))
    vi.stubGlobal("fetch", fn)
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" })
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastError: PromptAssistError | null = null

    render(
      <HookHarness
        useHook={useReverseFromImage}
        input={{ image: big }}
        onUpdate={(r) => {
          submit = r.submit
          lastError = r.error
        }}
      />,
    )

    await act(async () => {
      await submit().catch(() => undefined)
    })
    expect(fn).not.toHaveBeenCalled()
    expect(lastError!.kind).toBe("validation")
    expect(lastError!.message).toMatch(/too large/i)
  })

  it("posts multipart form with image + lane + platform on happy path", async () => {
    const { calls } = captureRequests()
    const file = new File(["png-bytes"], "x.png", { type: "image/png" })
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))

    render(
      <HookHarness
        useHook={useReverseFromImage}
        input={{ image: file, lane: "ads.meta", platform: "feed" }}
        onUpdate={(r) => {
          submit = r.submit
        }}
      />,
    )

    await act(async () => {
      await submit()
    })
    expect(calls[0]?.url).toBe("/api/prompt-assist/reverse-from-image")
    expect(calls[0]?.init.body).toBeInstanceOf(FormData)
    const fd = calls[0]!.init.body as FormData
    expect(fd.get("lane")).toBe("ads.meta")
    expect(fd.get("platform")).toBe("feed")
    expect(fd.get("image")).toBeInstanceOf(File)
  })
})

describe("useTextOverlayBrainstorm", () => {
  it("requires at least one of headline/description/image", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse({ prompt: "x" }))
    vi.stubGlobal("fetch", fn)
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))
    let lastError: PromptAssistError | null = null

    render(
      <HookHarness
        useHook={useTextOverlayBrainstorm}
        input={{}}
        onUpdate={(r) => {
          submit = r.submit
          lastError = r.error
        }}
      />,
    )

    await act(async () => {
      await submit().catch(() => undefined)
    })
    expect(fn).not.toHaveBeenCalled()
    expect(lastError!.kind).toBe("validation")
  })

  it("posts JSON with headline trimmed", async () => {
    const { calls } = captureRequests()
    let submit: () => Promise<PromptAssistResult> = () => Promise.reject(new Error("not ready"))

    render(
      <HookHarness
        useHook={useTextOverlayBrainstorm}
        input={{ headline: "  Ship faster  " }}
        onUpdate={(r) => {
          submit = r.submit
        }}
      />,
    )

    await act(async () => {
      await submit()
    })
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, string>
    expect(body.headline).toBe("Ship faster")
  })
})

describe("parseOverlayLines", () => {
  it("splits 5 tone-prefixed lines from the canonical fallback shape", () => {
    const prompt = [
      "[bold] Built for those who ship.",
      "[playful] Yep, your app does that too.",
      "[minimal] Ship faster",
      "[urgency] Last chance: ship today.",
      "[social-proof] Why teams choose your app.",
    ].join("\n")
    const lines = parseOverlayLines(prompt)
    expect(lines).toHaveLength(5)
    expect(lines.map((l) => l.tone)).toEqual([
      "bold",
      "playful",
      "minimal",
      "urgency",
      "social-proof",
    ])
    expect(lines[0]?.text).toBe("Built for those who ship.")
  })

  it("falls back to 'freeform' tone for un-prefixed lines", () => {
    const lines = parseOverlayLines("just a plain headline\n[bold] tagged one")
    expect(lines).toHaveLength(2)
    expect(lines[0]?.tone).toBe("freeform")
    expect(lines[1]?.tone).toBe("bold")
  })

  it("ignores blank lines", () => {
    const lines = parseOverlayLines("[bold] x\n\n   \n[minimal] y")
    expect(lines).toHaveLength(2)
  })
})

describe("smoke render does not blow up", () => {
  it("hook harness mounts cleanly", () => {
    captureRequests()
    render(
      <HookHarness
        useHook={useIdeaToPrompt}
        input={{ idea: "abc", lane: "ads.meta" }}
        onUpdate={() => {}}
      />,
    )
    // sanity: nothing rendered to the DOM, but no throw
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
