import { useEffect, useMemo, useRef } from 'react'
import { CHAT_CANVAS, type ChatSpec } from '@shared/formats/chat'
import { promoContentFor, type EditedSegment } from '@shared/timeline'
import ChatScreen from '../chat/ChatScreen'
import WingPromoShot from '../promo/WingPromoShot'
import BrollPlaceholder from './BrollPlaceholder'
import Scaled from './Scaled'
import { useLoop } from '../../lib/useLoop'

function BrollVideo({ url, startS = 0, endS, durationS, playing = true, seekOffset }: { url: string; startS?: number; endS?: number; durationS: number; playing?: boolean; seekOffset?: number }) {
  const video = useRef<HTMLVideoElement>(null)
  const previous = useRef<{ url: string; startS: number; playing: boolean; seekOffset?: number } | null>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    const last = previous.current
    const justPaused = last?.playing && !playing && last.url === url && last.startS === startS && last.seekOffset === seekOffset
    previous.current = { url, startS, playing, seekOffset }
    const seek = () => {
      // Show a useful still when selecting footage; explicit scrubs and the
      // actual playback start keep their original timing.
      if (justPaused) return
      const offset = seekOffset ?? (playing ? 0 : Math.min(1, Math.max(0, durationS - 0.05)))
      const sourceEnd = Number.isFinite(element.duration) ? element.duration : Infinity
      const end = Math.min(sourceEnd, endS ?? Infinity)
      element.currentTime = Math.max(0, Math.min(startS + offset, Math.max(0, end - 0.05)))
    }
    if (element.readyState >= 1) seek()
    else element.addEventListener('loadedmetadata', seek, { once: true })
    if (playing) void element.play().catch(() => {})
    else element.pause()
    return () => element.removeEventListener('loadedmetadata', seek)
  }, [url, startS, endS, durationS, playing, seekOffset])
  return <video ref={video} src={url} muted loop playsInline style={{ width: CHAT_CANVAS.width, height: CHAT_CANVAS.height, maxWidth: 'none', objectFit: 'cover', display: 'block' }} />
}

export function HookText({ hook }: { hook: string }) {
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
  playing = true,
  seekOffset,
}: {
  segment: EditedSegment
  chat: ChatSpec
  hook?: string
  /** Resolved URL of the clip or photo this frame plays. */
  mediaUrl?: string
  storyUrl?: string
  playing?: boolean
  seekOffset?: number
  isIntro?: boolean
}) {
  if (segment.type === 'broll') {
    return (
      <div style={{ position: 'relative', width: CHAT_CANVAS.width, height: CHAT_CANVAS.height }}>
        {mediaUrl ? <BrollVideo url={mediaUrl} startS={segment.trimStartS} endS={segment.trimEndS} durationS={segment.durS} playing={playing} seekOffset={seekOffset} /> : <BrollPlaceholder />}
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
  seekOffset,
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
  seekOffset?: number
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
        key={index}
        playing={playing}
        seekOffset={seekOffset}
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
