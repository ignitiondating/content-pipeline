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
  type: 'broll' | 'chat' | 'promo'
  /** Messages visible in this chat screen (chat segments only). */
  visibleCount: number
  durS: number
}

/**
 * Content for the promo screenshot, derived from the clip's own chat so it
 * always matches the video: the suggestion is the promo-target message, the
 * card shows the exchange right before it.
 */
export function promoContentFor(chat: ChatSpec): {
  bubbleMe?: string
  bubbleThem?: string
  suggestion: string
} | null {
  const target = promoTargetIndex(chat)
  if (target < 0) return null
  let bubbleThem: string | undefined
  let bubbleMe: string | undefined
  for (let i = target - 1; i >= 0; i--) {
    const message = chat.messages[i]
    if (!bubbleThem && message.from === 'them') bubbleThem = message.text
    else if (bubbleThem && message.from === 'me') {
      bubbleMe = message.text
      break
    }
  }
  return { bubbleMe, bubbleThem, suggestion: chat.messages[target].text }
}

/**
 * The message the promo segment presents as WingAI's suggestion: the first
 * own message that answers her (the reference showcases that first payoff
 * line, about a third into the clip). Falls back to the last own message;
 * -1 when the chat has none.
 */
export function promoTargetIndex(chat: ChatSpec): number {
  for (let i = 1; i < chat.messages.length; i++) {
    if (chat.messages[i].from === 'me' && chat.messages[i - 1].from === 'them') return i
  }
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].from === 'me') return i
  }
  return -1
}

export interface CutsTimeline {
  segments: CutSegment[]
  durationS: number
}

// Measured frame-by-frame from the reference clip (freezedetect + scene
// cuts on the 33.07s @fivestaryra video): intro 2.5, mid bursts 2.5-3.1,
// promo 2.1, outro montage ~6.5, chat screens 1.5-2.7 with the story
// opener held longest (~3.1).
const CUTS = {
  /** Cuts clips target the reference's exact runtime. */
  targetS: 33.0,
  introS: 2.5,
  burstS: 2.8,
  outroS: 6.5,
  /** The WingAI-suggests-the-line product moment before the payoff message. */
  promoS: 2.1,
  /** Extra hold on the story-reply opener screen. */
  storyBonusS: 0.8,
  chatBaseS: 1.6,
  chatPerCharS: 0.05,
  chatMinS: 2.0,
  chatMaxS: 5.0,
  /** Scaled holds stay within these bounds; tiny/huge chats trade exactness for pacing. */
  chatFloorS: 1.5,
  chatCeilS: 6.0,
} as const

/**
 * Deterministic segment list for the 'cuts' structure: intro b-roll with the
 * hook, then full-screen chat screens (each adding one message) interleaved
 * with b-roll bursts, closing on an outro montage. Chat holds scale to keep
 * the total inside CLIP_LIMITS; b-roll beats stay fixed so the rhythm holds.
 */
/**
 * Reference sequence: intro b-roll with the hook → story-reply screen →
 * (black fade, no burst) her reply → then b-roll and chat alternating one
 * and one, with the WingAI promo right before the payoff message, closing
 * on the outro burst (the operator's last-numbered file).
 */
export function buildCutsTimeline(chat: ChatSpec): CutsTimeline {
  const holds = chat.messages.map((m) =>
    Math.min(CUTS.chatMaxS, Math.max(CUTS.chatMinS, CUTS.chatBaseS + m.text.length * CUTS.chatPerCharS)),
  )
  const promoAt = promoTargetIndex(chat)
  const storyFade = Boolean(chat.storyReply) && chat.messages.length > 1
  // A burst follows every message except: the last (the outro covers it),
  // the story screen (fades to the reply instead), and a 'them' message
  // answered instantly by a non-promo 'me' — in the reference the comeback
  // pops straight in with no basketball between.
  const skipBurstAfter = (i: number): boolean => {
    if (i === 0 && storyFade) return true
    const next = chat.messages[i + 1]
    return chat.messages[i].from === 'them' && next?.from === 'me' && i + 1 !== promoAt
  }
  let burstCount = 0
  for (let i = 0; i < chat.messages.length - 1; i++) if (!skipBurstAfter(i)) burstCount++
  const fixedS =
    CUTS.introS +
    burstCount * CUTS.burstS +
    (promoAt >= 0 ? CUTS.promoS : 0) +
    (storyFade ? CUTS.storyBonusS : 0) +
    CUTS.outroS
  const holdTotalS = holds.reduce((a, b) => a + b, 0)

  // Message holds scale so the clip lands exactly on the reference runtime;
  // per-hold floor/ceiling means extreme chats land near it instead.
  const scale = holdTotalS > 0 ? Math.max(0, CUTS.targetS - fixedS) / holdTotalS : 1

  const segments: CutSegment[] = [{ type: 'broll', visibleCount: 0, durS: CUTS.introS }]
  chat.messages.forEach((_, i) => {
    // The product moment: WingAI suggests the payoff line, then the chat
    // screen reveals it sent — the reference's app-promo beat.
    if (i === promoAt) segments.push({ type: 'promo', visibleCount: i, durS: CUTS.promoS })
    const bonus = i === 0 && storyFade ? CUTS.storyBonusS : 0
    segments.push({
      type: 'chat',
      visibleCount: i + 1,
      durS: round(Math.min(CUTS.chatCeilS, Math.max(CUTS.chatFloorS, holds[i] * scale)) + bonus),
    })
    const isLast = i === chat.messages.length - 1
    if (!isLast && !skipBurstAfter(i)) {
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
