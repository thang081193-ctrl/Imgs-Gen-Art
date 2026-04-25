// Session #40 Phase B2 — active profile slot, persisted in localStorage.
//
// PromptAssistPanel + the 3 prompt-assist hooks read this at submit time so
// the backend can apply profile-aware prompt augmentation. Profiles.tsx
// owns writing it (★ button on each row). When unset, hooks omit
// `profileId` from the request body and the backend falls through to its
// generic fallback path.
//
// Q-40.K: bro confirmed the localStorage key as `activeProfileId`. Same-
// tab change is broadcast via a CustomEvent so subscribers can re-render
// (the native `storage` event only fires across tabs).

import { useEffect, useState } from "react"

const STORAGE_KEY = "activeProfileId"
const CHANGE_EVENT = "active-profile-id-change"

export function getActiveProfileId(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw && raw.length > 0 ? raw : null
}

export function setActiveProfileId(id: string | null): void {
  if (typeof window === "undefined") return
  if (id === null) {
    window.localStorage.removeItem(STORAGE_KEY)
  } else {
    window.localStorage.setItem(STORAGE_KEY, id)
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useActiveProfileId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => getActiveProfileId())
  useEffect(() => {
    const sync = (): void => setId(getActiveProfileId())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return [id, setActiveProfileId]
}
