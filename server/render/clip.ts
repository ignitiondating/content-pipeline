import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { CLIP_LIMITS, type ClipSpec } from '../../shared/formats/clip'
import { buildClipTimeline, buildCutsTimeline } from '../../shared/timeline'
import { pickAsset, type Asset } from '../assets/catalog'
import { captureSequence, type CaptureRequest } from '../capture/screenshot'
import { PROJECT_ROOT } from '../paths'
import { probeFfmpeg, probeMedia, type FfmpegCapabilities } from './ffmpeg'
import type { ProgressFn } from './carousel'

const FPS = 30
const NORM = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${FPS},setsar=1,format=yuv420p`

export async function renderClip(
  draft: Draft,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const spec = draft.spec as ClipSpec
  const broll = pickAsset('broll', spec.brollTag)
  if (!broll) {
    throw new Error(
      `no b-roll with tag "${spec.brollTag}" — drop .mp4 files into library/broll/${spec.brollTag}/ and rescan assets`,
    )
  }
  const music = spec.withMusic ? pickAsset('music') : null

  if ((spec.structure ?? 'overlay') === 'cuts') {
    await renderCuts(draft, spec, broll, music, workdir, setProgress)
  } else {
    await renderOverlay(draft, spec, broll, music, workdir, setProgress)
  }
}

/** Chat card floating over continuous b-roll, revealed state by state. */
async function renderOverlay(
  draft: Draft,
  spec: ClipSpec,
  broll: Asset,
  music: Asset | null,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const timeline = buildClipTimeline(spec.chat)

  setProgress(0.05, `capturing ${timeline.states.length} chat states`)
  const captures: CaptureRequest[] = timeline.states.map((_, i) => ({
    route: `/render/chat?specId=${draft.id}&clipState=${i}`,
    outPath: path.join(workdir, `state_${String(i).padStart(2, '0')}.png`),
    transparent: true,
  }))
  captures.push({
    route: `/render/overlay?specId=${draft.id}`,
    outPath: path.join(workdir, 'hook.png'),
    transparent: true,
  })
  await captureSequence(captures)

  setProgress(0.35, 'encoding')
  const caps = await probeFfmpeg()
  const durationS = timeline.durationS

  const args: string[] = ['-y', '-hide_banner']
  args.push('-stream_loop', '-1', '-t', durationS.toFixed(3), '-i', path.join(PROJECT_ROOT, broll.path))
  for (let i = 0; i < timeline.states.length; i++) {
    args.push('-i', path.join(workdir, `state_${String(i).padStart(2, '0')}.png`))
  }
  args.push('-i', path.join(workdir, 'hook.png'))
  const hookInput = timeline.states.length + 1
  if (music) args.push('-i', path.join(PROJECT_ROOT, music.path))

  const filters: string[] = [`[0:v]${NORM}[bg]`]
  let current = 'bg'
  timeline.states.forEach((state, i) => {
    const next = `v${i}`
    filters.push(
      `[${current}][${i + 1}:v]overlay=0:0:eof_action=repeat:enable='between(t,${state.tStartS},${state.tEndS})'[${next}]`,
    )
    current = next
  })
  const hookEnd = spec.hookPersists ? durationS : CLIP_LIMITS.hookOnlyIntroS
  filters.push(
    `[${current}][${hookInput}:v]overlay=0:0:eof_action=repeat:enable='between(t,0,${hookEnd})'[vout]`,
  )

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]')
  pushAudioArgs(args, music, hookInput + 1, durationS, caps)
  pushEncodeArgs(args, durationS, caps, workdir)

  await runFfmpeg(caps.path, args, workdir, durationS, (frac) =>
    setProgress(0.35 + frac * 0.63, 'encoding'),
  )
  setProgress(1)
}

/**
 * The @fivestaryra reference format: full-screen chat screenshots hard-cut
 * with b-roll hype bursts, hook burned over the intro, music throughout.
 */
async function renderCuts(
  draft: Draft,
  spec: ClipSpec,
  broll: Asset,
  music: Asset | null,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const timeline = buildCutsTimeline(spec.chat)
  const chatSegments = timeline.segments.filter((s) => s.type === 'chat')

  setProgress(0.05, `capturing ${chatSegments.length} chat screens`)
  const captures: CaptureRequest[] = chatSegments.map((segment) => ({
    route: `/render/chat?specId=${draft.id}&full=1&visible=${segment.visibleCount}`,
    outPath: path.join(workdir, `chat_${String(segment.visibleCount).padStart(2, '0')}.png`),
  }))
  captures.push({
    route: `/render/overlay?specId=${draft.id}`,
    outPath: path.join(workdir, 'hook.png'),
    transparent: true,
  })
  await captureSequence(captures)

  setProgress(0.35, 'encoding')
  const caps = await probeFfmpeg()
  const brollPath = path.join(PROJECT_ROOT, broll.path)
  const brollDurS = broll.durationS ?? (await probeMedia(brollPath)).durationS ?? 8

  const args: string[] = ['-y', '-hide_banner', '-i', brollPath]
  const stillInputs = new Map<number, number>()
  for (const segment of chatSegments) {
    if (stillInputs.has(segment.visibleCount)) continue
    stillInputs.set(segment.visibleCount, stillInputs.size + 1)
    args.push('-loop', '1', '-t', segment.durS.toFixed(3), '-i',
      path.join(workdir, `chat_${String(segment.visibleCount).padStart(2, '0')}.png`))
  }
  const hookInput = 1 + stillInputs.size
  args.push('-i', path.join(workdir, 'hook.png'))
  if (music) args.push('-i', path.join(PROJECT_ROOT, music.path))

  // Each b-roll beat samples a different offset so bursts don't repeat.
  const filters: string[] = []
  const labels: string[] = []
  let brollIndex = 0
  timeline.segments.forEach((segment, i) => {
    if (segment.type === 'broll') {
      let start = (brollIndex * 6.7) % Math.max(brollDurS - segment.durS, 0.01)
      if (start + segment.durS > brollDurS) start = 0
      brollIndex++
      filters.push(
        `[0:v]trim=start=${start.toFixed(3)}:duration=${segment.durS.toFixed(3)},setpts=PTS-STARTPTS,${NORM}[s${i}]`,
      )
    } else {
      const input = stillInputs.get(segment.visibleCount)!
      filters.push(`[${input}:v]${NORM},trim=duration=${segment.durS.toFixed(3)}[s${i}]`)
    }
    labels.push(`[s${i}]`)
  })
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[main]`)
  const hookEnd = spec.hookPersists ? timeline.durationS : timeline.segments[0].durS + 0.8
  filters.push(
    `[main][${hookInput}:v]overlay=0:0:eof_action=repeat:enable='between(t,0,${hookEnd.toFixed(3)})'[vout]`,
  )

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]')
  pushAudioArgs(args, music, hookInput + 1, timeline.durationS, caps)
  pushEncodeArgs(args, timeline.durationS, caps, workdir)

  await runFfmpeg(caps.path, args, workdir, timeline.durationS, (frac) =>
    setProgress(0.35 + frac * 0.63, 'encoding'),
  )
  setProgress(1)
}

function pushAudioArgs(
  args: string[],
  music: Asset | null,
  musicInput: number,
  durationS: number,
  caps: FfmpegCapabilities,
): void {
  if (music) {
    args.push('-map', `${musicInput}:a`, '-c:a', caps.audioEncoder, '-b:a', '192k')
    args.push('-af', `afade=t=out:st=${(durationS - 1).toFixed(3)}:d=1`)
  } else {
    args.push('-an')
  }
}

function pushEncodeArgs(
  args: string[],
  durationS: number,
  caps: FfmpegCapabilities,
  workdir: string,
): void {
  args.push('-t', durationS.toFixed(3), '-r', String(FPS), '-pix_fmt', 'yuv420p')
  if (caps.videoEncoder === 'h264_videotoolbox') {
    args.push('-c:v', 'h264_videotoolbox', '-b:v', '10M')
  } else {
    args.push('-c:v', 'libx264', '-crf', '19', '-preset', 'medium')
  }
  args.push('-movflags', '+faststart', path.join(workdir, 'out.mp4'))

  // Reproducible by hand: the exact argv, shell-quoted.
  const quoted = args.map((a) => (/^[\w./:=,+-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`))
  writeFileSync(path.join(workdir, 'command.txt'), `${caps.path} ${quoted.join(' ')}\n`)
}

function runFfmpeg(
  bin: string,
  args: string[],
  workdir: string,
  durationS: number,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
      const match = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(text)
      if (match) {
        const t = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        onProgress(Math.min(1, t / durationS))
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      writeFileSync(path.join(workdir, 'log.txt'), stderr)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code} — see ${path.join(workdir, 'log.txt')}`))
    })
  })
}
