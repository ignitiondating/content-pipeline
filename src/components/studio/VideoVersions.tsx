import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ClipSpec } from '@shared/formats/clip'
import type { Draft } from '@shared/formats/draft'
import { api } from '../../lib/api'

export default function VideoVersions({ spec, meta, onVersions, beforeCreate }: {
  spec: ClipSpec; meta: Draft['meta']; onVersions?: (drafts: Draft[]) => void; beforeCreate?: () => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [count, setCount] = useState(3)
  const [hooksText, setHooksText] = useState('')
  const [shuffleFootage, setShuffleFootage] = useState(true)
  const [varyPacing, setVaryPacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<Draft[]>([])
  const hooks = hooksText.split('\n').map((h) => h.trim()).filter(Boolean)
  const total = hooks.length || count
  const invalidHooks = hooks.length > 10 || hooks.some((hook) => hook.length > 80)
  const run = async (kind: 'template' | 'versions') => {
    setBusy(true); setMessage(''); setError('')
    try {
      if (beforeCreate && !await beforeCreate()) return
      if (kind === 'template') {
        await api.saveTemplate({ name, description: 'Your saved script, footage, and edit structure.', spec, meta })
        setMessage(`“${name}” is now in your formats.`)
      } else {
        const { drafts } = await api.editVariations({ spec, meta, count: total, hooks: hooks.length ? hooks : undefined, shuffleFootage, varyPacing })
        setVersions(drafts)
        setMessage(`${drafts.length} versions saved. Review your hooks and footage, then render the batch.`)
        onVersions?.(drafts)
      }
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="mt-6 rounded-2xl border border-wing-500/25 bg-wing-950/10 p-5">
    <div className="mb-4"><h3 className="font-semibold">Turn this into a batch</h3>
      <p className="mt-1 text-sm text-neutral-400">Keep the script and format. Try your own hooks and different footage.</p></div>
    <fieldset disabled={busy} className="grid min-w-0 gap-5 md:grid-cols-2">
      <label className="text-sm">Hooks to test <span className="text-neutral-500">· optional</span>
        <textarea aria-label="Hooks to test" value={hooksText} onChange={(e) => setHooksText(e.target.value)} rows={3}
          placeholder={'One hook per line, for example:\nShe left him on read. Then he sent this.\nThe comeback she wasn’t expecting.'}
          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm" />
        <span className="text-xs text-neutral-500">{hooks.length ? `${hooks.length} hooks = ${hooks.length} videos` : 'Leave empty to keep the current hook.'} · up to 10, 80 characters each</span>
      </label>
      <div className="space-y-3 text-sm">
        {!hooks.length && <label className="flex items-center justify-between gap-3">Videos to make
          <select aria-label="Number of edit variations" value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2">
            {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} video{n > 1 ? 's' : ''}</option>)}
          </select></label>}
        <label className="flex items-start gap-2"><input type="checkbox" checked={shuffleFootage} onChange={(e) => setShuffleFootage(e.target.checked)} className="mt-1" /><span>Mix up the footage<span className="block text-xs text-neutral-500">Use your selected clips, or the format’s B-roll library.</span></span></label>
        {shuffleFootage && spec.structure === 'cuts' && <label className="flex items-start gap-2"><input type="checkbox" checked={varyPacing} onChange={(e) => setVaryPacing(e.target.checked)} className="mt-1" /><span>Vary B-roll pacing too<span className="block text-xs text-neutral-500">Leave off to keep the format’s timing.</span></span></label>}
        <button disabled={busy || invalidHooks} onClick={() => run('versions')} className="rounded-lg bg-wing-500 px-4 py-2 font-medium text-neutral-950 hover:bg-wing-400 disabled:opacity-50">{busy ? 'Saving…' : `Create ${total} version${total === 1 ? '' : 's'}`}</button>
      </div>
    </fieldset>
    {invalidHooks && <p className="mt-2 text-sm text-red-400">Use up to 10 hooks, with no more than 80 characters per hook.</p>}
    <p aria-live="polite" className="mt-3 text-sm text-emerald-400">{message}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    {!onVersions && versions[0]?.batchId && <Link to={`/batches/${versions[0].batchId}`} className="mt-2 inline-block text-sm text-wing-400 underline">Review all {versions.length} versions →</Link>}
    <details className="mt-4 border-t border-neutral-800 pt-3">
      <summary className="cursor-pointer text-sm text-neutral-400">Save this as a reusable format</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <input aria-label="Template name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name your format" className="min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" />
        <button disabled={busy || !name.trim()} onClick={() => run('template')} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">Save format</button>
      </div>
    </details>
  </section>
}
