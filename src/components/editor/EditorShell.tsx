import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function EditorShell({
  title,
  saveLabel,
  onExport,
  exportBusy,
  exportLabel,
  children,
}: {
  title: string
  saveLabel?: string | null
  onExport: () => void
  exportBusy: boolean
  exportLabel?: string
  children: {
    preview: ReactNode
    timeline: ReactNode
    dock: ReactNode
  }
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 p-6 text-white sm:p-8 lg:p-10">
      <header className="mb-6 flex shrink-0 items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-5 py-3.5 sm:px-6">
        <Link
          to="/"
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          ← Projects
        </Link>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-neutral-200">
          {title}
        </div>
        {saveLabel && (
          <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">{saveLabel}</span>
        )}
        <button
          onClick={onExport}
          disabled={exportBusy}
          className="shrink-0 rounded-lg bg-wing-500 px-4 py-2 text-sm font-semibold hover:bg-wing-400 disabled:opacity-50"
        >
          {exportBusy ? 'Exporting…' : (exportLabel ?? 'Export')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-6 md:flex-row md:items-stretch">
          {/* Tall 9:16 stage — height drives width, so the video fills the column. */}
          <div className="flex h-[min(58vh,720px)] w-full max-w-[420px] shrink-0 justify-center md:h-full md:w-auto md:max-w-none">
            <div className="relative h-full overflow-hidden rounded-2xl border border-neutral-800 bg-black p-3 shadow-2xl [aspect-ratio:9/16]">
              {children.preview}
            </div>
          </div>
          <div className="flex min-h-[260px] min-w-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            {children.dock}
          </div>
        </div>
        <div className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900">
          {children.timeline}
        </div>
      </div>
    </div>
  )
}
