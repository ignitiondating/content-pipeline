import { useEffect, useMemo } from 'react'
import { CHAT_CANVAS, type ChatSpec } from '@shared/formats/chat'
import {
  buildCutsTimeline,
  burstOrdinalAt,
  promoContentFor,
  type ClipTiming,
  type CutSegment,
} from '@shared/timeline'
import ChatScreen from '../chat/ChatScreen'
import WingPromoShot from '../promo/WingPromoShot'
import BrollPlaceholder from './BrollPlaceholder'
import Scaled from './Scaled'
import { useLoop } from '../../lib/useLoop'

function BrollVideo({ url }: { url: string }) {
  return (
    <video
      src={url}
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
  brollUrl,
  storyUrl,
  isIntro,
}: {
  segment: CutSegment
  chat: ChatSpec
  hook?: string
  brollUrl?: string
  storyUrl?: string
  isIntro?: boolean
}) {
  if (segment.type === 'broll') {
    return (
      <div style={{ position: 'relative', width: CHAT_CANVAS.width, height: CHAT_CANVAS.height }}>
        {brollUrl ? <BrollVideo url={brollUrl} /> : <BrollPlaceholder />}
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
  chat,
  timing,
  hook,
  burstUrls = [],
  storyUrl,
  height = 460,
  playing = true,
  activeIndex,
  onIndexChange,
}: {
  chat: ChatSpec
  timing?: ClipTiming
  hook?: string
  /** One URL per b-roll beat, already resolved (slots included). */
  burstUrls?: string[]
  storyUrl?: string
  height?: number
  playing?: boolean
  activeIndex?: number
  onIndexChange?: (index: number) => void
}) {
  const timeline = useMemo(() => buildCutsTimeline(chat, timing), [chat, timing])
  const durations = useMemo(() => timeline.segments.map((s) => s.durS), [timeline])
  const [looped] = useLoop(durations, playing && activeIndex === undefined)
  const index = Math.min(activeIndex ?? looped, timeline.segments.length - 1)
  const segment = timeline.segments[index]

  useEffect(() => {
    if (activeIndex === undefined) onIndexChange?.(looped)
  }, [looped, activeIndex, onIndexChange])

  const brollForIndex = useMemo(
    () =>
      timeline.segments.map((s, i) =>
        s.type === 'broll' ? burstUrls[burstOrdinalAt(timeline.segments, i)] : undefined,
      ),
    [timeline, burstUrls],
  )

  if (!segment) return null
  return (
    <Scaled height={height}>
      <ClipFrame
        segment={segment}
        chat={chat}
        hook={hook}
        brollUrl={brollForIndex[index]}
        storyUrl={storyUrl}
        isIntro={index === 0}
      />
    </Scaled>
  )
}
