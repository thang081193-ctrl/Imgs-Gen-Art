// Session #39 Phase B1 — profile + idea → prompt composer (LLM-free fallback).
//
// Q-39.F': when the active LLM provider is unreachable, this composer weaves
// the user's `idea` together with their AppProfile (loaded by id) into a
// lane-specific prompt. Honest about being a fallback (`fromFallback: true`,
// notes: ["LLM offline — composed from profile + idea"]) so the UI surfaces
// the degraded state.
//
// No reuse of v1 workflow builders — those require a fully-pipelined Concept
// + layout/copy file load that the wizard's free-form idea path can't supply.
// A purpose-built lightweight template here is honest and ~80 LOC vs 150+
// LOC of synthetic-Concept glue.

import type { AppProfile } from "@/core/schemas/app-profile"
import { tryLoadProfile } from "@/server/profile-repo"
import type { PromptAssistLane, PromptAssistResult } from "./types"

interface ProfileFacts {
  app: string
  category: string
  tagline: string
  usp: string
  persona: string
  tone: string
  primaryColor: string
  accentColor: string
  features: string[]
  doList: string[]
  dontList: string[]
}

function distill(profile: AppProfile): ProfileFacts {
  return {
    app: profile.name,
    category: profile.category,
    tagline: profile.tagline,
    usp: profile.positioning.usp,
    persona: profile.positioning.targetPersona,
    tone: profile.visual.tone,
    primaryColor: profile.visual.primaryColor,
    accentColor: profile.visual.accentColor,
    features: profile.context.features,
    doList: profile.visual.doList,
    dontList: [...profile.visual.dontList, ...profile.context.forbiddenContent],
  }
}

function joinList(list: string[], max = 5): string {
  if (list.length === 0) return "(none specified)"
  return list.slice(0, max).join("; ")
}

function composeAdPrompt(
  facts: ProfileFacts,
  idea: string,
  lane: "ads.meta" | "ads.google-ads",
  platform: string | undefined,
): string {
  const channel = lane === "ads.meta" ? "Meta" : "Google Ads"
  const surface = platform ? `${channel} (${platform})` : channel
  return [
    `Generate an ad creative for ${facts.app} (${facts.category}, ${facts.tagline}).`,
    `Channel: ${surface}.`,
    `USP: ${facts.usp}. Persona: ${facts.persona}. Tone: ${facts.tone}.`,
    `Palette: primary ${facts.primaryColor}, accent ${facts.accentColor}.`,
    `Idea / angle: ${idea}.`,
    `Include: ${joinList(facts.doList)}.`,
    `Avoid: ${joinList(facts.dontList)}.`,
  ].join(" ")
}

function composeAsoPrompt(
  facts: ProfileFacts,
  idea: string,
  platform: string | undefined,
): string {
  const surface = platform ?? "play"
  const featureHint = facts.features[0] ?? facts.usp
  return [
    `Generate a Play Store screenshot (surface: ${surface}) for ${facts.app}.`,
    `Persona: ${facts.persona}. Tone: ${facts.tone}.`,
    `Highlight feature: ${featureHint}. Idea / angle: ${idea}.`,
    `Show in-app UX with a headline overlay.`,
    `Palette: primary ${facts.primaryColor}, accent ${facts.accentColor}.`,
    `Avoid: ${joinList(facts.dontList)}.`,
  ].join(" ")
}

function composeArtworkPrompt(facts: ProfileFacts, idea: string): string {
  return [
    `Generate brand artwork for ${facts.app} (${facts.category}).`,
    `Style DNA: ${facts.tone} tone, palette ${facts.primaryColor} / ${facts.accentColor}.`,
    `Mood: aligned with persona "${facts.persona}".`,
    `Idea: ${idea}.`,
    `Composition + lighting guidance: subject-forward, brand-consistent.`,
    `Avoid: ${joinList(facts.dontList)}.`,
  ].join(" ")
}

function composeWithProfile(
  profile: AppProfile,
  idea: string,
  lane: PromptAssistLane,
  platform: string | undefined,
): string {
  const facts = distill(profile)
  switch (lane) {
    case "ads.meta":
    case "ads.google-ads":
      return composeAdPrompt(facts, idea, lane, platform)
    case "aso.play":
      return composeAsoPrompt(facts, idea, platform)
    case "artwork-batch":
      return composeArtworkPrompt(facts, idea)
  }
}

function composeGeneric(
  idea: string,
  lane: PromptAssistLane,
  platform: string | undefined,
): string {
  const surface = platform ? `${lane} (${platform})` : lane
  return [
    `Generate a ${surface} creative.`,
    `Idea / angle: ${idea}.`,
    `Subject, style, mood, composition guidance follow the idea.`,
  ].join(" ")
}

export interface ComposeIdeaToPromptArgs {
  idea: string
  lane: PromptAssistLane
  platform?: string
  profileId?: string
}

export function composeIdeaToPrompt(args: ComposeIdeaToPromptArgs): PromptAssistResult {
  const profile = args.profileId ? tryLoadProfile(args.profileId) : null
  const prompt = profile
    ? composeWithProfile(profile, args.idea, args.lane, args.platform)
    : composeGeneric(args.idea, args.lane, args.platform)
  const notes = profile
    ? ["LLM offline — composed from profile + idea"]
    : ["LLM offline — generic template (no profile context)"]
  return { prompt, notes, fromFallback: true }
}
