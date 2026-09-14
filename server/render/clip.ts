import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { CLIP_LIMITS, type ClipSpec } from '../../shared/formats/clip'
import {
  promoContentFor,
  resolveClipSegments,
  resolveOverlayEdit,
  segmentsDurationS,
  type EditedSegment,
  type ResolvedOverlay,
} from '../../shared/timeline'
import { fadesForSegments } from '../../shared/transitions'
import type { EditorManifest } from './editorBundle'
import { dropPromoShotSpec, stashPromoShotSpec } from './promoShot'
import { assetsInPathOrder, listAssets, markAssetUsed, pickAsset, type Asset } from '../assets/catalog'
import { captureSequence, type CaptureRequest } from '../capture/screenshot'
import { FILES_ROOT } from '../paths'
import { probeFfmpeg, type FfmpegCapabilities } from './ffmpeg'
import { FPS, NORM, collectVideoInputs, stillChain, videoChain } from './clipFilters'
import type { ProgressFn } from './carousel'

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
    // Same door as the cuts branch: the operator's frozen background if there
    // is one, otherwise the single clip this format has always used.
    const chosen = spec.brollPaths?.length
      ? spec.brollPaths
          .map((p) => listAssets().find((a) => a.path === p && !a.missing))
          .filter((a): a is Asset => Boolean(a))
      : []
    const fallback = pickAsset('broll', spec.brollTag)
    const ordered = chosen.length ? chosen : fallback ? [fallback] : []
    if (!ordered.length && !spec.overlay?.bg.length) throw noBroll()
    const edit = resolveOverlayEdit(spec, ordered.map((a) => a.path))
    const live = listAssets()
    if (edit.bg.some((b) => !live.some((a) => a.path === b.path && !a.missing))) {
      throw new Error('This edit references missing media. Replace it in the timeline before rendering.')
    }
    for (const p of new Set(edit.bg.map((b) => b.path))) {
      const asset = live.find((a) => a.path === p && !a.missing)
      if (asset) markAssetUsed(asset.id)
    }
    await renderOverlay(draft, spec, edit, music, workdir, setProgress)
  }
}

/**
 * Chat card floating over continuous b-roll, revealed state by state. The
 * footage underneath can now be several clips cut together; one clip with
 * nothing done to it keeps the old single-input path, which is also the only
 * way a 6s file can back a 24s video without slowing to a crawl.
 */
async function renderOverlay(
  draft: Draft,
  spec: ClipSpec,
  edit: ResolvedOverlay,
  music: Asset | null,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const { bg, states, durationS } = edit

  setProgress(0.05, `capturing ${states.length} chat states`)
  const captures: CaptureRequest[] = states.map((_, i) => ({
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

  const fades = fadesForSegments(bg, { style: spec.transitions?.style })
  const single = bg.length === 1 && bg[0].type === 'broll'
    && bg[0].trimStartS === undefined && bg[0].trimEndS === undefined
    && !fades[0].inS && !fades[0].outS

  const args: string[] = ['-y', '-hide_banner']
  const filters: string[] = []
  const beats: EditorManifest['beats'] = []

  if (single) {
    args.push('-stream_loop', '-1', '-t', durationS.toFixed(3), '-i', path.join(FILES_ROOT, bg[0].path))
    filters.push(`[0:v]${NORM}[bg]`)
    beats.push({ file: bg[0].path, source: 'library', startS: 0, durS: durationS })
  } else {
    const videoInputs = await collectVideoInputs(bg, args, { loopShort: true })
    const stills = new Map<string, number>()
    for (const cut of bg) {
      if (cut.type !== 'image' || stills.has(cut.path)) continue
      stills.set(cut.path, videoInputs.size + stills.size)
      const holdS = Math.max(...bg.filter((b) => b.path === cut.path).map((b) => b.durS))
      args.push('-loop', '1', '-t', holdS.toFixed(3), '-i', path.join(FILES_ROOT, cut.path))
    }
    let startS = 0
    bg.forEach((cut, i) => {
      const beat: EditorManifest['beats'][number] = {
        file: cut.path, source: 'library', startS, durS: cut.durS,
        fadeInS: fades[i].inS || undefined, fadeOutS: fades[i].outS || undefined,
      }
      startS = Math.round((startS + cut.durS) * 1000) / 1000
      if (cut.type === 'broll') {
        const chain = videoChain(cut, videoInputs.get(cut.path)!, `b${i}`, fades[i])
        beat.trimStartS = chain.trimStartS
        beat.trimEndS = chain.trimEndS
        filters.push(chain.filter)
      } else {
        filters.push(stillChain(stills.get(cut.path)!, cut.durS, `b${i}`, fades[i]))
      }
      beats.push(beat)
    })
    filters.push(`${bg.map((_, i) => `[b${i}]`).join('')}concat=n=${bg.length}:v=1:a=0[bg]`)
  }

  // The card captures and the hook come after whatever the background used.
  const stateInput = countInputs(args)
  for (let i = 0; i < states.length; i++) {
    args.push('-i', path.join(workdir, `state_${String(i).padStart(2, '0')}.png`))
  }
  args.push('-i', path.join(workdir, 'hook.png'))
  const hookInput = stateInput + states.length
  if (music) args.push('-i', path.join(FILES_ROOT, music.path))

  let current = 'bg'
  states.forEach((state, i) => {
    const next = `v${i}`
    filters.push(
      `[${current}][${stateInput + i}:v]overlay=0:0:eof_action=repeat:enable='between(t,${state.tStartS},${state.tEndS})'[${next}]`,
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
    beats: [...beats,
      ...states.map((state, i) => ({ file: `state_${String(i).padStart(2, '0')}.png`, source: 'render' as const, layer: 'overlay', startS: state.tStartS, durS: round3(state.tEndS - state.tStartS) }))],
  }
  writeFileSync(path.join(workdir, 'editor-manifest.json'), JSON.stringify(manifest))
  setProgress(1)
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/** How many inputs the argv declares so far, so later ones get the right index. */
const countInputs = (args: string[]): number => args.filter((a) => a === '-i').length

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
  const videoInputs = await collectVideoInputs(segments, args)
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
  // Every frame dips in and out of black, scaled to its own length — the cut
  // between the footage and a screenshot is what read as a jump without it.
  // The reference's longer story transition survives as one of these.
  const fades = fadesForSegments(segments, {
    style: spec.transitions?.style,
    storyFade: Boolean(spec.chat.storyReply) && spec.chat.messages.length > 1,
  })
  segments.forEach((segment, i) => {
    const fade = fades[i]
    const beat: EditorManifest['beats'][number] = {
      file: segment.type === 'chat' ? `chat_${pad2(segment.visibleCount)}.png` : segment.type === 'promo' ? 'promo.png' : segment.path,
      source: segment.type === 'broll' || segment.type === 'image' ? 'library' : 'render',
      startS: timelineStart, durS: segment.durS,
      fadeInS: fade.inS || undefined, fadeOutS: fade.outS || undefined,
    }
    timelineStart = Math.round((timelineStart + segment.durS) * 1000) / 1000
    beats.push(beat)
    if (segment.type === 'broll') {
      const chain = videoChain(segment, videoInputs.get(segment.path)!, `s${i}`, fade)
      beat.trimStartS = chain.trimStartS
      beat.trimEndS = chain.trimEndS
      filters.push(chain.filter)
    } else {
      filters.push(stillChain(stillInputs.get(stillKey(segment))!, segment.durS, `s${i}`, fade))
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
