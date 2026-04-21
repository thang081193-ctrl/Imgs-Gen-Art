// Phase 1 landing. Fetches /api/health on mount, renders status badge +
// version echo. No workflow UI yet — Phase 5 CMS + gallery will own this
// page later; this is scaffolding to prove the proxy + CSS + hooks work.

import type { ReactElement } from "react"
import { useApiHealth, type ApiState, type HealthData } from "@/client/api/hooks"

export function Home(): ReactElement {
  const health = useApiHealth()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-5xl font-bold tracking-tight text-slate-100">
          Images Gen Art
        </h1>
        <p className="text-slate-400 text-lg">
          Local artwork generation platform — Phase 1 scaffold
        </p>
        <HealthBadge health={health} />
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
