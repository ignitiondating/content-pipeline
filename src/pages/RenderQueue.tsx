import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Job } from '../lib/api'

function outputUrl(job: Job, file: string): string {
  return `/files/out/render/${job.id}/${file}`
}

function JobPreview({ job }: { job: Job }) {
  const video = job.outputs.find((f) => f.endsWith('.mp4'))
  const images = job.outputs.filter((f) => f.endsWith('.png'))
  if (video) {
    return <video src={outputUrl(job, video)} controls className="max-h-80 rounded-xl bg-black" />
  }
  if (images.length > 0) {
    return (
      <div className="flex gap-2 overflow-x-auto rounded-xl bg-neutral-900 p-2">
        {images.map((file) => (
          <img key={file} src={outputUrl(job, file)} alt="" className="h-64 shrink-0 rounded-lg" />
        ))}
      </div>
    )
  }
  return <p className="text-sm text-neutral-500">Output files were already swept — find this piece in the Library.</p>
}

export default function RenderQueue() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  // One card per draft: the latest job wins, older renders are history.
  const grouped = useMemo(() => {
    const byDraft = new Map<string, { latest: Job; count: number }>()
    for (const job of jobs) {
      const entry = byDraft.get(job.draft_id)
      if (!entry) byDraft.set(job.draft_id, { latest: job, count: 1 })
      else {
        entry.count++
        if (job.created_at > entry.latest.created_at) entry.latest = job
      }
    }
    return [...byDraft.values()].sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1))
  }, [jobs])

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">Render queue</h1>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {grouped.length === 0 && (
        <p className="text-neutral-500">No render jobs yet — send an approved draft here from Review.</p>
      )}
      <div className="flex flex-col gap-4">
        {grouped.map(({ latest: job, count }) => {
          const exported = job.draftStatus === 'exported' || job.draftStatus === 'posted'
          return (
            <div key={job.draft_id} className="rounded-2xl border border-neutral-800 p-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400">
                  {job.format}
                  {count > 1 && ` · render ${count}`}
                </span>
                <span
                  className={`text-xs font-medium ${
                    exported
                      ? 'text-neutral-400'
                      : job.status === 'done'
                        ? 'text-emerald-400'
                        : job.status === 'error'
                          ? 'text-red-400'
                          : 'text-wing-400'
                  }`}
                >
                  {exported ? 'exported ✓' : job.status}
                </span>
              </div>
              <div className="mb-3 text-sm font-medium">{job.caption}</div>

              {(job.status === 'queued' || job.status === 'running') && (
                <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-full bg-wing-500" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                </div>
              )}

              {job.status === 'error' && (
                <>
                  <div className="mb-3 break-all rounded-lg bg-red-950 p-2 text-xs text-red-300">{job.message}</div>
                  <button
                    disabled={busyId === job.draft_id}
                    onClick={() => act(job.draft_id, () => api.render(job.draft_id))}
                    className="rounded-lg bg-wing-600 px-3 py-1.5 text-sm hover:bg-wing-500 disabled:opacity-50"
                  >
                    Retry render
                  </button>
                </>
              )}

              {job.status === 'done' && (
                <>
                  <div className="mb-3">
                    <JobPreview job={job} />
                  </div>
                  {exported ? (
                    <Link
                      to="/library"
                      className="inline-block rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
                    >
                      View in Library →
                    </Link>
                  ) : (
                    <button
                      disabled={busyId === job.draft_id}
                      onClick={() => act(job.draft_id, () => api.exportJob(job.id))}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Export to library
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
