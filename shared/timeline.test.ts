import { describe, expect, it } from 'vitest'
import { buildClipTimeline, buildCutsTimeline } from './timeline'
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

describe('buildCutsTimeline', () => {
  const spec = chat([
    ['them', 'so what are we'],
    ['me', 'the reason your phone battery dies'],
    ['them', 'omg'],
    ['me', 'come over and find out'],
    ['them', 'ok fine'],
  ])

  it('is deterministic and opens/closes with b-roll', () => {
    const a = buildCutsTimeline(spec)
    expect(a).toEqual(buildCutsTimeline(spec))
    expect(a.segments[0].type).toBe('broll')
    expect(a.segments[a.segments.length - 1].type).toBe('broll')
  })

  it('adds one chat screen per message, each revealing one more', () => {
    const { segments } = buildCutsTimeline(spec)
    const chats = segments.filter((s) => s.type === 'chat')
    expect(chats.map((s) => s.visibleCount)).toEqual([1, 2, 3, 4, 5])
  })

  it('follows the reference structure: promo on the first answer, later comebacks pop', () => {
    const { segments } = buildCutsTimeline(spec)
    const types = segments.map((s) => s.type).join(',')
    // msg1(me at index 1) is the first answer to her → burst+promo before it;
    // msg3(me at index 3) is a later comeback → pops with no burst.
    expect(types).toBe('broll,chat,broll,promo,chat,broll,chat,chat,broll,chat,broll')
    const promo = segments.find((s) => s.type === 'promo')!
    expect(promo.visibleCount).toBe(1)
  })

  it('skips the burst on a them→me instant comeback that is not the promo target', () => {
    const comeback = chat([
      ['me', 'shot my shot'],
      ['them', 'bold of you'],
      ['me', 'that is the brand'],
      ['them', 'ok and?'],
      ['me', 'friday, you and me'],
    ])
    const types = buildCutsTimeline(comeback).segments.map((s) => s.type).join(',')
    // them(1)→me(2) is the first answer → promo; them(3)→me(4) pops.
    expect(types).toBe('broll,chat,broll,chat,broll,promo,chat,broll,chat,chat,broll')
  })

  it('holds the story-reply opener longer than the same screen without a story', () => {
    const story = { ...spec, skin: 'instagram' as const, storyReply: true }
    const storyChat1 = buildCutsTimeline(story).segments.find((s) => s.type === 'chat')!
    const plainChat1 = buildCutsTimeline(spec).segments.find((s) => s.type === 'chat')!
    expect(storyChat1.durS).toBeGreaterThan(plainChat1.durS + 0.4)
  })

  it('lands exactly on the 33s reference runtime for typical chats', () => {
    expect(buildCutsTimeline(spec).durationS).toBeCloseTo(33, 1)
    const story = { ...spec, skin: 'instagram' as const, storyReply: true }
    expect(buildCutsTimeline(story).durationS).toBeCloseTo(33, 1)
  })

  it('keeps the total inside the clip limits', () => {
    const long = chat(
      Array.from({ length: 7 }, (_, i) => [i % 2 ? 'me' : 'them', 'a fairly long message to inflate the timing here']),
    )
    expect(buildCutsTimeline(long).durationS).toBeLessThanOrEqual(CLIP_LIMITS.maxDurationS + 0.15)
    expect(buildCutsTimeline(spec).durationS).toBeGreaterThanOrEqual(CLIP_LIMITS.minDurationS - 0.15)
  })
})
