// Session #39 Phase B1 — text-overlay brainstorm fallback.
//
// Q-39.F': 5 tone-labelled templates returned verbatim when the LLM is
// offline, with optional profile-derived interpolation for {{appName}} and
// {{usp}}. Each template targets a distinct emotional register so the user
// can pick whichever matches their campaign.

import type { AppProfile } from "@/core/schemas/app-profile"
import { tryLoadProfile } from "@/server/profile-repo"
import type { PromptAssistResult } from "./types"

export type OverlayTone =
  | "bold"
  | "playful"
  | "minimal"
  | "urgency"
  | "social-proof"

interface OverlayTemplate {
  tone: OverlayTone
  template: string
}

const TEMPLATES: readonly OverlayTemplate[] = [
  { tone: "bold",         template: "{{headline}} — built for those who ship." },
  { tone: "playful",      template: "Yep, {{appName}} does that too. {{headline}}" },
  { tone: "minimal",      template: "{{headline}}" },
  { tone: "urgency",      template: "Last chance: {{headline}}. Try {{appName}} today." },
  { tone: "social-proof", template: "Why teams choose {{appName}}: {{usp}}." },
]

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function pullProfileVars(profile: AppProfile | null): Record<string, string> {
  if (!profile) return { appName: "your app", usp: "what makes you different" }
  return {
    appName: profile.name,
    usp: profile.positioning.usp,
  }
}

export interface ComposeOverlayArgs {
  headline?: string
  profileId?: string
}

export function composeTextOverlayBrainstorm(args: ComposeOverlayArgs): PromptAssistResult {
  const profile = args.profileId ? tryLoadProfile(args.profileId) : null
  const vars = {
    ...pullProfileVars(profile),
    headline: args.headline?.trim() || "your headline here",
  }
  const lines = TEMPLATES.map((t) => `[${t.tone}] ${interpolate(t.template, vars)}`)
  const notes = profile
    ? ["LLM offline — 5 tone templates with profile interpolation"]
    : ["LLM offline — 5 generic tone templates"]
  return {
    prompt: lines.join("\n"),
    notes,
    fromFallback: true,
  }
}
