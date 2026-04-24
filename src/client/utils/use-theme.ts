// Session #33 theme controller — React hook wrapping localStorage +
// prefers-color-scheme + `<html data-theme>` attribute sync. Ports the
// JM Slate starter's theme.js controller to TypeScript + useState.
//
// `index.html` ships an inline pre-hydration script that sets the same
// `data-theme` attribute before React mounts so there is no theme flash;
// this hook reads the same storage key + keeps the attribute in sync
// after user interaction.

import { useEffect, useState } from "react"

export type Theme = "dark" | "light"

export const THEME_STORAGE_KEY = "iga-theme"

function readStored(): Theme | null {
  if (typeof window === "undefined") return null
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return v === "dark" || v === "light" ? v : null
  } catch {
    return null
  }
}

function readSystem(): Theme {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = t
}

export function useTheme(): {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
} {
  const [theme, setThemeState] = useState<Theme>(() => readStored() ?? readSystem())

  useEffect(() => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // localStorage unavailable (private mode, quota) — silently skip persistence.
    }
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)")
    if (!mq) return undefined
    const listener = (e: MediaQueryListEvent): void => {
      // Respect explicit user choice: only sync with system if nothing stored.
      if (readStored()) return
      setThemeState(e.matches ? "light" : "dark")
    }
    mq.addEventListener?.("change", listener)
    return () => { mq.removeEventListener?.("change", listener) }
  }, [])

  return {
    theme,
    setTheme: setThemeState,
    toggle: () => { setThemeState((t) => (t === "dark" ? "light" : "dark")) },
  }
}
