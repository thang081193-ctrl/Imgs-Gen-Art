// Session #30 Step 4 — helpers for the Profiles list page.
//
// `initialsFor`: deterministic 2-char badge when a profile has no logoUrl.
//   Intl.Segmenter picks word boundaries (handles VN multi-byte graphemes)
//   → first char of each of the first two words → uppercased.
// `hueFor`: deterministic HSL hue from name hash → colored fallback bg.
// `formatRelative`: "just now" / "5m ago" / "3h ago" / "2d ago" / absolute
//   ISO beyond 30 days. Full timestamp exposed via a tooltip at the call site.

export function initialsFor(name: string): string {
  const trimmed = name.trim()
  if (trimmed === "") return "??"
  const words = segmentWords(trimmed).slice(0, 2)
  if (words.length === 0) return "??"
  const chars = words
    .map((w) => firstChar(w).toUpperCase())
    .filter((c) => c !== "")
  if (chars.length === 0) return "??"
  return (chars.join("") + "?").slice(0, 2)
}

function segmentWords(input: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "word" })
    return Array.from(seg.segment(input))
      .filter((s) => s.isWordLike === true)
      .map((s) => s.segment)
  }
  return input.split(/\s+/).filter((w) => w !== "")
}

function firstChar(word: string): string {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    const iter = seg.segment(word)[Symbol.iterator]()
    const first = iter.next()
    return first.done === true ? "" : (first.value as { segment: string }).segment
  }
  return word.charAt(0)
}

export function hueFor(name: string): number {
  // 32-bit FNV-1a → modulo 360 for a stable hue.
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const positive = h >>> 0
  return positive % 360
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return "—"
  const deltaMs = now.getTime() - then.getTime()
  const sec = Math.round(deltaMs / 1000)
  if (sec < 45) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return then.toISOString().slice(0, 10)
}
