import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import DraftPreview from '../components/studio/DraftPreview'
import { api } from '../lib/api'

const STATUS_TABS = ['all', 'draft', 'approved', 'rejected', 'rendered', 'exported', 'posted'] as const

export default function BatchReview() {
  const { batchId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const query: Record<string, string> = {}
    if (batchId) query.batchId = batchId
    const status = searchParams.get('status')
    if (status) query.status = status
    api
      .drafts(query)
      .then((r) => setDrafts(r.drafts))
      .catch((e: Error) => setError(e.message))
  }, [batchId, searchParams])

  useEffect(load, [load])

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const activeStatus = searchParams.get('status') ?? 'all'

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{batchId ? 'Batch review' : 'Drafts'}</h1>
      {!batchId && (
        <div className="mb-6 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSearchParams(tab === 'all' ? {} : { status: tab })}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                activeStatus === tab ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800 text-neutral-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {drafts.length === 0 && (
        <p className="text-neutral-500">
          {activeStatus === 'all'
            ? 'Nothing here yet — generate a batch to get started.'
            : `No drafts with status "${activeStatus}". Switch tabs to see the rest.`}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-neutral-800 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                {draft.format}
                {draft.format === 'clip' &&
                  ` · ${(draft.spec as ClipSpec).structure ?? 'overlay'} · ${(draft.spec as ClipSpec).brollTag}`}
                {draft.partRole && ` · part ${(draft.partIndex ?? 0) + 1} (${draft.partRole})`}
              </span>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5">{draft.status}</span>
            </div>
            <div className="mb-3 flex justify-center">
              <DraftPreview draft={draft} height={320} />
            </div>
            <div className="mb-1 text-sm font-medium">{draft.meta.caption}</div>
            <div className="mb-3 text-xs text-neutral-500">
              {draft.meta.hashtags.join(' ')}
              {draft.meta.gateKeyword && ` · gate: "${draft.meta.gateKeyword}"`}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                disabled={busyId === draft.id}
                onClick={() => act(draft.id, () => api.patchDraft(draft.id, { status: 'approved' }))}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 hover:bg-emerald-600 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={busyId === draft.id}
                onClick={() => act(draft.id, () => api.patchDraft(draft.id, { status: 'rejected' }))}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500 disabled:opacity-50"
              >
                Reject
              </button>
              <Link
                to={`/drafts/${draft.id}`}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500"
              >
                Edit
              </Link>
              <button
                disabled={busyId === draft.id}
                onClick={() => act(draft.id, () => api.regenerate(draft.id))}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500 disabled:opacity-50"
              >
                {busyId === draft.id ? 'Working…' : 'Regenerate'}
              </button>
              <button
                disabled={busyId === draft.id}
                onClick={() => act(draft.id, () => api.render(draft.id))}
                className="rounded-lg bg-wing-600 px-3 py-1.5 hover:bg-wing-500 disabled:opacity-50"
              >
                Render
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
