import ChatScreen from '../components/chat/ChatScreen'
import type { ChatSpec } from '@shared/formats/chat'
import type { CarouselSpec } from '@shared/formats/carousel'
import type { ClipSpec } from '@shared/formats/clip'
import { useReadyFlag, useSpec } from './useCapture'

/**
 * Capture page for chat images.
 *   ?specId=<draftId>&slide=N            → carousel slide N, full-screen chat
 *   ?specId=<draftId>&clipState=N        → overlay clip state N, floating card
 *   ?specId=<draftId>&full=1&visible=N   → cuts clip screen, full chat with N messages
 */
export default function RenderChat() {
  const { data, error, params } = useSpec()
  useReadyFlag(Boolean(data))

  if (error) return <div data-capture-page>error: {error}</div>
  if (!data) return <div data-capture-page />

  if ((params.get('full') !== null || params.get('zoom') !== null) && data.format === 'clip') {
    const spec = data.spec as ClipSpec
    const visible = Number(params.get('visible') ?? spec.chat.messages.length)
    return (
      <div data-capture-page>
        <ChatScreen
          spec={spec.chat}
          mode={params.get('zoom') !== null ? 'zoom' : 'full'}
          visibleCount={visible}
          storyImageUrl={params.get('story') ?? undefined}
        />
      </div>
    )
  }

  const clipState = params.get('clipState')
  if (clipState !== null) {
    const spec = data.spec as ClipSpec
    const state = data.clipTimeline?.states[Number(clipState)]
    if (!state) return <div data-capture-page>error: bad clipState</div>
    return (
      <div data-capture-page>
        <ChatScreen
          spec={spec.chat}
          mode="card"
          visibleCount={state.visibleCount}
          showTyping={state.typing}
        />
      </div>
    )
  }

  const slideIndex = Number(params.get('slide') ?? '0')
  const chat: ChatSpec | undefined =
    data.format === 'carousel' ? (data.spec as CarouselSpec).slides[slideIndex] : undefined
  if (!chat) return <div data-capture-page>error: bad slide index</div>
  return (
    <div data-capture-page>
      <ChatScreen spec={chat} mode="full" />
    </div>
  )
}
