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
