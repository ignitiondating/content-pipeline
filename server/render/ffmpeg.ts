import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { VENDOR_DIR } from '../paths'

const execFileAsync = promisify(execFile)

/**
 * Filters the clip pipeline needs. Homebrew's FFmpeg ships without libass /
 * libfreetype, so it cannot burn text; the project vendors its own binary
 * (scripts/setup-ffmpeg.mjs) and this probe verifies it before rendering.
 */
const REQUIRED_FILTERS = ['overlay', 'scale', 'crop', 'format'] as const

function candidates(binary: 'ffmpeg' | 'ffprobe'): string[] {
  const found = [
    binary === 'ffmpeg' ? process.env.FFMPEG_PATH : null,
    binary === 'ffprobe' ? process.env.FFPROBE_PATH : null,
    path.join(VENDOR_DIR, binary),
    `/opt/homebrew/bin/${binary}`,
    `/usr/local/bin/${binary}`,
    binary,
  ]
  return found.filter((c): c is string => Boolean(c))
}

let cachedFfmpeg: string | null = null
let cachedFfprobe: string | null = null

export function ffmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg
  const found = candidates('ffmpeg').find((c) => c === 'ffmpeg' || existsSync(c))
  if (!found) throw new Error('FFmpeg binary not found — run `npm run setup`')
  cachedFfmpeg = found
  return found
}

export function ffprobePath(): string {
  if (cachedFfprobe) return cachedFfprobe
  const found = candidates('ffprobe').find((c) => c === 'ffprobe' || existsSync(c))
  if (!found) throw new Error('ffprobe binary not found — run `npm run setup`')
  cachedFfprobe = found
  return found
}

export interface FfmpegCapabilities {
  ok: boolean
  path: string
  version: string
  missingFilters: string[]
  /** aac_at (AudioToolbox, macOS) beats FFmpeg's native aac at equal bitrate. */
  audioEncoder: 'aac_at' | 'aac'
  /** Hardware encoder on Macs; libx264 everywhere else. */
  videoEncoder: 'h264_videotoolbox' | 'libx264'
}

export async function probeFfmpeg(): Promise<FfmpegCapabilities> {
  const bin = ffmpegPath()
  const [{ stdout: versionOut }, { stdout: filtersOut }, { stdout: encodersOut }] =
    await Promise.all([
      execFileAsync(bin, ['-hide_banner', '-version'], { maxBuffer: 1 << 20 }),
      execFileAsync(bin, ['-hide_banner', '-filters'], { maxBuffer: 1 << 24 }),
      execFileAsync(bin, ['-hide_banner', '-encoders'], { maxBuffer: 1 << 24 }),
    ])

  const available = new Set(
    filtersOut
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[1])
      .filter(Boolean),
  )
  const missingFilters = REQUIRED_FILTERS.filter((f) => !available.has(f))

  return {
    ok: missingFilters.length === 0,
    path: bin,
    version: versionOut.split('\n')[0] ?? '',
    missingFilters,
    audioEncoder: /^\s*A\S*\s+aac_at\s/m.test(encodersOut) ? 'aac_at' : 'aac',
    videoEncoder: /^\s*V\S*\s+h264_videotoolbox\s/m.test(encodersOut)
      ? 'h264_videotoolbox'
      : 'libx264',
  }
}

export interface MediaInfo {
  durationS: number | null
  width: number | null
  height: number | null
}

export async function probeMedia(file: string): Promise<MediaInfo> {
  const { stdout } = await execFileAsync(ffprobePath(), [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=width,height',
    '-of', 'json',
    file,
  ])
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{ width?: number; height?: number }>
  }
  const video = parsed.streams?.find((s) => s.width && s.height)
  const duration = Number.parseFloat(parsed.format?.duration ?? '')
  return {
    durationS: Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
  }
}
