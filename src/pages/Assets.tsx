import { useEffect, useRef, useState } from 'react'
import { api, type AssetItem } from '../lib/api'

const UPLOAD_KINDS = [
  { key: 'broll', label: 'B-roll video' },
  { key: 'background', label: 'Background photo' },
  { key: 'music', label: 'Music track' },
] as const

export default function Assets() {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadKind, setUploadKind] = useState<(typeof UPLOAD_KINDS)[number]['key']>('broll')
  const [uploadTag, setUploadTag] = useState<'basketball' | '3d'>('basketball')
  const fileInput = useRef<HTMLInputElement>(null)

  const load = () => api.assets().then((r) => setAssets(r.assets)).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  const upload = async (file: File) => {
    setBusy(true)
    setMessage(null)
    try {
      const { asset } = await api.uploadAsset(
        file,
        uploadKind,
        uploadKind === 'broll' ? uploadTag : undefined,
      )
      setMessage(`Uploaded ${asset.path}`)
      load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rescan = async () => {
    setBusy(true)
    try {
      const result = await api.rescanAssets()
      setMessage(`Added ${result.added}, missing ${result.missing}, total ${result.total}`)
      load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Assets</h1>
      <p className="mb-4 text-sm text-neutral-400">
        Drop files into <code>library/broll/basketball/</code>, <code>library/broll/3d/</code>,{' '}
        <code>library/backgrounds/</code>, <code>library/music/</code> and{' '}
        <code>library/promo/</code> (WingAI app screenshots for the clip promo beat), then rescan.
        Clip bursts follow filename order; other kinds rotate least-recently-used.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {UPLOAD_KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setUploadKind(k.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              uploadKind === k.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800'
            }`}
          >
            {k.label}
          </button>
        ))}
        {uploadKind === 'broll' && (
          <select
            value={uploadTag}
            onChange={(e) => setUploadTag(e.target.value as 'basketball' | '3d')}
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
          >
            <option value="basketball">basketball</option>
            <option value="3d">3d</option>
          </select>
        )}
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg bg-wing-500 px-4 py-1.5 text-sm font-medium hover:bg-wing-400 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Upload file'}
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={rescan}
          disabled={busy}
          className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm hover:border-neutral-500 disabled:opacity-50"
        >
          Rescan library
        </button>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Name b-roll files with numbers (nba-01.mp4, nba-02.mp4…) — the order drives the edit:
        lowest opens the clip, highest closes it.
      </p>
      {message && <div className="mb-4 text-sm text-neutral-400">{message}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-neutral-500">
            <th className="py-2"></th>
            <th className="py-2">Path</th>
            <th>Kind</th>
            <th>Tag</th>
            <th>Duration</th>
            <th>Uses</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id} className={`border-b border-neutral-900 ${asset.missing ? 'opacity-40' : ''}`}>
              <td className="py-1 pr-2">
                {(asset.kind === 'background' || asset.kind === 'promo') && !asset.missing && (
                  <img src={`/files/${asset.path}`} alt="" className="h-16 w-10 rounded object-cover" />
                )}
              </td>
              <td className="py-2">{asset.path}{asset.missing && ' (missing)'}</td>
              <td>{asset.kind}</td>
              <td>{asset.tag ?? '—'}</td>
              <td>{asset.durationS ? `${asset.durationS.toFixed(1)}s` : '—'}</td>
              <td>{asset.useCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {assets.length === 0 && <p className="mt-4 text-neutral-500">No assets cataloged yet.</p>}
    </div>
  )
}
