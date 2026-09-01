import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

type Health = Awaited<ReturnType<typeof api.health>>

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch((e: Error) => setError(e.message))
  }, [])

  const warnings: string[] = []
  if (health && !health.ffmpeg.ok)
    warnings.push(`FFmpeg not ready (${health.ffmpeg.error ?? 'missing filters'}) — run npm run setup`)
  if (health && !health.chromium) warnings.push('Chromium not installed — run npm run setup')
  if (health && !health.apiKeySet) warnings.push('ANTHROPIC_API_KEY missing — copy .env.example to .env')

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">API offline: {error}</div>}
      {warnings.map((warning) => (
        <div key={warning} className="mb-2 rounded-lg bg-amber-950 p-3 text-sm text-amber-300">
          {warning}
        </div>
      ))}
      {health && (
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {['draft', 'approved', 'rendered', 'exported', 'posted', 'rejected'].map((status) => (
            <Link
              key={status}
              to={`/drafts?status=${status}`}
              className="rounded-xl border border-neutral-800 p-4 hover:border-neutral-600"
            >
              <div className="text-2xl font-bold">{health.counts[status] ?? 0}</div>
              <div className="text-xs text-neutral-400">{status}</div>
            </Link>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <Link to="/generate" className="rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500">
          Generate content
        </Link>
        <Link to="/library" className="rounded-lg border border-neutral-700 px-4 py-2 hover:border-neutral-500">
          Open library
        </Link>
      </div>
      <p className="mt-8 text-sm text-neutral-500">
        Everything renders locally. Exports land in <code>out/exports/</code> with a caption.txt
        sidecar — upload manually to TikTok / IG (no auto-posting in v1).
      </p>
    </div>
  )
}
