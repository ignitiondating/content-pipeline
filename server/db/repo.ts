import { getDb, newId, now } from './index'
import { parseMeta, parseSpec } from '../../shared/validate'
import type { AnySpec, Draft, DraftMeta, DraftStatus, Format } from '../../shared/formats/draft'

interface DraftRow {
  id: string
  batch_id: string | null
  format: Format
  spec_json: string
  meta_json: string
  status: DraftStatus
  series_id: string | null
  part_index: number | null
  part_role: Draft['partRole']
  hook_text: string
  created_at: string
  updated_at: string
  posted_at: string | null
}

function toDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    batchId: row.batch_id,
    format: row.format,
    spec: JSON.parse(row.spec_json) as AnySpec,
    meta: JSON.parse(row.meta_json) as DraftMeta,
    status: row.status,
    seriesId: row.series_id,
    partIndex: row.part_index,
    partRole: row.part_role,
    hookText: row.hook_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postedAt: row.posted_at,
  }
}

export function createBatch(input: {
  format: Format | 'serial'
  brief: string
  model: string
  variantCount: number
}) {
  const id = newId('b')
  getDb()
    .prepare(
      'INSERT INTO batches (id, format, brief, model, variant_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, input.format, input.brief, input.model, input.variantCount, now())
  return id
}

export function createSeries(keyword: string, title: string): string {
  const id = newId('s')
  getDb()
    .prepare('INSERT INTO series (id, keyword, title, created_at) VALUES (?, ?, ?, ?)')
    .run(id, keyword, title, now())
  return id
}

export function createDraft(input: {
  batchId: string | null
  format: Format
  spec: AnySpec
  meta: DraftMeta
  seriesId?: string | null
  partIndex?: number | null
  partRole?: Draft['partRole']
}): Draft {
  const id = newId('d')
  const ts = now()
  getDb()
    .prepare(
      `INSERT INTO drafts (id, batch_id, format, spec_json, meta_json, status, series_id, part_index, part_role, hook_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.batchId,
      input.format,
      JSON.stringify(input.spec),
      JSON.stringify(input.meta),
      input.seriesId ?? null,
      input.partIndex ?? null,
      input.partRole ?? null,
      input.meta.caption,
      ts,
      ts,
    )
  return getDraft(id)!
}

export function getDraft(id: string): Draft | null {
  const row = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined
  return row ? toDraft(row) : null
}

export function listDrafts(filter: { status?: string; format?: string; seriesId?: string; batchId?: string }): Draft[] {
  const where: string[] = []
  const args: unknown[] = []
  if (filter.status) { where.push('status = ?'); args.push(filter.status) }
  if (filter.format) { where.push('format = ?'); args.push(filter.format) }
  if (filter.seriesId) { where.push('series_id = ?'); args.push(filter.seriesId) }
  if (filter.batchId) { where.push('batch_id = ?'); args.push(filter.batchId) }
  const sql = `SELECT * FROM drafts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`
  return (getDb().prepare(sql).all(...args) as DraftRow[]).map(toDraft)
}

export function updateDraft(
  id: string,
  patch: { spec?: unknown; meta?: unknown; status?: DraftStatus },
): Draft {
  const existing = getDraft(id)
  if (!existing) throw new Error(`draft ${id} not found`)
  const spec = patch.spec !== undefined ? parseSpec(existing.format, patch.spec) : existing.spec
  const meta = patch.meta !== undefined ? parseMeta(patch.meta) : existing.meta
  const status = patch.status ?? existing.status
  const postedAt = status === 'posted' ? existing.postedAt ?? now() : existing.postedAt
  getDb()
    .prepare(
      'UPDATE drafts SET spec_json = ?, meta_json = ?, status = ?, hook_text = ?, updated_at = ?, posted_at = ? WHERE id = ?',
    )
    .run(JSON.stringify(spec), JSON.stringify(meta), status, meta.caption, now(), postedAt, id)
  return getDraft(id)!
}

/** Hooks of recent approved/posted drafts, injected as an avoid-list when generating. */
export function recentHooks(format: Format | 'serial', limit = 30): string[] {
  const rows = getDb()
    .prepare(
      `SELECT hook_text FROM drafts
       WHERE status IN ('approved','rendered','exported','posted') AND (? = 'serial' OR format = ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(format, format, limit) as Array<{ hook_text: string }>
  return rows.map((r) => r.hook_text)
}

export function statusCounts(): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM drafts GROUP BY status')
    .all() as Array<{ status: string; n: number }>
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value)
}

export function allSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
