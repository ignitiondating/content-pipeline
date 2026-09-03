import PromoScreen from '../components/chat/PromoScreen'
import type { CarouselSpec } from '@shared/formats/carousel'
import type { ClipSpec } from '@shared/formats/clip'
import { useReadyFlag, useSpec } from './useCapture'

/** Capture page for the WingAI suggested-reply promo beat: ?specId=<draftId>. */
export default function RenderPromo() {
  const { data, error } = useSpec()
  useReadyFlag(Boolean(data))

  if (error) return <div data-capture-page>error: {error}</div>
  if (!data) return <div data-capture-page />

  const chat =
    data.format === 'clip' ? (data.spec as ClipSpec).chat : (data.spec as CarouselSpec).chat
  if (!chat) return <div data-capture-page>error: spec has no chat</div>
  return (
    <div data-capture-page>
      <PromoScreen spec={chat} />
    </div>
  )
}
