import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import { carouselSlideCount, type CarouselSpec } from '../../shared/formats/carousel'
import { pickAsset } from '../assets/catalog'
import { captureSequence, type CaptureRequest } from '../capture/screenshot'

export type ProgressFn = (progress: number, message?: string) => void

export async function renderCarousel(
  draft: Draft,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const spec = draft.spec as CarouselSpec
  const count = carouselSlideCount(spec)
  setProgress(0.05, `capturing ${count} slides`)

  let captures: CaptureRequest[]
  if (spec.style === 'zoom') {
    // One zoomed-DM slide per message; the story-reply opener (when set)
    // rides the first two slides with a photo from library/backgrounds.
    const storyAsset =
      spec.chat?.skin === 'instagram' && spec.chat.storyReply ? pickAsset('background') : null
    const story = storyAsset ? `&story=${encodeURIComponent(`/files/${storyAsset.path}`)}` : ''
    captures = Array.from({ length: count }, (_, i) => ({
      route: `/render/chat?specId=${draft.id}&zoom=1&visible=${i + 1}${i === 0 ? story : ''}`,
      outPath: path.join(workdir, `slide_${String(i + 1).padStart(2, '0')}.png`),
    }))
  } else {
    captures = Array.from({ length: count }, (_, i) => ({
      route: `/render/chat?specId=${draft.id}&slide=${i}`,
      outPath: path.join(workdir, `slide_${String(i + 1).padStart(2, '0')}.png`),
    }))
  }
  await captureSequence(captures)
  setProgress(1)
}
