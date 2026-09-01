import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getDb, newId, now } from '../db/index'
import { getDraft, updateDraft } from '../db/repo'
import { EXPORTS_DIR } from '../paths'
import { getJob, jobOutputs } from './jobs'

export interface ExportRecord {
  id: string
  draftId: string
  dir: string
  files: string[]
  createdAt: string
}

/**
 * Finalizes a finished render: copies deliverables into out/exports/<draftId>/
 * next to a caption.txt sidecar with everything to copy-paste at post time.
 */
export function exportJob(jobId: string): ExportRecord {
  const job = getJob(jobId)
  if (!job) throw new Error(`job ${jobId} not found`)
  if (job.status !== 'done') throw new Error(`job ${jobId} is ${job.status}, not done`)
  const draft = getDraft(job.draft_id)
  if (!draft) throw new Error(`draft ${job.draft_id} not found`)

  const outputs = jobOutputs(job)
  if (outputs.length === 0) throw new Error('job produced no deliverables (workdir swept?)')

  const dir = path.join(EXPORTS_DIR, draft.id)
  mkdirSync(dir, { recursive: true })
  for (const file of outputs) {
    copyFileSync(path.join(job.workdir, file), path.join(dir, file))
  }

  const lines = [
    `CAPTION: ${draft.meta.caption}`,
    `HASHTAGS: ${draft.meta.hashtags.join(' ')}`,
    `SOUND: ${draft.meta.songSuggestion}`,
  ]
  if (draft.meta.gateKeyword) {
    lines.push(`GATE: ask viewers to comment "${draft.meta.gateKeyword}" for the next part — link in bio`)
  }
  if (draft.partRole) lines.push(`SERIES PART: ${(draft.partIndex ?? 0) + 1} (${draft.partRole})`)
  writeFileSync(path.join(dir, 'caption.txt'), `${lines.join('\n')}\n`)

  const files = [...outputs, 'caption.txt']
  const id = newId('e')
  getDb()
    .prepare('INSERT INTO exports (id, draft_id, dir, files_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, draft.id, dir, JSON.stringify(files), now())
  updateDraft(draft.id, { status: 'exported' })

  return { id, draftId: draft.id, dir, files, createdAt: now() }
}

export function listExports(): Array<ExportRecord & { caption: string; format: string; status: string }> {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.draft_id, e.dir, e.files_json, e.created_at, d.meta_json, d.format, d.status
       FROM exports e JOIN drafts d ON d.id = e.draft_id ORDER BY e.created_at DESC`,
    )
    .all() as Array<{
    id: string
    draft_id: string
    dir: string
    files_json: string
    created_at: string
    meta_json: string
    format: string
    status: string
  }>
  return rows.map((r) => ({
    id: r.id,
    draftId: r.draft_id,
    dir: r.dir,
    files: JSON.parse(r.files_json) as string[],
    createdAt: r.created_at,
    caption: (JSON.parse(r.meta_json) as { caption: string }).caption,
    format: r.format,
    status: r.status,
  }))
}
