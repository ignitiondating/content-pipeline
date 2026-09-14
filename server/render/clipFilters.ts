import path from 'node:path'
import type { EditedSegment } from '../../shared/timeline'
import { fadeFilters, type Fade } from '../../shared/transitions'
import { listAssets } from '../assets/catalog'
import { FILES_ROOT } from '../paths'
import { probeMedia } from './ffmpeg'

export const FPS = 30
export const NORM = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${FPS},setsar=1,format=yuv420p`

const NO_FADE: Fade = { inS: 0, outS: 0 }

/** One FFmpeg input per unique video file; frames read from it by index. */
export interface VideoSource {
  input: number
  durS: number
  /** How many frames already played this file, so repeats sample elsewhere. */
  uses: number
  /** The input repeats forever, so a frame can outlast the file itself. */
  looped?: boolean
}

/** A frame that plays a video file — the shape both structures share. */
export interface VideoFrame {
  path: string
  durS: number
  trimStartS?: number
  trimEndS?: number
}

/**
 * Adds one `-i` per distinct clip and returns where each one landed. Source
 * durations come from the catalog, falling back to a probe.
 */
export async function collectVideoInputs(
  segments: EditedSegment[],
  args: string[],
  options: { loopShort?: boolean } = {},
): Promise<Map<string, VideoSource>> {
  const inputs = new Map<string, VideoSource>()
  for (const segment of segments) {
    if (segment.type !== 'broll' || inputs.has(segment.path)) continue
    const full = path.join(FILES_ROOT, segment.path)
    const durS =
      listAssets().find((a) => a.path === segment.path)?.durationS ??
      (await probeMedia(full)).durationS ??
      8
    // Continuous footage under a floating card has always looped; slowing it
    // down instead would crawl once a 3s clip has to cover 10s.
    const longestBeatS = Math.max(...segments.filter((s) => s.type === 'broll' && s.path === segment.path).map((s) => s.durS))
    const looped = Boolean(options.loopShort) && longestBeatS > durS
    if (looped) args.push('-stream_loop', '-1', '-t', (longestBeatS + 1).toFixed(3))
    inputs.set(segment.path, { input: inputs.size, durS, uses: 0, looped })
    args.push('-i', full)
  }
  return inputs
}

/** A still — a chat screen, the product shot, an inserted photo — held for its frame. */
export function stillChain(input: number, durS: number, outLabel: string, fade: Fade = NO_FADE): string {
  return `[${input}:v]${NORM},trim=duration=${durS.toFixed(3)}${fadeFilters(fade, durS)}[${outLabel}]`
}

export interface VideoChain {
  filter: string
  /** What this frame actually plays from the file, for the CapCut handoff. */
  trimStartS: number
  trimEndS: number
}

/**
 * Cuts (or stretches) a clip to its frame, normalizes it to the canvas and
 * dips it in and out of black. Mutates `source.uses`: an untrimmed clip used
 * twice samples a later offset the second time so the beat looks different.
 */
export function videoChain(
  frame: VideoFrame,
  source: VideoSource,
  outLabel: string,
  fade: Fade = NO_FADE,
): VideoChain {
  const tail = fadeFilters(fade, frame.durS)
  const trimmed = frame.trimStartS !== undefined || frame.trimEndS !== undefined
  const start = Math.max(0, Math.min(frame.trimStartS ?? 0, Math.max(source.durS - 0.2, 0)))
  // What the operator kept between the handles, or the whole file.
  const available = trimmed ? Math.max((frame.trimEndS ?? source.durS) - start, 0.1) : source.durS

  if (available <= frame.durS + 0.05 && !source.looped) {
    // Shorter than its beat: stretch it (subtle slow-mo) instead of looping —
    // a restart mid-beat reads as a glitch.
    const ratio = frame.durS / Math.max(available, 0.1)
    const cut = trimmed ? `trim=start=${start.toFixed(3)}:duration=${available.toFixed(3)},` : ''
    return {
      trimStartS: start,
      trimEndS: start + available,
      filter: `[${source.input}:v]${cut}setpts=${ratio.toFixed(4)}*(PTS-STARTPTS),${NORM},trim=duration=${frame.durS.toFixed(3)}${tail}[${outLabel}]`,
    }
  }

  // Trimmed: play exactly from the handle. Untrimmed and repeated: sample a
  // later offset so the beat still looks different.
  let from = start
  if (!trimmed && !source.looped) {
    from = (source.uses * 6.7) % Math.max(source.durS - frame.durS, 0.01)
    if (from + frame.durS > source.durS) from = 0
  }
  source.uses++
  return {
    trimStartS: from,
    trimEndS: from + frame.durS,
    filter: `[${source.input}:v]trim=start=${from.toFixed(3)}:duration=${frame.durS.toFixed(3)},setpts=PTS-STARTPTS,${NORM}${tail}[${outLabel}]`,
  }
}
