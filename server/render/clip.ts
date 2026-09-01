import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { CLIP_LIMITS, type ClipSpec } from '../../shared/formats/clip'
import { buildClipTimeline } from '../../shared/timeline'
import { pickAsset } from '../assets/catalog'
import { captureSequence, type CaptureRequest } from '../capture/screenshot'
import { PROJECT_ROOT } from '../paths'
import { probeFfmpeg } from './ffmpeg'
import type { ProgressFn } from './carousel'

const FPS = 30

export async function renderClip(
  draft: Draft,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const spec = draft.spec as ClipSpec
  const timeline = buildClipTimeline(spec.chat)

  const broll = pickAsset('broll', spec.brollTag)
  if (!broll) {
    throw new Error(
      `no b-roll with tag "${spec.brollTag}" — drop .mp4 files into library/broll/${spec.brollTag}/ and rescan assets`,
    )
  }
  const music = spec.withMusic ? pickAsset('music') : null

  // One transparent PNG per timeline state (chat card floating mid-frame)
  // plus one for the hook text.
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
  // input 0: b-roll, looped to cover the clip
  args.push('-stream_loop', '-1', '-t', durationS.toFixed(3), '-i', path.join(PROJECT_ROOT, broll.path))
  // inputs 1..N: state PNGs; input N+1: hook overlay
  for (let i = 0; i < timeline.states.length; i++) {
    args.push('-i', path.join(workdir, `state_${String(i).padStart(2, '0')}.png`))
  }
  args.push('-i', path.join(workdir, 'hook.png'))
  const hookInput = timeline.states.length + 1
  if (music) args.push('-i', path.join(PROJECT_ROOT, music.path))

  const filters: string[] = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${FPS},format=yuv420p[bg]`,
  ]
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
  if (music) {
    args.push('-map', `${hookInput + 1}:a`, '-c:a', caps.audioEncoder, '-b:a', '192k')
    args.push('-af', `afade=t=out:st=${(durationS - 1).toFixed(3)}:d=1`)
  } else {
    args.push('-an')
  }
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

  await runFfmpeg(caps.path, args, workdir, durationS, (frac) =>
    setProgress(0.35 + frac * 0.63, 'encoding'),
  )
  setProgress(1)
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
