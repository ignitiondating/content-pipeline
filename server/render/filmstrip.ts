import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { FILES_ROOT, FILMSTRIPS_DIR } from '../paths'
import { ffmpegPath, probeMedia } from './ffmpeg'

export const FILMSTRIP_FRAMES = 12
const FRAME_W = 90
const FRAME_H = 160

/**
 * A horizontal strip of evenly spaced frames — the film behind the trim
 * handles, so the operator picks the in and out points by looking at the
 * clip instead of guessing at seconds. Built once per file and cached.
 */
export async function filmstripFor(assetPath: string): Promise<{ file: string; durationS: number }> {
  const source = path.join(FILES_ROOT, assetPath)
  if (!existsSync(source)) throw new Error(`no such clip: ${assetPath}`)

  const { durationS } = await probeMedia(source)
  const total = durationS ?? 8
  // Keyed by path and mtime: replacing the file rebuilds the strip.
  const key = createHash('sha1')
    .update(`${assetPath}:${statSync(source).mtimeMs}:${FILMSTRIP_FRAMES}`)
    .digest('hex')
    .slice(0, 16)
  const file = path.join(FILMSTRIPS_DIR, `${key}.jpg`)
  if (existsSync(file)) return { file, durationS: total }

  mkdirSync(FILMSTRIPS_DIR, { recursive: true })
  // One frame every total/FRAMES seconds, tiled left to right.
  const fps = FILMSTRIP_FRAMES / Math.max(total, 0.5)
  await run(ffmpegPath(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', source,
    '-vf', `fps=${fps.toFixed(4)},scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H},tile=${FILMSTRIP_FRAMES}x1`,
    '-frames:v', '1', '-q:v', '4',
    file,
  ])
  return { file, durationS: total }
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString().slice(0, 4000)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`filmstrip failed (${code}): ${stderr.trim()}`)),
    )
  })
}
