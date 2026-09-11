import { useEffect, useMemo } from 'react'
import { CHAT_CANVAS, type ChatSpec } from '@shared/formats/chat'
import { promoContentFor, type EditedSegment } from '@shared/timeline'
import ChatScreen from '../chat/ChatScreen'
import WingPromoShot from '../promo/WingPromoShot'
import BrollPlaceholder from './BrollPlaceholder'
import Scaled from './Scaled'
import { useLoop } from '../../lib/useLoop'

function BrollVideo({ url, startS }: { url: string; startS?: number }) {
  return (
    <video
      // The fragment makes the preview open on the same frame the trim
      // handle picked, so the storyboard shows what the render will show.
      src={startS ? `${url}#t=${startS.toFixed(2)}` : url}
      autoPlay
      muted
      loop
      playsInline
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        // Tailwind's preflight sets max-width:100% on <video>, which would
        // letterbox it inside the scaled canvas.
        maxWidth: 'none',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  )
}

function HookText({ hook }: { hook: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: '86%',
          textAlign: 'center',
          fontSize: 34,
          fontWeight: 900,
          lineHeight: 1.15,
          color: '#FFFFFF',
          textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 0 #000',
        }}
      >
        {hook}
      </div>
    </div>
  )
}

/** One frame of the cuts structure — the shared truth for previews. */
export function ClipFrame({
  segment,
  chat,
  hook,
  mediaUrl,
  storyUrl,
  isIntro,
}: {
  segment: EditedSegment
  chat: ChatSpec
  hook?: string
  /** Resolved URL of the clip or photo this frame plays. */
  mediaUrl?: string
  storyUrl?: string
  isIntro?: boolean
}) {
  if (segment.type === 'broll') {
    return (
      <div style={{ position: 'relative', width: CHAT_CANVAS.width, height: CHAT_CANVAS.height }}>
        {mediaUrl ? <BrollVideo url={mediaUrl} startS={segment.trimStartS} /> : <BrollPlaceholder />}
        {isIntro && hook && <HookText hook={hook} />}
      </div>
    )
  }
  if (segment.type === 'image') {
    return (
      <div style={{ position: 'relative', width: CHAT_CANVAS.width, height: CHAT_CANVAS.height }}>
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt=""
            style={{
              width: CHAT_CANVAS.width,
              height: CHAT_CANVAS.height,
              maxWidth: 'none',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <BrollPlaceholder />
        )}
        {isIntro && hook && <HookText hook={hook} />}
      </div>
    )
  }
  if (segment.type === 'promo') {
    return <WingPromoShot spec={{ suggestion: '', ...promoContentFor(chat) }} />
  }
  return (
    <ChatScreen
      spec={chat}
      mode="zoom"
      visibleCount={segment.visibleCount}
      storyImageUrl={segment.visibleCount === 1 ? storyUrl : undefined}
    />
  )
}

/**
 * Plays a cuts clip's structure at its real pacing. `activeIndex` drives it
 * from outside (the storyboard); left alone it loops on its own.
 */
export default function ClipPlayer({
  segments,
  chat,
  hook,
  mediaUrls = [],
  storyUrl,
  height = 460,
  playing = true,
  activeIndex,
  onIndexChange,
}: {
  segments: EditedSegment[]
  chat: ChatSpec
  hook?: string
  /** One URL per frame, empty where the frame plays no file. */
  mediaUrls?: string[]
  storyUrl?: string
  height?: number
  playing?: boolean
  activeIndex?: number
  onIndexChange?: (index: number) => void
}) {
  const durations = useMemo(() => segments.map((s) => s.durS), [segments])
  const [looped] = useLoop(durations, playing && activeIndex === undefined)
  const index = Math.min(activeIndex ?? looped, segments.length - 1)
  const segment = segments[index]

  useEffect(() => {
    if (activeIndex === undefined) onIndexChange?.(looped)
  }, [looped, activeIndex, onIndexChange])

  if (!segment) return null
  return (
    <Scaled height={height}>
      <ClipFrame
        segment={segment}
        chat={chat}
        hook={hook}
        mediaUrl={mediaUrls[index] || undefined}
        storyUrl={storyUrl}
        isIntro={index === 0}
      />
    </Scaled>
  )
}
