import { useEffect, useRef } from 'react'
import type { ClipSpec } from '@shared/formats/clip'
import { CHAT_CANVAS } from '@shared/formats/chat'
import type { BackgroundSegment, TimelineState } from '@shared/timeline'
import { fadeOpacityAt, type Fade } from '@shared/transitions'
import ChatScreen from '../chat/ChatScreen'
import Scaled from './Scaled'
import BrollPlaceholder from './BrollPlaceholder'
import { HookText } from './ClipPlayer'

/**
 * The floating-conversation frame at one moment: the footage cut playing
 * underneath, the card revealed to its current state, and the hook. Driven
 * from outside by the timeline's clock so both stay on the same second.
 */
export default function OverlayPreview({
  spec, bg, bgOffsetS, fade, state, playing = false, height = 440,
}: {
  spec: ClipSpec
  /** The background cut under the playhead, if the edit has footage. */
  bg?: BackgroundSegment
  bgOffsetS: number
  fade?: Fade
  state?: TimelineState
  playing?: boolean
  height?: number
}) {
  const video = useRef<HTMLVideoElement>(null)
  const url = bg?.path ? `/files/${bg.path}` : undefined
  const startS = bg?.type === 'broll' ? bg.trimStartS ?? 0 : 0
  useEffect(() => {
    const element = video.current
    if (!element) return
    const sync = () => {
      const at = startS + bgOffsetS
      if (Number.isFinite(element.duration) && Math.abs(element.currentTime - at) > 0.3) {
        element.currentTime = Math.min(at, Math.max(0, element.duration - 0.05))
      }
      if (playing) void element.play().catch(() => {})
      else element.pause()
    }
    if (element.readyState >= 1) sync()
    element.addEventListener('loadedmetadata', sync)
    return () => element.removeEventListener('loadedmetadata', sync)
  }, [url, startS, bgOffsetS, playing])

  const dim = fade && bg ? fadeOpacityAt(fade, bg.durS, bgOffsetS) : 0
  const canvas = { width: CHAT_CANVAS.width, height: CHAT_CANVAS.height }
  return <Scaled height={height}>
    <div style={{ ...canvas, position: 'relative', overflow: 'hidden', background: '#212121' }}>
      {url && bg?.type === 'broll'
        ? <video key={url} ref={video} src={url} muted playsInline style={{ ...canvas, maxWidth: 'none', objectFit: 'cover', display: 'block' }} />
        : url
          ? <img src={url} alt="" style={{ ...canvas, maxWidth: 'none', objectFit: 'cover', display: 'block' }} />
          : <BrollPlaceholder />}
      {/* The fade dims the footage only: the card keeps floating above it. */}
      {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ChatScreen spec={spec.chat} mode="card" visibleCount={state?.visibleCount ?? 0} showTyping={state?.typing ?? false} />
      </div>
      {(spec.hookPersists || (state?.tStartS ?? 0) < 3) && <HookText hook={spec.hook} />}
    </div>
  </Scaled>
}
