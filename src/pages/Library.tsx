import { useCallback, useEffect, useState } from 'react'
import Toast, { useToast } from '../components/studio/Toast'
import { api, type ExportItem } from '../lib/api'

function fileUrl(item: ExportItem, file: string): string {
  return `/files/out/exports/${item.draftId}/${file}`
}

export default function Library() {
  const [items, setItems] = useState<ExportItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [captions, setCaptions] = useState<Record<string, string>>({})
  const [toast, showToast] = useToast()

  const load = useCallback(() => {
    api
      .exports()
      .then((r) => {
        setItems(r.exports)
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
      <h1 className="mb-2 text-2xl font-bold">Library</h1>
      <p className="mb-6 text-sm text-amber-400">
        Manual upload — no auto-posting in v1. Download, then copy the caption fields into TikTok / IG.
      </p>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {items.length === 0 && <p className="text-neutral-500">Nothing exported yet.</p>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const media = item.files.filter((f) => f !== 'caption.txt')
          const video = media.find((f) => f.endsWith('.mp4'))
          return (
            <div key={item.id} className="rounded-2xl border border-neutral-800 p-4">
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
              <div className="mb-2 text-sm font-medium">{item.caption}</div>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {media.map((file) => (
                  <a
                    key={file}
                    href={fileUrl(item, file)}
                    download
                    className="rounded-lg border border-neutral-700 px-2 py-1 hover:border-neutral-500"
                  >
                    ↓ {file}
                  </a>
                ))}
                <button
                  onClick={() => copy(item)}
                  className="rounded-lg border border-neutral-700 px-2 py-1 hover:border-neutral-500"
                >
                  Copy caption
                </button>
              </div>
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
