// Phase 5 Step 3b (Session #29) — tags sub-section of AssetFilterBar. Split
// out so the bar shell stays under the 250 LOC soft cap.
//
// Input model (Q-29.B confirmed):
//   - Delimiters: Enter, comma, Tab → commit the current draft as a chip.
//     Tab additionally keeps focus so power users can add several in a row.
//   - Backspace on an empty input removes the last chip (undo affordance).
//   - Dedupe: duplicate attempts surface a toast, draft clears.
//   - Normalization: trim → lowercase → collapse internal whitespace →
//     reject empty → cap at 50 chars (defensive; UI still renders gracefully).
//
// Match mode: OR (any) | AND (all). Default "any" — the chip summary shows
// the active mode in parentheses per Q-29.E family.
//
// Session #32 F4-FE — autocomplete combobox. While focused, fetches
// /api/tags (debounced 300ms) and surfaces distinct tags filtered to the
// current prefix. Already-selected tags are filtered out client-side.
// Keyboard nav: ArrowDown/Up moves highlight, Enter commits the highlighted
// suggestion (falling back to the typed draft when no row is highlighted),
// Escape closes the dropdown.

import { useState } from "react"
import type { KeyboardEvent, ReactElement } from "react"
import type { TagMatchMode } from "@/core/schemas/asset-list-filter"
import { useAssetTags } from "@/client/api/hooks"
import type { ShowToast } from "./ToastHost"
import { TagAutocompleteDropdown } from "./TagAutocompleteDropdown"

const MAX_TAG_LENGTH = 50

export interface FilterBarTagsSectionProps {
  tags: string[] | undefined
  matchMode: TagMatchMode | undefined
  onChange: (patch: { tags?: string[] | undefined; tagMatchMode?: TagMatchMode | undefined }) => void
  showToast: ShowToast
}

export function FilterBarTagsSection({
  tags,
  matchMode,
  onChange,
  showToast,
}: FilterBarTagsSectionProps): ReactElement {
  const [draft, setDraft] = useState<string>("")
  const [focused, setFocused] = useState<boolean>(false)
  const [highlightIdx, setHighlightIdx] = useState<number>(-1)
  const activeTags = tags ?? []
  const activeMode: TagMatchMode = matchMode ?? "any"

  // Send the trimmed+lowercased prefix so the autocomplete feels natural
  // (server LIKE is NOCASE anyway; this just keeps the fetched payload
  // stable as the user types trailing spaces). `null` when unfocused so
  // the hook skips fetching entirely.
  const fetchQuery = focused ? draft.trim().toLowerCase() : null
  const { data: tagsData, loading: tagsLoading } = useAssetTags(fetchQuery, 10)
  const selectedSet = new Set(activeTags)
  const suggestions = (tagsData?.tags ?? []).filter((t) => !selectedSet.has(t.tag))

  const tryAddTag = (raw: string): boolean => {
    const normalized = normalizeTag(raw)
    if (normalized === null) return false
    if (activeTags.includes(normalized)) {
      showToast({ variant: "info", message: `Tag "${normalized}" is already selected.` })
      return true
    }
    onChange({ tags: [...activeTags, normalized] })
    return true
  }

  const removeTag = (tag: string): void => {
    const next = activeTags.filter((t) => t !== tag)
    onChange({ tags: next.length > 0 ? next : undefined })
  }

  const commitSuggestion = (tag: string): void => {
    if (tryAddTag(tag)) {
      setDraft("")
      setHighlightIdx(-1)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => (i + 1) % suggestions.length)
      return
    }
    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      return
    }
    if (e.key === "Escape") {
      setFocused(false)
      setHighlightIdx(-1)
      return
    }
    const picked = highlightIdx >= 0 && highlightIdx < suggestions.length
      ? suggestions[highlightIdx]!.tag
      : null

    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      if (picked !== null) commitSuggestion(picked)
      else if (tryAddTag(draft)) setDraft("")
    } else if (e.key === "Tab" && (draft.trim() !== "" || picked !== null)) {
      e.preventDefault()
      if (picked !== null) commitSuggestion(picked)
      else if (tryAddTag(draft)) setDraft("")
    } else if (e.key === "Backspace" && draft === "" && activeTags.length > 0) {
      e.preventDefault()
      removeTag(activeTags[activeTags.length - 1]!)
    }
  }

  const setMode = (mode: TagMatchMode): void => {
    onChange({ tagMatchMode: mode === "any" ? undefined : mode })
  }

  return (
    <section
      id="filter-tags"
      tabIndex={-1}
      className="space-y-2 rounded-md border border-slate-800 bg-slate-900/40 p-3 outline-none"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400">Tags</span>
        <fieldset className="flex items-center gap-2 text-xs text-slate-400">
          <legend className="sr-only">Tag match mode</legend>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="tagMatchMode"
              value="any"
              checked={activeMode === "any"}
              onChange={() => setMode("any")}
            />
            any
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="tagMatchMode"
              value="all"
              checked={activeMode === "all"}
              onChange={() => setMode("all")}
            />
            all
          </label>
        </fieldset>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-2">
        {activeTags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 pl-2 text-xs text-slate-200"
          >
            <span>#{t}</span>
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-100"
              aria-label={`Remove tag ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setHighlightIdx(-1) }}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true) }}
          onBlur={() => {
            setFocused(false)
            setHighlightIdx(-1)
            if (draft.trim() !== "" && tryAddTag(draft)) setDraft("")
          }}
          placeholder={activeTags.length === 0 ? "Add tag — Enter / comma / Tab" : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-100 focus:outline-none"
          role="combobox"
          aria-expanded={focused && (suggestions.length > 0 || tagsLoading)}
          aria-autocomplete="list"
        />
        {focused && (
          <TagAutocompleteDropdown
            suggestions={suggestions}
            highlightIdx={highlightIdx}
            prefix={draft.trim()}
            onSelect={commitSuggestion}
            loading={tagsLoading}
          />
        )}
      </div>
    </section>
  )
}

// Normalize a tag input: trim, lowercase, collapse whitespace, reject empty,
// clamp to 50 chars. Returns null when the input is unusable.
export function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ")
  if (trimmed === "") return null
  return trimmed.slice(0, MAX_TAG_LENGTH)
}
