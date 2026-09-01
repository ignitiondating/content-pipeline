import path from 'node:path'
import type { Draft } from '../../shared/formats/draft'
import type { SlideshowSpec } from '../../shared/formats/slideshow'
import { pickAsset } from '../assets/catalog'
import { captureSequence } from '../capture/screenshot'
import type { ProgressFn } from './carousel'

export async function renderSlideshow(
  draft: Draft,
  workdir: string,
  setProgress: ProgressFn,
): Promise<void> {
  const spec = draft.spec as SlideshowSpec
  setProgress(0.05, `capturing ${spec.slides.length} slides`)
  await captureSequence(
    spec.slides.map((_, i) => {
      // LRU rotation over library/backgrounds; the page falls back to a
      // gradient when the library is empty.
      const background = pickAsset('background')
      const bg = background ? `&bg=${encodeURIComponent(`/files/${background.path}`)}` : ''
      return {
        route: `/render/slide?specId=${draft.id}&slide=${i}${bg}`,
        outPath: path.join(workdir, `slide_${String(i + 1).padStart(2, '0')}.png`),
      }
    }),
  )
  setProgress(1)
}
