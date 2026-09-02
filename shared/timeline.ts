import type { ChatSpec } from './formats/chat'
import { CLIP_LIMITS } from './formats/clip'

/**
 * One visual state of the chat card during the clip. The renderer captures a
 * PNG per state and FFmpeg shows each one with overlay enable=between(t,a,b).
 */
export interface TimelineState {
  /** Messages visible in this state (0 = empty thread). */
  visibleCount: number
  /** Typing indicator shown for the incoming side. */
  typing: boolean
  tStartS: number
  tEndS: number
}

export interface ClipTimeline {
  states: TimelineState[]
  durationS: number
}

const TYPING_S = 1.1
const LEAD_IN_S = 0.5
const HOLD_BASE_S = 1.1
const HOLD_PER_CHAR_S = 0.045
const HOLD_MIN_S = 1.3
const HOLD_MAX_S = 3.4

const round = (v: number) => Math.round(v * 1000) / 1000

/** One hard-cut segment of the 'cuts' clip structure. */
export interface CutSegment {
  type: 'broll' | 'chat'
  /** Messages visible in this chat screen (chat segments only). */
  visibleCount: number
  durS: number
}

export interface CutsTimeline {
  segments: CutSegment[]
  durationS: number
}

const CUTS = {
  introS: 2.2,
  burstS: 2.4,
  outroS: 4.0,
  chatBaseS: 1.6,
  chatPerCharS: 0.05,
  chatMinS: 2.0,
  chatMaxS: 5.0,
  /** A b-roll hype burst is cut in after every this many messages. */
  messagesPerBurst: 2,
} as const

/**
 * Deterministic segment list for the 'cuts' structure: intro b-roll with the
 * hook, then full-screen chat screens (each adding one message) interleaved
 * with b-roll bursts, closing on an outro montage. Chat holds scale to keep
 * the total inside CLIP_LIMITS; b-roll beats stay fixed so the rhythm holds.
 */
export function buildCutsTimeline(chat: ChatSpec): CutsTimeline {
  const holds = chat.messages.map((m) =>
    Math.min(CUTS.chatMaxS, Math.max(CUTS.chatMinS, CUTS.chatBaseS + m.text.length * CUTS.chatPerCharS)),
  )
  const burstCount = Math.floor((chat.messages.length - 1) / CUTS.messagesPerBurst)
  const fixedS = CUTS.introS + burstCount * CUTS.burstS + CUTS.outroS
  const holdTotalS = holds.reduce((a, b) => a + b, 0)

  const minHolds = CLIP_LIMITS.minDurationS - fixedS
  const maxHolds = CLIP_LIMITS.maxDurationS - fixedS
  let scale = 1
  if (holdTotalS > maxHolds) scale = maxHolds / holdTotalS
  else if (holdTotalS < minHolds) scale = minHolds / holdTotalS

  const segments: CutSegment[] = [{ type: 'broll', visibleCount: 0, durS: CUTS.introS }]
  chat.messages.forEach((_, i) => {
    segments.push({ type: 'chat', visibleCount: i + 1, durS: round(holds[i] * scale) })
    const isLast = i === chat.messages.length - 1
    if (!isLast && (i + 1) % CUTS.messagesPerBurst === 0) {
      segments.push({ type: 'broll', visibleCount: i + 1, durS: CUTS.burstS })
    }
  })
  segments.push({ type: 'broll', visibleCount: chat.messages.length, durS: CUTS.outroS })

  return { segments, durationS: round(segments.reduce((a, s) => a + s.durS, 0)) }
}

/**
 * Deterministic: the same spec always yields the same timeline. Message
 * holds scale to fit within CLIP_LIMITS; typing/lead-in/tail stay fixed so
 * the rhythm of the reveal survives the scaling.
 */
export function buildClipTimeline(chat: ChatSpec): ClipTimeline {
  const holds = chat.messages.map((m) =>
    Math.min(HOLD_MAX_S, Math.max(HOLD_MIN_S, HOLD_BASE_S + m.text.length * HOLD_PER_CHAR_S)),
  )
  const typingCount = chat.messages.filter((m) => m.from === 'them').length
  const fixedS = LEAD_IN_S + typingCount * TYPING_S + CLIP_LIMITS.tailS
  const holdTotalS = holds.reduce((a, b) => a + b, 0)

  const minHolds = CLIP_LIMITS.minDurationS - fixedS
  const maxHolds = CLIP_LIMITS.maxDurationS - fixedS
  let scale = 1
  if (holdTotalS > maxHolds) scale = maxHolds / holdTotalS
  else if (holdTotalS < minHolds) scale = minHolds / holdTotalS

  const states: TimelineState[] = []
  let t = 0
  const push = (visibleCount: number, typing: boolean, durS: number) => {
    states.push({ visibleCount, typing, tStartS: round(t), tEndS: round(t + durS) })
    t += durS
  }

  push(0, false, LEAD_IN_S)
  chat.messages.forEach((message, i) => {
    if (message.from === 'them') push(i, true, TYPING_S)
    const isLast = i === chat.messages.length - 1
    push(i + 1, false, holds[i] * scale + (isLast ? CLIP_LIMITS.tailS : 0))
  })

  return { states, durationS: round(t) }
}
