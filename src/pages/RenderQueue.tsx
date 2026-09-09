import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, type Job } from '../lib/api'

function outputUrl(job: Job, file: string): string {
  return `/files/out/render/${job.id}/${file}`
}

function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function Media({ job, height, compact = false }: { job: Job; height: number; compact?: boolean }) {
  const video = job.outputs.find((f) => f.endsWith('.mp4'))
  const images = job.outputs.filter((f) => f.endsWith('.png'))
  if (video) {
    return (
      <video
        src={outputUrl(job, video)}
        controls={!compact}
        muted={compact}
        preload="metadata"
        className="shrink-0 rounded-lg bg-black"
        style={{ height, width: Math.round(height * 0.5625), pointerEvents: compact ? 'none' : undefined }}
      />
    )
  }
  if (images.length > 0) {
    const shown = compact ? images.slice(0, 1) : images
    return (
      <div className="flex shrink-0 gap-1.5 overflow-x-auto" style={{ maxWidth: 360 }}>
        {shown.map((file) => (
          <img
            key={file}
            src={outputUrl(job, file)}
            alt=""
            className="shrink-0 rounded-lg"
            style={{ height }}
          />
        ))}
      </div>
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs text-neutral-600"
      style={{ height, width: Math.round(height * 0.5625) }}
    >
      swept
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title} <span className="ml-1 text-neutral-600">{count}</span>
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

const metaLine = (job: Job, count: number) =>
  [job.format, count > 1 ? `render ${count}` : null, timeAgo(job.finished_at ?? job.created_at)]
    .filter(Boolean)
    .join(' · ')

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

  const groups = useMemo(() => {
    const byDraft = new Map<string, { latest: Job; count: number }>()
    for (const job of jobs) {
      const entry = byDraft.get(job.draft_id)
      if (!entry) byDraft.set(job.draft_id, { latest: job, count: 1 })
      else {
        entry.count++
        if (job.created_at > entry.latest.created_at) entry.latest = job
      }
    }
    const all = [...byDraft.values()].sort((a, b) =>
      a.latest.created_at < b.latest.created_at ? 1 : -1,
    )
    const exported = (j: Job) => j.draftStatus === 'exported' || j.draftStatus === 'posted'
    return {
      active: all.filter(({ latest }) => latest.status === 'queued' || latest.status === 'running'),
      failed: all.filter(({ latest }) => latest.status === 'error'),
      ready: all.filter(({ latest }) => latest.status === 'done' && !exported(latest)),
      exported: all.filter(({ latest }) => latest.status === 'done' && exported(latest)),
    }
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

  const total =
    groups.active.length + groups.failed.length + groups.ready.length + groups.exported.length

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Render queue</h1>
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      {total === 0 && (
        <p className="text-neutral-500">No render jobs yet — send an approved draft here from Review.</p>
      )}

      <Section title="Rendering" count={groups.active.length}>
        {groups.active.map(({ latest: job, count }) => (
          <div key={job.draft_id} className="rounded-xl border border-neutral-800 p-4">
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="truncate text-sm font-medium">{job.caption}</span>
              <span className="shrink-0 text-xs text-neutral-500">{metaLine(job, count)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-wing-500 transition-[width] duration-500"
                style={{ width: `${Math.max(4, Math.round(job.progress * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Failed" count={groups.failed.length}>
        {groups.failed.map(({ latest: job, count }) => (
          <div key={job.draft_id} className="rounded-xl border border-red-950 p-4">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <span className="truncate text-sm font-medium">{job.caption}</span>
              <span className="shrink-0 text-xs text-neutral-500">{metaLine(job, count)}</span>
            </div>
            <p className="mb-3 break-all text-xs text-red-400">{job.message}</p>
            <button
              disabled={busyId === job.draft_id}
              onClick={() => act(job.draft_id, () => api.render(job.draft_id))}
              className="rounded-lg bg-wing-600 px-3 py-1.5 text-sm hover:bg-wing-500 disabled:opacity-50"
            >
              Retry render
            </button>
          </div>
        ))}
      </Section>

      <Section title="Ready to export" count={groups.ready.length}>
        {groups.ready.map(({ latest: job, count }) => (
          <div
            key={job.draft_id}
            className="flex flex-col gap-4 rounded-xl border border-neutral-800 p-4 sm:flex-row"
          >
            <Media job={job} height={210} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="text-sm font-medium">{job.caption}</div>
              <div className="mt-1 text-xs text-neutral-500">{metaLine(job, count)}</div>
              <div className="mt-auto flex gap-2 pt-3">
                <button
                  disabled={busyId === job.draft_id}
                  onClick={() => act(job.draft_id, () => api.exportJob(job.id))}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  Export to library
                </button>
                <Link
                  to={`/drafts/${job.draft_id}`}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
                >
                  Edit draft
                </Link>
                <button
                  disabled={busyId === job.draft_id}
                  onClick={() => act(job.draft_id, () => api.render(job.draft_id))}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500 disabled:opacity-50"
                >
                  Re-render
                </button>
              </div>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Exported" count={groups.exported.length}>
        {groups.exported.map(({ latest: job, count }) => (
          <div
            key={job.draft_id}
            className="flex items-center gap-3 rounded-xl border border-neutral-900 px-3 py-2"
          >
            <Media job={job} height={56} compact />
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{job.caption}</span>
            <span className="hidden shrink-0 text-xs text-neutral-600 sm:inline">{metaLine(job, count)}</span>
            <span className="shrink-0 text-xs text-emerald-500">exported ✓</span>
            {job.outputs.length > 0 && (
              <button
                disabled={busyId === job.draft_id}
                onClick={() => act(job.draft_id, () => api.exportJob(job.id))}
                title="Replace the Library copy with this render"
                className="shrink-0 rounded-lg border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-white disabled:opacity-50"
              >
                Re-export
              </button>
            )}
            <Link to="/library" className="shrink-0 text-xs text-neutral-500 hover:text-white">
              Library →
            </Link>
          </div>
        ))}
      </Section>
    </div>
  )
}
