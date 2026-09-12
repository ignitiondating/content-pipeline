import { useRef, useState } from 'react'
import defaultStory from '../../assets/story-default.png'
import { api, type AssetItem } from '../../lib/api'

export default function StoryPicker({ path, assets, onChange, onAssets, onPreview }: {
  path?: string
  assets: AssetItem[]
  onChange: (path?: string) => void
  onAssets: (assets: AssetItem[]) => void
  onPreview: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const photos = assets.filter((a) => !a.missing && ['background', 'shot'].includes(a.kind))
  const choose = (next?: string) => { onChange(next); onPreview(); setOpen(false); setError('') }
  const upload = async (file?: File) => {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      const { asset } = await api.uploadAsset(file, 'background')
      const { assets: updated } = await api.assets()
      onAssets(updated.filter((a) => !a.missing))
      choose(asset.path)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section aria-label="Story being replied to" className="mb-4 rounded-xl border border-neutral-700 bg-neutral-900/30 p-3">
    <div className="flex items-center gap-3">
      <button onClick={onPreview} title="Preview the story reply" className="shrink-0 overflow-hidden rounded-lg border border-neutral-700"><img src={path ? `/files/${path}` : defaultStory} alt="Story they’re reacting to" className="h-20 w-14 object-cover" /></button>
      <div className="min-w-0"><p className="text-sm font-medium">Story they’re replying to</p><p className="mt-1 truncate text-xs text-neutral-500">{path ? path.split('/').pop() : 'Starter photo · AI-generated'}</p><button data-replace-story disabled={busy} onClick={() => { setOpen(!open); onPreview() }} className="mt-2 text-sm font-medium text-wing-400">{open ? 'Close story picker' : 'Replace story'}</button></div>
    </div>
    {open && <div className="mt-3">
      <button disabled={busy} onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files[0]) }} className="w-full rounded-lg border border-dashed border-neutral-600 p-3 text-sm text-wing-400 disabled:opacity-50">{busy ? 'Uploading story…' : 'Upload a story image or drop it here'}<span className="mt-1 block text-xs text-neutral-500">JPG, PNG, WebP · saved for future videos</span></button>
      <p className="mb-2 mt-3 text-xs text-neutral-400">Or use an image from your library</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button disabled={busy} onClick={() => choose()} className="w-16 shrink-0 text-left text-xs"><img src={defaultStory} alt="Starter story photo" className="mb-1 h-24 w-16 rounded-lg object-cover" />Starter photo</button>
        {photos.map((photo) => <button disabled={busy} key={photo.id} onClick={() => choose(photo.path)} title={photo.path.split('/').pop()} className="w-16 shrink-0 text-left text-xs"><img src={`/files/${photo.path}`} alt={photo.path.split('/').pop()} className="mb-1 h-24 w-16 rounded-lg object-cover" /><span className="block truncate">{photo.path.split('/').pop()}</span></button>)}
      </div>
    </div>}
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
  </section>
}
