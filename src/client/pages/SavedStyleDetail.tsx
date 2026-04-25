// S#38 Q-38.E — read-only saved-style detail page. Stub for the D1+
// wizard launch flow: shows the preview, name, description, prompt
// template, lanes, usage count, and surfaces a disabled "Use in
// wizard" button until D1 ships. Edit/delete buttons render only
// when `kind === 'user'` (presets are read-only — server returns
// 403 PRESET_LOCKED on mutation, the buttons are hidden in advance
// to match).

import type { ReactElement } from "react"
import { useSavedStyle } from "@/client/api/hooks"
import type { Navigator } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"

export interface SavedStyleDetailProps {
  navigator: Navigator
  showToast: ShowToast
}

export function SavedStyleDetail({ navigator, showToast }: SavedStyleDetailProps): ReactElement {
  const id = navigator.params.savedStyleId ?? null
  const q = useSavedStyle(id)

  if (id === null) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-slate-400">Thiếu savedStyleId — quay lại Home.</p>
      </main>
    )
  }

  if (q.loading) {
    return <main className="mx-auto max-w-3xl p-8 text-slate-400">Đang tải…</main>
  }
  if (q.error !== null) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-red-400">Lỗi: {q.error.message}</p>
        <button
          type="button"
          onClick={() => navigator.go("home")}
          className="mt-4 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
        >
          ← Home
        </button>
      </main>
    )
  }
  const style = q.data
  if (!style) return <main className="p-8 text-slate-400">Not found.</main>

  const isUser = style.kind === "user"

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <button
        type="button"
        onClick={() => navigator.go("home")}
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Home
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide border-slate-700 bg-slate-800 text-slate-300">
            {isUser ? "User style" : "Preset"}
          </span>
          {style.usageCount > 0 ? (
            <span className="text-xs text-slate-500">used {style.usageCount}×</span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold text-slate-100">{style.name}</h1>
        {style.description ? (
          <p className="text-slate-400">{style.description}</p>
        ) : null}
      </header>

      {style.previewAssetUrl ? (
        <img
          src={style.previewAssetUrl}
          alt={style.name}
          className="rounded-lg border border-slate-800 max-h-96 object-contain bg-slate-950"
        />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Prompt template
        </h2>
        <pre className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 whitespace-pre-wrap">
{style.promptTemplate}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Lanes</h2>
        <div className="flex flex-wrap gap-2">
          {style.lanes.length === 0 ? (
            <span className="text-xs text-slate-500">— no lane tags —</span>
          ) : (
            style.lanes.map((lane) => (
              <span
                key={lane}
                className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300"
              >
                {lane}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="flex items-center gap-2 pt-2">
        <button
          type="button"
          disabled
          title="Wizard sẽ ship ở D1+"
          className="rounded-md bg-indigo-600/40 px-4 py-2 text-sm font-medium text-indigo-200 cursor-not-allowed"
        >
          Use in wizard (D1+)
        </button>
        {isUser ? (
          <>
            <button
              type="button"
              onClick={() =>
                showToast({ variant: "info", message: "Edit ship ở D1+ bro." })
              }
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() =>
                showToast({ variant: "info", message: "Delete ship ở D1+ bro." })
              }
              className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:border-red-700"
            >
              Delete
            </button>
          </>
        ) : null}
      </section>

      <footer className="text-xs text-slate-600 pt-6">
        id: <code>{style.id}</code> · slug: <code>{style.slug}</code> · created{" "}
        {style.createdAt}
      </footer>
    </main>
  )
}
