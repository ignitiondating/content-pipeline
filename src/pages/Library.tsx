import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Toast, { useToast } from '../components/studio/Toast'
import { api, type ExportItem } from '../lib/api'

function fileUrl(item: ExportItem, file: string): string {
  return `/files/out/exports/${item.draftId}/${file}`
}

export default function Library() {
  const [selected, setSelected] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const [bundleUrl, setBundleUrl] = useState('')
  const [items, setItems] = useState<ExportItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [captions, setCaptions] = useState<Record<string, string>>({})
  const [toast, showToast] = useToast()

  const load = useCallback(() => {
    api
      .exports()
      .then((r) => {
        setItems(r.exports.filter((item, index, all) => all.findIndex((other) => other.draftId === item.draftId) === index))
        // Preloaded so the copy button writes to the clipboard instantly —
        // fetching on click made it feel like nothing happened.
        for (const item of r.exports) {
          fetch(fileUrl(item, 'caption.txt'))
            .then((res) => res.text())
            .then((text) => setCaptions((prev) => ({ ...prev, [item.id]: text })))
            .catch(() => {})
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const copy = async (item: ExportItem) => {
    const text = captions[item.id] ?? (await fetch(fileUrl(item, 'caption.txt')).then((r) => r.text()))
    await navigator.clipboard.writeText(text)
    showToast('Caption copied to clipboard')
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <Link
          to="/queue"
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
        >
          Render queue
        </Link>
      </div>
      <p className="mb-5 text-sm text-neutral-400">Your finished videos and captions. Select a batch to download everything in one ZIP.</p>
      {items.length > 0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.length === Math.min(items.length, 50)} onChange={(e) => setSelected(e.target.checked ? items.slice(0, 50).map((item) => item.draftId) : [])} />Select {items.length > 50 ? 'latest 50' : 'all'} · {selected.length} selected</label><button disabled={downloading || !selected.length} onClick={async () => {
        setDownloading(true); setError(null); setBundleUrl('')
        try { const { url } = await api.downloadBatch(selected); setBundleUrl(url); const link = document.createElement('a'); link.href = url; link.download = 'wingai-content-batch.zip'; link.click() }
        catch (e) { setError((e as Error).message) }
        finally { setDownloading(false) }
      }} className="rounded-lg bg-wing-500 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40">{downloading ? 'Packaging…' : `Download selected${selected.length ? ` (${selected.length})` : ''}`}</button></div>}
      {bundleUrl && <p className="mb-4 text-sm text-emerald-400">Batch ready. <a href={bundleUrl} download className="underline">Download ZIP again</a></p>}
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {items.length === 0 && <p className="text-neutral-500">Nothing exported yet.</p>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const media = item.files.filter((f) => f !== 'caption.txt')
          const video = media.find((f) => f.endsWith('.mp4'))
          return (
            <div key={item.id} className="rounded-2xl border border-neutral-800 p-4">
              <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select download ${item.title ?? item.caption}`} checked={selected.includes(item.draftId)} disabled={!selected.includes(item.draftId) && selected.length >= 50} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, item.draftId] : ids.filter((id) => id !== item.draftId))} />Include in batch</label>
              <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
                <span>{item.format}</span>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5">{item.status}</span>
              </div>
              {video ? (
                <video src={fileUrl(item, video)} controls className="mb-3 max-h-72 w-full rounded-xl bg-black" />
              ) : (
                <div className="mb-3 flex gap-2 overflow-x-auto rounded-xl bg-neutral-900 p-2">
                  {media
                    .filter((f) => f.endsWith('.png'))
                    .map((f) => (
                      <img key={f} src={fileUrl(item, f)} alt="" className="h-64 shrink-0 rounded-lg" />
                    ))}
                </div>
              )}
              <div className="mb-2 text-sm font-medium">{item.title ?? item.caption}</div>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {media.map((file) => (
                  <a
                    key={file}
                    href={fileUrl(item, file)}
                    download
                    className="rounded-lg border border-neutral-700 px-2 py-1 hover:border-neutral-500"
                  >
                    ↓ {file === 'out.mp4' ? 'Video' : file === 'capcut-media.zip' ? 'CapCut media + guide' : file}
                  </a>
                ))}
                <button
                  onClick={() => copy(item)}
                  className="rounded-lg border border-neutral-700 px-2 py-1 hover:border-neutral-500"
                >
                  Copy caption
                </button>
              </div>
              {media.includes('capcut-media.zip') && <p className="mb-3 text-xs text-neutral-500">CapCut bundle includes source media and timing instructions. Assemble it in CapCut; it is not a native project.</p>}
              {item.status !== 'posted' && (
                <button
                  onClick={() => api.markPosted(item.draftId).then(load)}
                  className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                >
                  Mark posted
                </button>
              )}
            </div>
          )
        })}
      </div>
      <Toast message={toast} />
    </div>
  )
}
