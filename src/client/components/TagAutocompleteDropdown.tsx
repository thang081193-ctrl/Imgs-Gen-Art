// Session #32 F4-FE — combobox dropdown for the Gallery tag autocomplete.
// Pure presentation: parent owns debounced query + highlight state, hands
// the filtered suggestion list + selection callback. onMouseDown is used
// instead of onClick so the input doesn't blur before the selection lands.

import type { MouseEvent, ReactElement } from "react"

export interface TagSuggestion {
  tag: string
  count: number
}

export interface TagAutocompleteDropdownProps {
  suggestions: TagSuggestion[]
  highlightIdx: number
  prefix: string
  onSelect: (tag: string) => void
  loading?: boolean
}

export function TagAutocompleteDropdown({
  suggestions,
  highlightIdx,
  prefix,
  onSelect,
  loading,
}: TagAutocompleteDropdownProps): ReactElement | null {
  if (loading === true && suggestions.length === 0) {
    return (
      <ul
        role="listbox"
        className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-slate-700 bg-slate-900 p-1 text-xs text-slate-400 shadow-lg"
      >
        <li className="px-2 py-1">Loading…</li>
      </ul>
    )
  }

  if (suggestions.length === 0) return null

  const handleMouseDown = (e: MouseEvent<HTMLLIElement>, tag: string): void => {
    // preventDefault stops the input onBlur from firing before onSelect,
    // which would otherwise commit the typed draft and drop the suggestion.
    e.preventDefault()
    onSelect(tag)
  }

  return (
    <ul
      role="listbox"
      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg"
    >
      {suggestions.map((s, idx) => {
        const highlighted = idx === highlightIdx
        return (
          <li
            key={s.tag}
            role="option"
            aria-selected={highlighted}
            onMouseDown={(e) => handleMouseDown(e, s.tag)}
            className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
              highlighted ? "bg-slate-700 text-slate-100" : "text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span>{renderPrefixMatch(s.tag, prefix)}</span>
            <span className="text-slate-500">{s.count}</span>
          </li>
        )
      })}
    </ul>
  )
}

function renderPrefixMatch(tag: string, prefix: string): ReactElement {
  if (prefix === "" || !tag.toLowerCase().startsWith(prefix.toLowerCase())) {
    return <span>#{tag}</span>
  }
  const head = tag.slice(0, prefix.length)
  const tail = tag.slice(prefix.length)
  return (
    <span>
      #<strong className="text-slate-100">{head}</strong>
      <span>{tail}</span>
    </span>
  )
}
