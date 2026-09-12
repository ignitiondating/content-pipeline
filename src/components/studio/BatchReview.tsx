import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import DraftPreview from './DraftPreview'
import { api } from '../../lib/api'

export default function BatchReview({ drafts, onEdit, onRefresh }: {
  drafts: Draft[]; onEdit?: (draft: Draft) => void; onRefresh?: () => void
}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const eligible = drafts.filter((d) => ['draft', 'approved'].includes(d.status))
  const eligibleKey = eligible.map((d) => d.id).join(',')
  useEffect(() => { setSelected((ids) => ids.filter((id) => eligibleKey.split(',').includes(id))) }, [eligibleKey])
  const renderBatch = async () => {
    setBusy(true); setError(''); setMessage('')
    const queued: string[] = []
    const failed: string[] = []
    for (const id of selected) {
      try {
        await api.patchDraft(id, { status: 'approved' })
        await api.render(id)
        queued.push(id)
        setMessage(`${queued.length} of ${selected.length} videos queued…`)
      } catch (e) { failed.push(`Version ${drafts.findIndex((d) => d.id === id) + 1}: ${(e as Error).message}`) }
    }
    setSelected((ids) => ids.filter((id) => !queued.includes(id)))
    setBusy(false)
    if (failed.length) { setError(failed.join('\n')); setMessage(`${queued.length} queued. Only unsuccessful versions remain selected.`) }
    else navigate('/queue')
  }
  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-900/50 p-3">
      <div><p className="text-sm font-medium">{selected.length ? `${selected.length} selected` : `${drafts.length} version${drafts.length === 1 ? '' : 's'}`}</p><p className="mt-1 text-xs text-neutral-500">Select the versions you’ve reviewed and want to render.</p></div>
      <div className="flex items-center gap-2"><button disabled={busy || !eligible.length} onClick={() => setSelected(selected.length === eligible.length ? [] : eligible.map((d) => d.id))} className="rounded-lg px-3 py-2 text-sm text-neutral-300 disabled:opacity-30">{selected.length === eligible.length && eligible.length ? 'Clear selection' : 'Select all'}</button>
        <button disabled={busy || !selected.length} onClick={renderBatch} className="rounded-lg bg-wing-500 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40">{busy ? 'Queuing…' : `Render selected${selected.length ? ` (${selected.length})` : ''} →`}</button></div>
    </div>
    {error && <p role="alert" className="mb-3 whitespace-pre-line rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mb-3 text-sm text-neutral-400">{message} <Link to="/queue" className="text-wing-400 underline">View render queue</Link></p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {drafts.map((draft, i) => <article key={draft.id} className={`rounded-2xl border p-4 ${selected.includes(draft.id) ? 'border-wing-500 bg-wing-950/10' : 'border-neutral-800 bg-neutral-900/20'}`}>
        <div className="mb-3 flex items-center justify-between text-xs"><label className="flex items-center gap-2"><input type="checkbox" aria-label={`Select version ${i + 1}`} checked={selected.includes(draft.id)} disabled={busy || !eligible.some((d) => d.id === draft.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, draft.id] : ids.filter((id) => id !== draft.id))} />Version {i + 1}</label><span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">{draft.status === 'draft' ? 'To review' : draft.status}</span></div>
        <div className="mb-4 flex justify-center overflow-hidden rounded-xl bg-neutral-900 py-3"><DraftPreview draft={draft} height={180} /></div>
        <h3 className="mb-2 text-sm font-semibold leading-relaxed">{draft.format === 'clip' ? (draft.spec as ClipSpec).hook : draft.meta.caption}</h3>
        <p className="mb-4 text-xs text-neutral-500">{draft.format === 'clip' ? `${(draft.spec as ClipSpec).chat.messages.length} messages · ${(draft.spec as ClipSpec).structure === 'cuts' ? 'Chat + cutaways' : 'Floating conversation'}` : draft.format}</p>
        <button disabled={busy} onClick={() => onEdit ? onEdit(draft) : navigate(`/drafts/${draft.id}`)} className="w-full rounded-lg border border-neutral-600 px-3 py-2 text-sm hover:border-wing-400 disabled:opacity-40">Customize version →</button>
        {onRefresh && <details className="mt-3 text-xs text-neutral-500"><summary className="cursor-pointer">More options</summary><div className="mt-2 flex gap-3">{['approved', 'rejected', 'draft'].filter((status) => status !== draft.status).map((status) => <button key={status} disabled={busy} onClick={async () => { setBusy(true); try { await api.patchDraft(draft.id, { status }); onRefresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }} className="text-neutral-300 underline">{status === 'draft' ? 'Return to drafts' : status === 'approved' ? 'Approve' : 'Reject'}</button>)}</div></details>}
      </article>)}
    </div>
  </section>
}
