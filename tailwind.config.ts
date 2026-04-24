// Session #33 theme overlay — Tailwind slate palette routed through CSS
// custom properties so `<html data-theme="light|dark">` swaps colors
// globally without touching the hundreds of existing `bg-slate-*` /
// `text-slate-*` / `border-slate-*` literals in components.
//
// `rgb(var(...) / <alpha-value>)` keeps Tailwind's alpha modifier
// working (`bg-slate-900/40` still resolves correctly).
//
// `darkMode` points at the `[data-theme="dark"]` selector so any `dark:`
// variant authored in components matches our controller's toggle. The
// non-data-theme branch (default) already is dark per theme.css :root,
// so components that never use `dark:` utilities still render correctly.

import type { Config } from "tailwindcss"

const slateVar = (shade: number): string => `rgb(var(--color-slate-${shade}) / <alpha-value>)`

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: slateVar(50),
          100: slateVar(100),
          200: slateVar(200),
          300: slateVar(300),
          400: slateVar(400),
          500: slateVar(500),
          600: slateVar(600),
          700: slateVar(700),
          800: slateVar(800),
          900: slateVar(900),
          950: slateVar(950),
        },
      },
    },
  },
  plugins: [],
}

export default config
