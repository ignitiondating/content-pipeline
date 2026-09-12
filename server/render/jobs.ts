import { buildEditorBundle } from './editorBundle'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { getDb, newId, now } from '../db/index'
import { getDraft, updateDraft } from '../db/repo'
import { RENDER_DIR } from '../paths'
import { renderCarousel } from './carousel'
import { renderSlideshow } from './slideshow'
import { renderClip } from './clip'

export interface JobRow {
  id: string
  draft_id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  message: string | null
  workdir: string
  created_at: string
  finished_at: string | null
}

// FFmpeg and Chromium both saturate the machine; one render at a time.
let queueTail: Promise<void> = Promise.resolve()

export function enqueueRender(draftId: string): string {
  const draft = getDraft(draftId)
  if (!draft) throw new Error(`draft ${draftId} not found`)

  const jobId = newId('j')
  const workdir = path.join(RENDER_DIR, jobId)
  mkdirSync(workdir, { recursive: true })
  getDb()
    .prepare(
      'INSERT INTO jobs (id, draft_id, kind, status, workdir, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(jobId, draftId, draft.format, 'queued', workdir, now())

  queueTail = queueTail.then(() => runJob(jobId)).catch(() => {})
  return jobId
}

async function runJob(jobId: string): Promise<void> {
  const db = getDb()
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow
  const draft = getDraft(job.draft_id)
  if (!draft) {
    db.prepare("UPDATE jobs SET status = 'error', message = ?, finished_at = ? WHERE id = ?").run(
      'draft disappeared',
      now(),
      jobId,
    )
    return
  }

  const setProgress = (progress: number, message?: string) => {
    db.prepare('UPDATE jobs SET progress = ?, message = COALESCE(?, message) WHERE id = ?').run(
      Math.min(1, Math.max(0, progress)),
      message ?? null,
      jobId,
    )
  }

  db.prepare("UPDATE jobs SET status = 'running', message = 'starting' WHERE id = ?").run(jobId)
  try {
    if (draft.format === 'carousel') await renderCarousel(draft, job.workdir, setProgress)
    else if (draft.format === 'slideshow') await renderSlideshow(draft, job.workdir, setProgress)
    else {
      await renderClip(draft, job.workdir, setProgress)
      setProgress(0.99, 'packaging CapCut media')
      buildEditorBundle(job.workdir)
    }

    db.prepare(
      "UPDATE jobs SET status = 'done', progress = 1, message = 'done', finished_at = ? WHERE id = ?",
    ).run(now(), jobId)
    if (draft.status === 'draft' || draft.status === 'approved') {
      updateDraft(draft.id, { status: 'rendered' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    db.prepare(
      "UPDATE jobs SET status = 'error', message = ?, finished_at = ? WHERE id = ?",
    ).run(message.slice(0, 2000), now(), jobId)
  }
}

export function getJob(jobId: string): JobRow | null {
  return (getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow) ?? null
}

export function listJobs(limit = 50): JobRow[] {
  return getDb()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as JobRow[]
}

/** Deliverable files a finished job produced, relative to its workdir. */
export function jobOutputs(job: JobRow): string[] {
  try {
    return readdirSync(job.workdir)
      .filter((f) => f.startsWith('slide_') || f === 'out.mp4' || f === 'capcut-media.zip')
      .sort()
  } catch {
    return []
  }
}

/**
 * Sweeps workdirs older than 24h, but only when the draft was already
 * exported — an un-exported render is still the only copy of the output.
 */
export function sweepWorkdirs(): void {
  const db = getDb()
  const cutoff = Date.now() - 24 * 3600 * 1000
  const jobs = db
    .prepare(
      `SELECT j.id, j.workdir, j.created_at FROM jobs j
       JOIN drafts d ON d.id = j.draft_id
       WHERE d.status IN ('exported','posted')`,
    )
    .all() as Array<Pick<JobRow, 'id' | 'workdir' | 'created_at'>>
  for (const job of jobs) {
    try {
      if (new Date(job.created_at).getTime() > cutoff) continue
      if (!statSync(job.workdir, { throwIfNoEntry: false })) continue
      rmSync(job.workdir, { recursive: true, force: true })
    } catch {
      // sweeping is best-effort
    }
  }
}
