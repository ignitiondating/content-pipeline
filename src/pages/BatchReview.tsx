import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import DraftPreview from '../components/studio/DraftPreview'
import { api } from '../lib/api'

export default function BatchReview() {
  const { batchId } = useParams()
  const [searchParams] = useSearchParams()
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{batchId ? 'Batch review' : 'Drafts'}</h1>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {drafts.length === 0 && <p className="text-neutral-500">Nothing here yet.</p>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-neutral-800 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                {draft.format}
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
                className="rounded-lg bg-sky-700 px-3 py-1.5 hover:bg-sky-600 disabled:opacity-50"
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
