import type { Draft } from '@shared/formats/draft'
import type { CarouselSpec } from '@shared/formats/carousel'
import type { SlideshowSpec } from '@shared/formats/slideshow'
import type { ClipSpec } from '@shared/formats/clip'
import ChatScreen from '../chat/ChatScreen'
import SlideCard from '../slide/SlideCard'
import Scaled from './Scaled'

interface DraftPreviewProps {
  draft: Pick<Draft, 'format' | 'spec'>
  height?: number
  /** Which slide to show for multi-slide formats. */
  slideIndex?: number
  /** For clips: how many messages are revealed (defaults to all). */
  visibleCount?: number
  showTyping?: boolean
}

export default function DraftPreview({
  draft,
  height = 360,
  slideIndex = 0,
  visibleCount,
  showTyping,
}: DraftPreviewProps) {
  if (draft.format === 'carousel') {
    const spec = draft.spec as CarouselSpec
    const chat = spec.slides[Math.min(slideIndex, spec.slides.length - 1)]
    return <Scaled height={height}>{chat && <ChatScreen spec={chat} mode="full" />}</Scaled>
  }
  if (draft.format === 'slideshow') {
    const spec = draft.spec as SlideshowSpec
    const slide = spec.slides[Math.min(slideIndex, spec.slides.length - 1)]
    return <Scaled height={height}>{slide && <SlideCard slide={slide} />}</Scaled>
  }
  const spec = draft.spec as ClipSpec
  return (
    <Scaled height={height}>
      <div style={{ width: 540, height: 960, background: '#212121' }}>
        <ChatScreen spec={spec.chat} mode="card" visibleCount={visibleCount} showTyping={showTyping} />
      </div>
    </Scaled>
  )
}
