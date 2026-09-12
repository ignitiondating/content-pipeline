import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import BatchReview from '../components/studio/BatchReview'
import { api } from '../lib/api'

const FILTERS = [['all', 'All content'], ['draft', 'To review'], ['approved', 'Approved'], ['rendered', 'Rendered'], ['exported', 'Downloaded / exported'], ['posted', 'Posted'], ['rejected', 'Rejected']]
export default function Drafts() {
  const { batchId } = useParams()
  const [params, setParams] = useSearchParams()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const status = params.get('status') ?? 'all'
  const load = useCallback(() => {
    setLoading(true)
    api.drafts({ ...(batchId ? { batchId } : {}), ...(status === 'all' ? {} : { status }) })
      .then((r) => { setDrafts(r.drafts); setError('') }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [batchId, status])
  useEffect(load, [load])
  return <div className="mx-auto max-w-6xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-wing-400">WingAI content studio</p><h1 className="text-3xl font-semibold">{batchId ? 'Review your batch' : 'Your content'}</h1><p className="mt-2 text-sm text-neutral-400">Polish each hook and script. Select your favorites and render them together.</p></div><Link to="/" className="rounded-lg bg-wing-500 px-4 py-2 text-sm font-medium text-neutral-950">+ Create a batch</Link></div>
    <div className="mb-5 flex flex-wrap gap-2">{FILTERS.map(([value, label]) => <button key={value} onClick={() => setParams(value === 'all' ? {} : { status: value })} className={`rounded-lg border px-3 py-2 text-sm ${status === value ? 'border-neutral-500 bg-neutral-800 text-white' : 'border-neutral-800 text-neutral-400'}`}>{label}</button>)}</div>
    {batchId && <Link to="/drafts" className="mb-4 inline-block text-sm text-wing-400">← All content</Link>}
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
    {loading ? <p className="text-sm text-neutral-500">Loading your content…</p> : drafts.length ? <BatchReview drafts={drafts} onRefresh={load} /> : <div className="rounded-2xl border border-dashed border-neutral-700 p-10 text-center"><h2 className="font-medium">{status === 'all' ? 'Your next batch starts with a format' : 'No content in this view yet'}</h2><p className="mt-2 text-sm text-neutral-500">Create a video, make it yours, then spin out a few versions.</p><Link to="/" className="mt-4 inline-block text-sm text-wing-400 underline">Browse WingAI formats →</Link></div>}
  </div>
}
