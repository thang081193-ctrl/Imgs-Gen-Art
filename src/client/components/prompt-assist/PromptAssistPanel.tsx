// Session #40 Phase B2 — collapsible Prompt-assist panel.
//
// 3 tabs: Reverse / Idea / Overlay. Reverse + Idea inline; Overlay opens
// a modal to keep the panel narrow on the right rail (Q-40.E). Wizard-
// shape props (Q-40.J): `lane` + `platform` flow down to subcomponents
// without rewrites when D1/D2 wizard reuses this verbatim.

import { useState } from "react"
import type { ReactElement } from "react"

import type { PromptAssistLane } from "@/client/api/prompt-assist-hooks"

import { IdeaInputForm } from "./IdeaInputForm"
import { OverlayPickerModal } from "./OverlayPickerModal"
import { ReverseImageDropzone } from "./ReverseImageDropzone"

type Tab = "reverse" | "idea" | "overlay"

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "reverse", label: "Reverse" },
  { id: "idea", label: "Idea → Prompt" },
  { id: "overlay", label: "Overlay" },
]

export interface PromptAssistPanelProps {
  lane?: PromptAssistLane
  platform?: string
  onUsePrompt: (prompt: string) => void
  onTerminalError: (message: string) => void
  defaultOpen?: boolean
}

export function PromptAssistPanel({
  lane,
  platform,
  onUsePrompt,
  onTerminalError,
  defaultOpen = true,
}: PromptAssistPanelProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const [tab, setTab] = useState<Tab>("reverse")
  const [overlayOpen, setOverlayOpen] = useState(false)

  return (
    <section
      className="rounded-md border border-slate-800 bg-slate-900/60"
      data-testid="prompt-assist-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          ✨ Prompt-assist
        </span>
        <span className="text-xs text-slate-500" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-800 p-3">
          <div className="mb-3 flex gap-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  if (t.id === "overlay") {
                    setOverlayOpen(true)
                  } else {
                    setTab(t.id)
                  }
                }}
                data-testid={`prompt-assist-tab-${t.id}`}
                className={`rounded px-2 py-1 text-[11px] font-medium ${
                  tab === t.id && t.id !== "overlay"
                    ? "bg-sky-700 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "reverse" && (
            <ReverseImageDropzone
              {...(lane !== undefined ? { lane } : {})}
              {...(platform !== undefined ? { platform } : {})}
              onUsePrompt={onUsePrompt}
              onTerminalError={onTerminalError}
            />
          )}
          {tab === "idea" && (
            <IdeaInputForm
              {...(lane !== undefined ? { lane } : {})}
              {...(platform !== undefined ? { platform } : {})}
              onUsePrompt={onUsePrompt}
              onTerminalError={onTerminalError}
            />
          )}

          <OverlayPickerModal
            open={overlayOpen}
            onClose={() => setOverlayOpen(false)}
            onUsePrompt={(p) => {
              onUsePrompt(p)
              setOverlayOpen(false)
            }}
            onTerminalError={onTerminalError}
          />
        </div>
      )}
    </section>
  )
}
