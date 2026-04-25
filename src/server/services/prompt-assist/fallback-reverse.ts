// Session #39 Phase B1 — reverse-from-image fallback (LLM-free).
//
// Q-39.F': honest stub. We can't analyse pixels without a vision LLM, so the
// fallback hands back a structured "describe-this-image" template anchored
// on profile + lane/platform context. User refines manually.

import { tryLoadProfile } from "@/server/profile-repo"
import type { PromptAssistLane, PromptAssistResult } from "./types"

export interface ComposeReverseArgs {
  lane?: PromptAssistLane
  platform?: string
  profileId?: string
}

export function composeReverseFromImageFallback(
  args: ComposeReverseArgs,
): PromptAssistResult {
  const profile = args.profileId ? tryLoadProfile(args.profileId) : null
  const surface = args.platform ? `${args.lane ?? "creative"} (${args.platform})` : (args.lane ?? "creative")

  const parts: string[] = [
    `Describe a ${surface} hero image with subject + style + mood + composition.`,
  ]
  if (profile) {
    parts.push(
      `Brand context: ${profile.name} — ${profile.tagline}. USP: ${profile.positioning.usp}. Tone: ${profile.visual.tone}.`,
    )
  }
  parts.push("Refine subject + lighting + palette manually before regenerating.")

  return {
    prompt: parts.join(" "),
    notes: profile
      ? ["LLM offline — generic reverse template anchored on profile"]
      : ["LLM offline — generic reverse template (no profile context)"],
    fromFallback: true,
  }
}
