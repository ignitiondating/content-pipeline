import { useCallback, useEffect, useState } from 'react'
import { api, type ExportItem } from '../lib/api'

function fileUrl(item: ExportItem, file: string): string {
  return `/files/out/exports/${item.draftId}/${file}`
}

export default function Library() {
  const [items, setItems] = useState<ExportItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(() => {
    api.exports().then((r) => setItems(r.exports)).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
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
          const thumb = media.find((f) => f.endsWith('.png'))
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
                thumb && <img src={fileUrl(item, thumb)} alt="" className="mb-3 max-h-72 rounded-xl" />
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
                  onClick={async () => {
                    const text = await fetch(fileUrl(item, 'caption.txt')).then((r) => r.text())
                    await copy(item.id, text)
                  }}
                  className="rounded-lg border border-neutral-700 px-2 py-1 hover:border-neutral-500"
                >
                  {copied === item.id ? 'Copied ✓' : 'Copy caption.txt'}
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
    </div>
  )
}
