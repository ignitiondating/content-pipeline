import { useEffect, useState } from 'react'
import SlideCard from '../components/slide/SlideCard'
import type { SlideshowSpec } from '@shared/formats/slideshow'
import { useReadyFlag, useSpec } from './useCapture'

/** Capture page for slideshow slides: ?specId=<draftId>&slide=N&bg=<url>. */
export default function RenderSlide() {
  const { data, error, params } = useSpec()
  const bg = params.get('bg') ?? undefined
  const [bgReady, setBgReady] = useState(!bg)

  useEffect(() => {
    if (!bg) return
    const image = new Image()
    image.onload = () => setBgReady(true)
    image.onerror = () => setBgReady(true) // fall back to the gradient
    image.src = bg
  }, [bg])

  useReadyFlag(Boolean(data) && bgReady)

  if (error) return <div data-capture-page>error: {error}</div>
  if (!data || !bgReady) return <div data-capture-page />

  const slide = (data.spec as SlideshowSpec).slides[Number(params.get('slide') ?? '0')]
  if (!slide) return <div data-capture-page>error: bad slide index</div>
  return (
    <div data-capture-page>
      <SlideCard slide={slide} backgroundUrl={bg} />
    </div>
  )
}
