import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { CLIP_LIMITS, type ClipSpec } from '../../shared/formats/clip'
import {
  buildClipTimeline,
  promoContentFor,
  resolveClipSegments,
  segmentsDurationS,
  type EditedSegment,
} from '../../shared/timeline'
import type { EditorManifest } from './editorBundle'
import { dropPromoShotSpec, stashPromoShotSpec } from './promoShot'
import { assetsInPathOrder, listAssets, markAssetUsed, pickAsset, type Asset } from '../assets/catalog'
import { captureSequence, type CaptureRequest } from '../capture/screenshot'
import { FILES_ROOT } from '../paths'
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
    // Explicit picks from the storyboard win; otherwise walk the tag's files
    // by filename (nba-01, nba-02, …), which stays the default. The outro
    // closes on the last file; a file only repeats when the clip has more
    // bursts than there are clips to spend.
    const chosen = spec.brollPaths?.length
      ? spec.brollPaths
          .map((p) => listAssets().find((a) => a.path === p && !a.missing))
          .filter((a): a is Asset => Boolean(a))
      : []
    const ordered = chosen.length ? chosen : assetsInPathOrder('broll', spec.brollTag)
    if (ordered.length === 0 && !spec.segments?.length) throw noBroll()
    // The same door the storyboard previews through: a frozen edit if the
    // operator made one, otherwise the structure derived from the chat.
    const segments = resolveClipSegments(spec, ordered.map((a) => a.path))
    const live = listAssets()
    const media = segments.filter((s) => s.type === 'broll' || s.type === 'image')
    if (media.some((s) => !live.some((a) => a.path === s.path && !a.missing))) {
      throw new Error('This edit references missing media. Replace it in the timeline before rendering.')
    }
    for (const p of new Set(media.map((s) => s.path))) {
      const asset = live.find((a) => a.path === p && !a.missing)
      if (asset) markAssetUsed(asset.id)
    }
    await renderCuts(draft, spec, segments, music, workdir, setProgress)
  } else {
    const broll = spec.brollPaths?.length
      ? listAssets().find((a) => a.path === spec.brollPaths![0] && a.kind === 'broll' && !a.missing)
      : pickAsset('broll', spec.brollTag)
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
  args.push('-stream_loop', '-1', '-t', durationS.toFixed(3), '-i', path.join(FILES_ROOT, broll.path))
  for (let i = 0; i < timeline.states.length; i++) {
    args.push('-i', path.join(workdir, `state_${String(i).padStart(2, '0')}.png`))
  }
  args.push('-i', path.join(workdir, 'hook.png'))
  const hookInput = timeline.states.length + 1
  if (music) args.push('-i', path.join(FILES_ROOT, music.path))

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
  const manifest: EditorManifest = {
    caption: draft.meta.caption, script: spec.chat.messages.map((m) => `${m.from}: ${m.text}`), hook: spec.hook,
    hookEndS: hookEnd, musicPath: music?.path,
    beats: [{ file: broll.path, source: 'library', startS: 0, durS: durationS },
      ...timeline.states.map((state, i) => ({ file: `state_${String(i).padStart(2, '0')}.png`, source: 'render' as const, layer: 'overlay', startS: state.tStartS, durS: state.tEndS - state.tStartS }))],
  }
  writeFileSync(path.join(workdir, 'editor-manifest.json'), JSON.stringify(manifest))
  setProgress(1)
}

/**
 * The @fivestaryra reference format: full-screen chat screenshots hard-cut
 * with b-roll hype bursts, hook burned over the intro, music throughout.
 */
async function renderCuts(
  draft: Draft,
  spec: ClipSpec,
  segments: EditedSegment[],
  music: Asset | null,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const durationS = segmentsDurationS(segments)
  // One capture per distinct chat screen, even if the edit repeats it.
  const chatSegments = [
    ...new Map(
      segments.filter((s) => s.type === 'chat').map((s) => [s.visibleCount, s]),
    ).values(),
  ]
  const hasPromo = segments.some((s) => s.type === 'promo')

  setProgress(0.05, `capturing ${chatSegments.length} chat screens`)
  // Zoomed-DM screens: only the previous message + the new one, huge.
  // Use the exact story selected in the editor; without a selection the
  // capture component uses the same bundled starter photo as the preview.
  const wantsStory = spec.chat.skin === 'instagram' && spec.chat.storyReply
  const storyAsset = wantsStory
    ? (spec.storyImagePath
        ? (listAssets().find((a) => a.path === spec.storyImagePath && !a.missing) ?? null)
        : null)
    : null
  if (wantsStory && spec.storyImagePath && !storyAsset) throw new Error('The selected story image is missing. Replace it in the editor before rendering.')
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
      const image = storyAsset ?? (spec.storyImagePath
        ? listAssets().find((a) => a.path === spec.storyImagePath && !a.missing)
        : null) ?? pickAsset('background')
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

  // One input per unique video file; every segment reads from it by index.
  const args: string[] = ['-y', '-hide_banner']
  const videoInputs = new Map<string, { input: number; durS: number; uses: number }>()
  for (const segment of segments) {
    if (segment.type !== 'broll' || videoInputs.has(segment.path)) continue
    const full = path.join(FILES_ROOT, segment.path)
    const durS = listAssets().find((a) => a.path === segment.path)?.durationS
      ?? (await probeMedia(full)).durationS
      ?? 8
    videoInputs.set(segment.path, { input: videoInputs.size, durS, uses: 0 })
    args.push('-i', full)
  }
  // Stills — inserted photos, chat screens, the promo shot — each held for
  // as long as the longest frame that uses them.
  const holdFor = (key: string): number =>
    Math.max(...segments.filter((s) => stillKey(s) === key).map((s) => s.durS), 0.4)
  const stillInputs = new Map<string, number>()
  const addStill = (key: string, file: string) => {
    if (stillInputs.has(key)) return
    stillInputs.set(key, videoInputs.size + stillInputs.size)
    args.push('-loop', '1', '-t', holdFor(key).toFixed(3), '-i', file)
  }
  for (const segment of segments) {
    if (segment.type === 'chat') {
      addStill(stillKey(segment), path.join(workdir, `chat_${pad2(segment.visibleCount)}.png`))
    } else if (segment.type === 'image') {
      addStill(stillKey(segment), path.join(FILES_ROOT, segment.path))
    } else if (segment.type === 'promo') {
      addStill(stillKey(segment), path.join(workdir, 'promo.png'))
    }
  }
  const hookInput = videoInputs.size + stillInputs.size
  args.push('-i', path.join(workdir, 'hook.png'))
  if (music) args.push('-i', path.join(FILES_ROOT, music.path))

  const filters: string[] = []
  const labels: string[] = []
  const beats: EditorManifest['beats'] = []
  let timelineStart = 0
  segments.forEach((segment, i) => {
    const beat: EditorManifest['beats'][number] = {
      file: segment.type === 'chat' ? `chat_${pad2(segment.visibleCount)}.png` : segment.type === 'promo' ? 'promo.png' : segment.path,
      source: segment.type === 'broll' || segment.type === 'image' ? 'library' : 'render',
      startS: timelineStart, durS: segment.durS,
    }
    timelineStart = Math.round((timelineStart + segment.durS) * 1000) / 1000
    beats.push(beat)
    if (segment.type === 'broll') {
      const source = videoInputs.get(segment.path)!
      const trimmed = segment.trimStartS !== undefined || segment.trimEndS !== undefined
      const start = Math.max(0, Math.min(segment.trimStartS ?? 0, Math.max(source.durS - 0.2, 0)))
      // What the operator kept between the handles, or the whole file.
      const available = trimmed
        ? Math.max((segment.trimEndS ?? source.durS) - start, 0.1)
        : source.durS
      if (available <= segment.durS + 0.05) {
        // Shorter than its beat: stretch it (subtle slow-mo) instead of
        // looping — a restart mid-beat reads as a glitch.
        beat.trimStartS = start
        beat.trimEndS = start + available
        const ratio = segment.durS / Math.max(available, 0.1)
        const cut = trimmed
          ? `trim=start=${start.toFixed(3)}:duration=${available.toFixed(3)},`
          : ''
        filters.push(
          `[${source.input}:v]${cut}setpts=${ratio.toFixed(4)}*(PTS-STARTPTS),${NORM},trim=duration=${segment.durS.toFixed(3)}[s${i}]`,
        )
      } else {
        // Trimmed: play exactly from the handle. Untrimmed and repeated:
        // sample a later offset so the beat still looks different.
        let from = start
        if (!trimmed) {
          from = (source.uses * 6.7) % Math.max(source.durS - segment.durS, 0.01)
          if (from + segment.durS > source.durS) from = 0
        }
        beat.trimStartS = from
        beat.trimEndS = from + segment.durS
        source.uses++
        filters.push(
          `[${source.input}:v]trim=start=${from.toFixed(3)}:duration=${segment.durS.toFixed(3)},setpts=PTS-STARTPTS,${NORM}[s${i}]`,
        )
      }
    } else if (segment.type === 'image' || segment.type === 'promo') {
      const input = stillInputs.get(stillKey(segment))!
      filters.push(`[${input}:v]${NORM},trim=duration=${segment.durS.toFixed(3)}[s${i}]`)
    } else {
      const input = stillInputs.get(stillKey(segment))!
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
  const hookEnd = spec.hookPersists ? durationS : (segments[0]?.durS ?? 2.5) + 0.8
  filters.push(
    `[main][${hookInput}:v]overlay=0:0:eof_action=repeat:enable='between(t,0,${hookEnd.toFixed(3)})'[vout]`,
  )

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]')
  pushAudioArgs(args, music, hookInput + 1, durationS, caps)
  pushEncodeArgs(args, durationS, caps, workdir)

  await runFfmpeg(caps.path, args, workdir, durationS, (frac) =>
    setProgress(0.35 + frac * 0.63, 'encoding'),
  )
  const manifest: EditorManifest = { caption: draft.meta.caption,
    script: spec.chat.messages.map((m) => `${m.from}: ${m.text}`), hook: spec.hook,
    hookEndS: hookEnd, musicPath: music?.path, beats }
  writeFileSync(path.join(workdir, 'editor-manifest.json'), JSON.stringify(manifest))
  setProgress(1)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Which still input a frame reads from; frames sharing a key share an input. */
const stillKey = (segment: EditedSegment): string =>
  segment.type === 'chat'
    ? `chat:${segment.visibleCount}`
    : segment.type === 'promo'
      ? 'promo'
      : segment.type === 'image'
        ? `image:${segment.path}`
        : ''

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
