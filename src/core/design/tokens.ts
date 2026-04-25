// src/core/design/tokens.ts
// Full 10-color × 5-variant table — 50 literal class strings for JIT scanning (Rule 1).
// Exempt from check-loc (constants table per Rule 7 exception).

import type { ColorVariant, ColorVariantClasses, WorkflowId } from "./types"

export const WORKFLOW_COLORS: Record<WorkflowId, ColorVariant> = {
  "artwork-batch":    "violet",
  "ad-production":    "blue",
  "style-transform":  "pink",
  "aso-screenshots":  "emerald",
  "google-ads":       "sky",
}

export const SEMANTIC_COLORS = {
  primary:  "indigo" as ColorVariant,
  success:  "green" as ColorVariant,
  warning:  "yellow" as ColorVariant,
  danger:   "red" as ColorVariant,
  info:     "sky" as ColorVariant,
  neutral:  "slate" as ColorVariant,
} as const

// Full 10-color × 5-variant table — 50 literal class strings for JIT scanning
export const COLOR_CLASSES: Record<ColorVariant, ColorVariantClasses> = {
  violet: {
    active:   "bg-gradient-to-br from-violet-600 to-violet-800 border-violet-500 text-white shadow-lg shadow-violet-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-violet-500/50 hover:text-violet-400",
    glow:     "bg-violet-500/5",
    badge:    "bg-violet-500/10 text-violet-400 border-violet-500/30",
    text:     "text-violet-400",
  },
  blue: {
    active:   "bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 text-white shadow-lg shadow-blue-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-blue-400",
    glow:     "bg-blue-500/5",
    badge:    "bg-blue-500/10 text-blue-400 border-blue-500/30",
    text:     "text-blue-400",
  },
  pink: {
    active:   "bg-gradient-to-br from-pink-600 to-pink-800 border-pink-500 text-white shadow-lg shadow-pink-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-pink-500/50 hover:text-pink-400",
    glow:     "bg-pink-500/5",
    badge:    "bg-pink-500/10 text-pink-400 border-pink-500/30",
    text:     "text-pink-400",
  },
  emerald: {
    active:   "bg-gradient-to-br from-emerald-600 to-emerald-800 border-emerald-500 text-white shadow-lg shadow-emerald-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400",
    glow:     "bg-emerald-500/5",
    badge:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    text:     "text-emerald-400",
  },
  indigo: {
    active:   "bg-gradient-to-br from-indigo-600 to-indigo-800 border-indigo-500 text-white shadow-lg shadow-indigo-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-400",
    glow:     "bg-indigo-500/5",
    badge:    "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    text:     "text-indigo-400",
  },
  green: {
    active:   "bg-gradient-to-br from-green-600 to-green-800 border-green-500 text-white shadow-lg shadow-green-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-green-500/50 hover:text-green-400",
    glow:     "bg-green-500/5",
    badge:    "bg-green-500/10 text-green-400 border-green-500/30",
    text:     "text-green-400",
  },
  yellow: {
    active:   "bg-gradient-to-br from-yellow-600 to-yellow-800 border-yellow-500 text-white shadow-lg shadow-yellow-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-yellow-500/50 hover:text-yellow-400",
    glow:     "bg-yellow-500/5",
    badge:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    text:     "text-yellow-400",
  },
  red: {
    active:   "bg-gradient-to-br from-red-600 to-red-800 border-red-500 text-white shadow-lg shadow-red-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-red-500/50 hover:text-red-400",
    glow:     "bg-red-500/5",
    badge:    "bg-red-500/10 text-red-400 border-red-500/30",
    text:     "text-red-400",
  },
  sky: {
    active:   "bg-gradient-to-br from-sky-600 to-sky-800 border-sky-500 text-white shadow-lg shadow-sky-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-sky-500/50 hover:text-sky-400",
    glow:     "bg-sky-500/5",
    badge:    "bg-sky-500/10 text-sky-400 border-sky-500/30",
    text:     "text-sky-400",
  },
  slate: {
    active:   "bg-gradient-to-br from-slate-600 to-slate-800 border-slate-500 text-white shadow-lg shadow-slate-900/40",
    inactive: "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500/50 hover:text-slate-400",
    glow:     "bg-slate-500/5",
    badge:    "bg-slate-500/10 text-slate-400 border-slate-500/30",
    text:     "text-slate-400",
  },
}
