import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import DraftPreview from '../components/studio/DraftPreview'
import Toast, { useToast } from '../components/studio/Toast'
import { api, type ExportItem } from '../lib/api'

type Tab = 'all' | 'editing' | 'ready' | 'posted'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'editing', label: 'Editing' },
  { key: 'ready', label: 'Ready' },
  { key: 'posted', label: 'Posted' },
]

function tabFor(status: string): Tab {
  if (status === 'posted') return 'posted'
  if (status === 'exported') return 'ready'
  return 'editing'
}

function fileUrl(item: ExportItem, file: string): string {
  return `/files/out/exports/${item.draftId}/${file}`
}

export default function Projects() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [exports, setExports] = useState<ExportItem[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  const load = useCallback(() => {
    Promise.all([api.drafts(), api.exports()])
      .then(([d, e]) => {
        setDrafts(d.drafts)
        setExports(e.exports)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(load, [load])

  const exportByDraft = useMemo(() => {
    const map = new Map<string, ExportItem>()
    for (const item of exports) map.set(item.draftId, item)
    return map
  }, [exports])

  const filtered = drafts
    .filter((d) => (tab === 'all' ? true : tabFor(d.status) === tab))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const copyCaption = async (draftId: string) => {
    const item = exportByDraft.get(draftId)
    if (!item) return
    const text = await fetch(fileUrl(item, 'caption.txt')).then((r) => r.text())
    await navigator.clipboard.writeText(text)
    showToast('Caption copied')
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1.5 text-sm text-neutral-500">Open a project to edit, or start a new one.</p>
        </div>
        <Link
          to="/new"
          className="rounded-lg bg-wing-500 px-4 py-2.5 text-sm font-medium hover:bg-wing-400"
        >
          + New
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === t.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800 text-neutral-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-800 px-8 py-16 text-center">
          <p className="mb-4 text-neutral-500">
            {tab === 'all' ? 'No projects yet.' : `Nothing in “${tab}”.`}
          </p>
          <Link
            to="/new"
            className="inline-block rounded-lg bg-wing-500 px-4 py-2 text-sm font-medium hover:bg-wing-400"
          >
            Create your first project
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((draft) => {
          const item = exportByDraft.get(draft.id)
          const media = item?.files.filter((f) => f !== 'caption.txt') ?? []
          const video = media.find((f) => f.endsWith('.mp4'))
          const structure =
            draft.format === 'clip'
              ? ` · ${(draft.spec as ClipSpec).structure ?? 'overlay'}`
              : ''

          return (
            <div
              key={draft.id}
              className="group flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5 transition hover:border-neutral-600"
            >
              <Link to={`/edit/${draft.id}`} className="mb-3 flex justify-center">
                {video ? (
                  <video
                    src={fileUrl(item!, video)}
                    muted
                    playsInline
                    className="max-h-72 rounded-xl bg-black"
                  />
                ) : (
                  <DraftPreview draft={draft} height={280} />
                )}
              </Link>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span>
                  {draft.format}
                  {structure}
                </span>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 capitalize">{draft.status}</span>
              </div>
              <Link
                to={`/edit/${draft.id}`}
                className="mb-1 line-clamp-2 text-sm font-medium text-white group-hover:text-wing-300"
              >
                {draft.meta.caption}
              </Link>
              <div className="mb-3 line-clamp-1 text-xs text-neutral-500">
                {draft.meta.hashtags.join(' ')}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 text-sm">
                <Link
                  to={`/edit/${draft.id}`}
                  className="rounded-lg bg-wing-500 px-3 py-1.5 font-medium hover:bg-wing-400"
                >
                  Open
                </Link>
                {item && (
                  <>
                    <button
                      onClick={() => copyCaption(draft.id)}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500"
                    >
                      Copy caption
                    </button>
                    {draft.status !== 'posted' && (
                      <button
                        onClick={() => api.markPosted(draft.id).then(load)}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500"
                      >
                        Mark posted
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Toast message={toast} />
    </div>
  )
}
