import { useEffect, useState } from 'react'
import { api, type AssetItem } from '../lib/api'

export default function Assets() {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.assets().then((r) => setAssets(r.assets)).catch(() => {})
  useEffect(() => {
    load()
  }, [])

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
      <button
        onClick={rescan}
        disabled={busy}
        className="mb-4 rounded-lg bg-wing-500 px-4 py-2 hover:bg-wing-400 disabled:opacity-50"
      >
        {busy ? 'Scanning…' : 'Rescan library'}
      </button>
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
