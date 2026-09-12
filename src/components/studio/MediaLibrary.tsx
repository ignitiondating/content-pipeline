import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AssetItem } from '../../lib/api'

export default function MediaLibrary({ tag, onPick, onAssets, onUploadComplete, compact = false }: {
  compact?: boolean;
  onUploadComplete?: (assets: AssetItem[]) => void;
  tag: 'basketball' | '3d'; onPick: (asset: AssetItem) => void; onAssets?: (assets: AssetItem[]) => void
}) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const uploadRef = useRef(onUploadComplete)
  uploadRef.current = onUploadComplete
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const load = async () => {
    const { assets } = await api.assets()
    const live = assets.filter((a) => !a.missing)
    setAssets(live)
    onAssets?.(live)
  }
  useEffect(() => { load().catch((e: Error) => setError(e.message)) }, [])
  const upload = async (files: File[]) => {
    if (busy || !files.length) return
    setBusy(true)
    setError('')
    const uploaded: AssetItem[] = []
    setNotice('')
    const failures: string[] = []
    for (const file of files) {
      try { uploaded.push((await api.uploadAsset(file, 'broll', tag)).asset) }
      catch (e) { failures.push(`${file.name}: ${(e as Error).message}`) }
    }
    try { await load(); if (uploaded.length) { if (uploadRef.current) uploadRef.current(uploaded); else pickRef.current(uploaded[uploaded.length - 1]); setNotice(`${uploaded.length} clip${uploaded.length > 1 ? 's' : ''} added to your library and applied to the available slots.`) } }
    catch (e) { failures.push((e as Error).message) }
    setError(failures.join('\n'))
    setBusy(false)
  }
  const clips = assets.filter((a) => a.kind === 'broll' && `${a.path} ${a.tag}`.toLowerCase().includes(query.toLowerCase()))
  return <section className={`mb-4 rounded-xl border border-neutral-800 ${compact ? 'p-3' : 'p-4'}`}>
    {!compact && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Your B-roll library</h3>
      <Link to="/tools" target="_blank" className="text-xs text-wing-400">Create custom screenshots ↗</Link>
    </div>}
    <button type="button" disabled={busy} onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)) }}
      className="mb-3 w-full rounded-lg border border-dashed border-neutral-600 bg-neutral-900 p-4 text-sm hover:border-wing-400 disabled:opacity-50">
      {busy ? 'Uploading footage…' : 'Drop your B-roll here or browse files'}
      {!compact && <span className="mt-1 block text-xs text-neutral-500">MP4, MOV, WebM · saved to your library and added to this edit</span>}
    </button>
    <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple hidden
      onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
    {notice && <p role="status" className="mb-3 text-xs text-emerald-400">{notice}</p>}
    {error && <p role="alert" className="mb-3 whitespace-pre-line text-xs text-red-400">{error}</p>}
    <input aria-label="Search B-roll" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all footage by name or tag…"
      className="mb-3 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
    <div className="flex max-h-48 gap-2 overflow-auto">
      {clips.map((asset) => <button key={asset.id} draggable title={`Use ${asset.path.split('/').pop()}`}
        onDragStart={(e) => { e.dataTransfer.setData('application/x-studio-asset', asset.path); e.dataTransfer.effectAllowed = 'copy' }}
        onClick={() => onPick(asset)} className="w-24 shrink-0 overflow-hidden rounded-lg border border-neutral-800 text-left hover:border-wing-400">
        <video src={`/files/${asset.path}#t=0.1`} muted playsInline preload="metadata" className="h-20 w-full object-cover" />
        <span className="block truncate px-2 pt-1 text-xs">{asset.path.split('/').pop()}</span>
        <span className="block px-2 pb-1 text-[10px] text-neutral-500">{asset.durationS?.toFixed(1) ?? '?'}s · {asset.tag}</span>
      </button>)}
      {!clips.length && <p className="py-3 text-xs text-neutral-500">{query ? 'No matching footage.' : 'Upload footage to start your reusable library.'}</p>}
    </div>
    <p className="mt-2 text-xs text-neutral-500">Click a clip to use it in the selected slot. Uploaded clips stay in your library for your next video.</p>
  </section>
}
