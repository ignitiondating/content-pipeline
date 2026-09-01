import { describe, expect, it } from 'vitest'
import { buildClipTimeline } from './timeline'
import { CLIP_LIMITS } from './formats/clip'
import type { ChatSpec } from './formats/chat'

const chat = (texts: Array<[from: 'me' | 'them', text: string]>): ChatSpec => ({
  theme: 'dark',
  contact: { name: 'Sofia' },
  statusBar: { time: '9:41', batteryPct: 80 },
  messages: texts.map(([from, text]) => ({ from, text })),
  lastMessageStatus: 'read',
})

describe('buildClipTimeline', () => {
  it('is deterministic for the same spec', () => {
    const spec = chat([
      ['them', 'so what are we'],
      ['me', 'the reason your phone battery dies'],
      ['them', 'omg'],
    ])
    expect(buildClipTimeline(spec)).toEqual(buildClipTimeline(spec))
  })

  it('inserts a typing state before every incoming message and none before own', () => {
    const { states } = buildClipTimeline(
      chat([
        ['them', 'hey'],
        ['me', 'hey yourself'],
        ['them', 'smooth'],
      ]),
    )
    const typingStates = states.filter((s) => s.typing)
    expect(typingStates).toHaveLength(2)
    expect(typingStates.map((s) => s.visibleCount)).toEqual([0, 2])
  })

  it('states are contiguous and end at durationS', () => {
    const { states, durationS } = buildClipTimeline(chat([['them', 'hello there']]))
    for (let i = 1; i < states.length; i++) {
      expect(states[i].tStartS).toBe(states[i - 1].tEndS)
    }
    expect(states[0].tStartS).toBe(0)
    expect(states[states.length - 1].tEndS).toBe(durationS)
  })

  it('clamps a long conversation to the max duration', () => {
    const long = 'a very long message that keeps going and going to inflate the hold time'
    const { durationS } = buildClipTimeline(
      chat(Array.from({ length: 20 }, (_, i) => [i % 2 ? 'me' : 'them', long])),
    )
    expect(durationS).toBeLessThanOrEqual(CLIP_LIMITS.maxDurationS + 0.05)
  })

  it('stretches a tiny conversation to the min duration', () => {
    const { durationS } = buildClipTimeline(
      chat([
        ['them', 'hi'],
        ['me', 'yo'],
      ]),
    )
    expect(durationS).toBeGreaterThanOrEqual(CLIP_LIMITS.minDurationS - 0.05)
  })
})
