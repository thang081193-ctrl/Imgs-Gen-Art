// Landing page. Fetches /api/health on mount, renders status badge + CTAs
// linking to Workflow + Gallery pages. Phase 5 CMS will extend with more
// primary-nav hero sections.

import type { ReactElement } from "react"
import { useApiHealth, type ApiState, type HealthData } from "@/client/api/hooks"
import type { NavParams, Page } from "@/client/navigator"

export interface HomeProps {
  onNav: (page: Page, params?: NavParams) => void
}

export function Home({ onNav }: HomeProps): ReactElement {
  const health = useApiHealth()

  return (
    <main className="flex flex-col items-center justify-center p-8 min-h-[calc(100vh-60px)]">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-6xl tracking-tight text-slate-100 leading-none">
          <span className="font-normal">Images</span>{" "}
          <span className="font-light italic text-slate-400">Gen</span>{" "}
          <span className="font-black bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 bg-clip-text text-transparent">
            Art
          </span>
        </h1>
        <p className="text-slate-400 text-lg">
          Local artwork generation platform — Phase 3 scaffold
        </p>
        <HealthBadge health={health} />
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => onNav("workflow")}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Run a workflow →
          </button>
          <button
            type="button"
            onClick={() => onNav("gallery")}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Open Gallery
          </button>
        </div>
        <p className="text-xs text-slate-500 pt-8">
          Client: <code className="text-slate-400">localhost:5173</code> ·
          Server: <code className="text-slate-400">127.0.0.1:5174</code>
        </p>
      </div>
    </main>
  )
}

function HealthBadge({ health }: { health: ApiState<HealthData> }): ReactElement {
  if (health.loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-300">
        <span className="h-2 w-2 rounded-full bg-slate-500 animate-pulse" />
        Connecting to server…
      </div>
    )
  }

  if (health.error !== null) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Server unreachable — {health.error.message}
      </div>
    )
  }

  const data = health.data
  if (data === null) return <span />

  return (
    <div className="inline-flex items-center gap-3 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      <span>Server ok</span>
      <span className="text-green-500/70">·</span>
      <span className="font-mono text-green-200">v{data.version}</span>
      <span className="text-green-500/70">·</span>
      <span className="text-green-200/70">uptime {formatUptime(data.uptimeMs)}</span>
    </div>
  )
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
