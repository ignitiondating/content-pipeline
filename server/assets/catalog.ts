import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { getDb, newId, now } from '../db/index'
import { BACKGROUNDS_DIR, BROLL_DIR, FILES_ROOT, MUSIC_DIR, PROMO_DIR } from '../paths'
import { probeMedia } from '../render/ffmpeg'

export type AssetKind = 'broll' | 'background' | 'music' | 'promo'

export interface Asset {
  id: string
  kind: AssetKind
  path: string
  tag: string | null
  durationS: number | null
  width: number | null
  height: number | null
  useCount: number
  lastUsedAt: string | null
  missing: boolean
}

export const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v'])
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
export const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.aac'])

interface AssetRow {
  id: string
  kind: AssetKind
  path: string
  tag: string | null
  duration_s: number | null
  width: number | null
  height: number | null
  use_count: number
  last_used_at: string | null
  missing: number
}

const toAsset = (row: AssetRow): Asset => ({
  id: row.id,
  kind: row.kind,
  path: row.path,
  tag: row.tag,
  durationS: row.duration_s,
  width: row.width,
  height: row.height,
  useCount: row.use_count,
  lastUsedAt: row.last_used_at,
  missing: row.missing === 1,
})

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

/**
 * Scans library/ drop folders and syncs the catalog: new files get probed
 * (sha256 + ffprobe), files that vanished are flagged `missing` so rotation
 * skips them without losing their usage history.
 */
export async function rescanAssets(): Promise<{ added: number; missing: number; total: number }> {
  const db = getDb()
  const seen = new Set<string>()
  let added = 0

  const sources: Array<{ dir: string; kind: AssetKind; exts: Set<string> }> = [
    { dir: BROLL_DIR, kind: 'broll', exts: VIDEO_EXT },
    { dir: BACKGROUNDS_DIR, kind: 'background', exts: IMAGE_EXT },
    { dir: MUSIC_DIR, kind: 'music', exts: AUDIO_EXT },
    // Real WingAI app screenshots for the promo beat of cuts clips.
    { dir: PROMO_DIR, kind: 'promo', exts: IMAGE_EXT },
  ]

  for (const { dir, kind, exts } of sources) {
    for (const file of walk(dir)) {
      if (!exts.has(path.extname(file).toLowerCase())) continue
      const relative = path.relative(FILES_ROOT, file)
      seen.add(relative)
      const existing = db.prepare('SELECT id FROM assets WHERE path = ?').get(relative)
      if (existing) {
        db.prepare('UPDATE assets SET missing = 0 WHERE path = ?').run(relative)
        continue
      }
      // b-roll tag = first folder under library/broll (basketball, 3d, ...)
      const tag =
        kind === 'broll' ? path.relative(BROLL_DIR, file).split(path.sep)[0] ?? null : null
      const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex')
      let media = { durationS: null as number | null, width: null as number | null, height: null as number | null }
      if (kind !== 'background') {
        try {
          media = await probeMedia(file)
        } catch {
          // ffprobe missing or unreadable file: catalog it anyway
        }
      }
      db.prepare(
        `INSERT INTO assets (id, kind, path, sha256, tag, duration_s, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId('a'), kind, relative, sha256, tag, media.durationS, media.width, media.height)
      added++
    }
  }

  const all = db.prepare('SELECT path FROM assets').all() as Array<{ path: string }>
  let missing = 0
  for (const row of all) {
    if (!seen.has(row.path) && !existsSync(path.join(FILES_ROOT, row.path))) {
      db.prepare('UPDATE assets SET missing = 1 WHERE path = ?').run(row.path)
      missing++
    }
  }
  const total = (db.prepare('SELECT COUNT(*) AS n FROM assets WHERE missing = 0').get() as { n: number }).n
  return { added, missing, total }
}

export function listAssets(): Asset[] {
  const rows = getDb()
    .prepare('SELECT * FROM assets ORDER BY kind, tag, path')
    .all() as AssetRow[]
  return rows.map(toAsset)
}

/**
 * All live assets of a kind (+ optional tag) in filename order — for formats
 * where the operator numbers the files to control the sequence (nba-01…).
 */
export function assetsInPathOrder(kind: AssetKind, tag?: string): Asset[] {
  const db = getDb()
  const rows = (
    tag
      ? db.prepare('SELECT * FROM assets WHERE kind = ? AND tag = ? AND missing = 0 ORDER BY path').all(kind, tag)
      : db.prepare('SELECT * FROM assets WHERE kind = ? AND missing = 0 ORDER BY path').all(kind)
  ) as AssetRow[]
  return rows.map(toAsset)
}

export function markAssetUsed(id: string): void {
  getDb().prepare('UPDATE assets SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(now(), id)
}

/**
 * Least-recently-used rotation within a kind (+ optional tag) so consecutive
 * renders don't reuse the same b-roll/background/music.
 */
export function pickAsset(kind: AssetKind, tag?: string): Asset | null {
  const db = getDb()
  const row = (
    tag
      ? db.prepare(
          `SELECT * FROM assets WHERE kind = ? AND tag = ? AND missing = 0
           ORDER BY use_count ASC, last_used_at ASC NULLS FIRST, path ASC LIMIT 1`,
        ).get(kind, tag)
      : db.prepare(
          `SELECT * FROM assets WHERE kind = ? AND missing = 0
           ORDER BY use_count ASC, last_used_at ASC NULLS FIRST, path ASC LIMIT 1`,
        ).get(kind)
  ) as AssetRow | undefined
  if (!row) return null
  db.prepare('UPDATE assets SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(
    now(),
    row.id,
  )
  return toAsset(row)
}
