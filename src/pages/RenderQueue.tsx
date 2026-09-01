import { useEffect, useState } from 'react'
import { api, type Job } from '../lib/api'

export default function RenderQueue() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)
  const [exportedIds, setExportedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    const tick = () =>
      api
        .jobs()
        .then((r) => alive && setJobs(r.jobs))
        .catch((e: Error) => alive && setError(e.message))
    tick()
    const interval = setInterval(tick, 1500)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [])

  const doExport = async (jobId: string) => {
    try {
      await api.exportJob(jobId)
      setExportedIds((prev) => new Set(prev).add(jobId))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">Render queue</h1>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {jobs.length === 0 && <p className="text-neutral-500">No render jobs yet.</p>}
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-neutral-800 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>
                {job.kind} · <span className="text-neutral-500">{job.draft_id.slice(0, 12)}</span>
              </span>
              <span
                className={
                  job.status === 'done'
                    ? 'text-emerald-400'
                    : job.status === 'error'
                      ? 'text-red-400'
                      : 'text-sky-400'
                }
              >
                {job.status}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={`h-full ${job.status === 'error' ? 'bg-red-500' : 'bg-sky-500'}`}
                style={{ width: `${Math.round(job.progress * 100)}%` }}
              />
            </div>
            {job.message && job.status !== 'done' && (
              <div className="mt-2 break-all text-xs text-neutral-500">{job.message}</div>
            )}
            {job.status === 'done' && (
              <button
                onClick={() => doExport(job.id)}
                disabled={exportedIds.has(job.id)}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
              >
                {exportedIds.has(job.id) ? 'Exported ✓' : 'Export to library'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
