import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import type { CarouselSpec } from '../../shared/formats/carousel'
import { captureSequence } from '../capture/screenshot'

export type ProgressFn = (progress: number, message?: string) => void

export async function renderCarousel(
  draft: Draft,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const spec = draft.spec as CarouselSpec
  setProgress(0.05, `capturing ${spec.slides.length} slides`)
  await captureSequence(
    spec.slides.map((_, i) => ({
      route: `/render/chat?specId=${draft.id}&slide=${i}`,
      outPath: path.join(workdir, `slide_${String(i + 1).padStart(2, '0')}.png`),
    })),
  )
  setProgress(1)
}
