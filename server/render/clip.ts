import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { CLIP_LIMITS, type ClipSpec } from '../../shared/formats/clip'
import { buildClipTimeline, buildCutsTimeline, promoContentFor } from '../../shared/timeline'
import { dropPromoShotSpec, stashPromoShotSpec } from './promoShot'
import { assetsInPathOrder, markAssetUsed, pickAsset, type Asset } from '../assets/catalog'
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
  const music = spec.withMusic ? pickAsset('music') : null
  const noBroll = () =>
    new Error(
      `no b-roll with tag "${spec.brollTag}" — drop .mp4 files into library/broll/${spec.brollTag}/ and rescan assets`,
    )

  if ((spec.structure ?? 'overlay') === 'cuts') {
    // The reference format alternates DIFFERENT highlights per hype burst.
    // Bursts follow the operator's filename numbering (nba-01, nba-02, …),
    // wrapping around when the clip has more bursts than files.
    const burstCount = buildCutsTimeline(spec.chat).segments.filter((s) => s.type === 'broll').length
    const ordered = assetsInPathOrder('broll', spec.brollTag)
    if (ordered.length === 0) throw noBroll()
    const n = ordered.length
    // Strictly consecutive through the numbered files (01, 02, 03, …); the
    // outro is always the last file. A file only repeats when the clip has
    // more bursts than the library has files.
    const brolls = Array.from({ length: burstCount }, (_, k) => {
      if (burstCount > 1 && k === burstCount - 1) return ordered[n - 1]
      return ordered[k % n]
    })
    for (const id of new Set(brolls.map((b) => b.id))) markAssetUsed(id)
    await renderCuts(draft, spec, brolls, music, workdir, setProgress)
  } else {
    const broll = pickAsset('broll', spec.brollTag)
    if (!broll) throw noBroll()
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
  brolls: Asset[],
  music: Asset | null,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const timeline = buildCutsTimeline(spec.chat)
  const chatSegments = timeline.segments.filter((s) => s.type === 'chat')
  const hasPromo = timeline.segments.some((s) => s.type === 'promo')

  setProgress(0.05, `capturing ${chatSegments.length} chat screens`)
  // Zoomed-DM screens: only the previous message + the new one, huge.
  // Instagram story-reply openers get a photo from library/backgrounds.
  const storyAsset =
    spec.chat.skin === 'instagram' && spec.chat.storyReply ? pickAsset('background') : null
  const story = storyAsset ? `&story=${encodeURIComponent(`/files/${storyAsset.path}`)}` : ''
  const captures: CaptureRequest[] = chatSegments.map((segment) => ({
    route: `/render/chat?specId=${draft.id}&zoom=1&visible=${segment.visibleCount}${
      segment.visibleCount === 1 ? story : ''
    }`,
    outPath: path.join(workdir, `chat_${String(segment.visibleCount).padStart(2, '0')}.png`),
  }))
  // The promo screenshot is generated from THIS clip's conversation so the
  // suggested line and bubbles always match the video, reusing the story
  // photo when there is one.
  let promoShotId: string | null = null
  if (hasPromo) {
    const content = promoContentFor(spec.chat)
    if (content) {
      const image = storyAsset ?? pickAsset('background')
      promoShotId = stashPromoShotSpec({ ...content, imagePath: image?.path })
      captures.push({
        route: `/render/promoshot?id=${promoShotId}`,
        outPath: path.join(workdir, 'promo.png'),
      })
    }
  }
  captures.push({
    route: `/render/overlay?specId=${draft.id}`,
    outPath: path.join(workdir, 'hook.png'),
    transparent: true,
  })
  try {
    await captureSequence(captures)
  } finally {
    if (promoShotId) dropPromoShotSpec(promoShotId)
  }

  setProgress(0.35, 'encoding')
  const caps = await probeFfmpeg()

  // One input per unique b-roll file; bursts index into `brolls` in order.
  const brollInputs = new Map<string, { input: number; durS: number; uses: number }>()
  const args: string[] = ['-y', '-hide_banner']
  for (const asset of brolls) {
    if (brollInputs.has(asset.path)) continue
    const full = path.join(PROJECT_ROOT, asset.path)
    const durS = asset.durationS ?? (await probeMedia(full)).durationS ?? 8
    brollInputs.set(asset.path, { input: brollInputs.size, durS, uses: 0 })
    args.push('-i', full)
  }
  const stillBase = brollInputs.size
  const stillInputs = new Map<number, number>()
  for (const segment of chatSegments) {
    if (stillInputs.has(segment.visibleCount)) continue
    stillInputs.set(segment.visibleCount, stillBase + stillInputs.size)
    args.push('-loop', '1', '-t', segment.durS.toFixed(3), '-i',
      path.join(workdir, `chat_${String(segment.visibleCount).padStart(2, '0')}.png`))
  }
  let promoInput = -1
  if (hasPromo) {
    const promoDurS = timeline.segments.find((s) => s.type === 'promo')!.durS
    promoInput = stillBase + stillInputs.size
    args.push('-loop', '1', '-t', promoDurS.toFixed(3), '-i', path.join(workdir, 'promo.png'))
  }
  const hookInput = stillBase + stillInputs.size + (hasPromo ? 1 : 0)
  args.push('-i', path.join(workdir, 'hook.png'))
  if (music) args.push('-i', path.join(PROJECT_ROOT, music.path))

  const filters: string[] = []
  const labels: string[] = []
  let burst = 0
  timeline.segments.forEach((segment, i) => {
    if (segment.type === 'broll') {
      const source = brollInputs.get(brolls[burst].path)!
      burst++
      if (source.durS <= segment.durS + 0.05) {
        // File shorter than its beat: stretch it slightly (subtle slow-mo)
        // instead of looping — a restart mid-beat reads as a glitch.
        const ratio = segment.durS / Math.max(source.durS, 0.1)
        filters.push(
          `[${source.input}:v]setpts=${ratio.toFixed(4)}*(PTS-STARTPTS),${NORM},trim=duration=${segment.durS.toFixed(3)}[s${i}]`,
        )
      } else {
        // When the same longer file repeats, sample a later offset so the
        // beat still looks different.
        let start = (source.uses * 6.7) % Math.max(source.durS - segment.durS, 0.01)
        if (start + segment.durS > source.durS) start = 0
        source.uses++
        filters.push(
          `[${source.input}:v]trim=start=${start.toFixed(3)}:duration=${segment.durS.toFixed(3)},setpts=PTS-STARTPTS,${NORM}[s${i}]`,
        )
      }
    } else if (segment.type === 'promo') {
      filters.push(`[${promoInput}:v]${NORM},trim=duration=${segment.durS.toFixed(3)}[s${i}]`)
    } else {
      const input = stillInputs.get(segment.visibleCount)!
      // Reference transition: the story screen fades to black and her reply
      // fades in — the one soft cut in an otherwise hard-cut edit.
      const storyFade = Boolean(spec.chat.storyReply) && spec.chat.messages.length > 1
      const fade =
        storyFade && segment.visibleCount === 1
          ? `,fade=t=out:st=${(segment.durS - 0.6).toFixed(3)}:d=0.6`
          : storyFade && segment.visibleCount === 2
            ? ',fade=t=in:st=0:d=0.45'
            : ''
      filters.push(`[${input}:v]${NORM},trim=duration=${segment.durS.toFixed(3)}${fade}[s${i}]`)
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
