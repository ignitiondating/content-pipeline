import { describe, expect, it } from 'vitest'
import {
  buildClipTimeline,
  buildCutsTimeline,
  fitToTarget,
  materializeSegments,
  reconcileSegments,
  resolveClipSegments,
  segmentsDurationS,
} from './timeline'
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

  it('honors a pinned chat hold and rescales the free ones to keep 33s', () => {
    const pinned = buildCutsTimeline(spec, { chatHoldsS: { '2': 5 } })
    const chats = pinned.segments.filter((s) => s.type === 'chat')
    expect(chats.find((s) => s.visibleCount === 2)!.durS).toBe(5)
    expect(pinned.durationS).toBeCloseTo(33, 1)
    // The other holds absorbed the difference instead of staying put.
    const free = buildCutsTimeline(spec).segments.filter((s) => s.type === 'chat')
    expect(chats.find((s) => s.visibleCount === 3)!.durS).not.toBe(
      free.find((s) => s.visibleCount === 3)!.durS,
    )
  })

  it('honors pinned b-roll beats, intro, outro and promo', () => {
    const t = buildCutsTimeline(spec, {
      introS: 4,
      outroS: 8,
      promoS: 3,
      brollBeatsS: { '0': 5 },
    })
    const brolls = t.segments.filter((s) => s.type === 'broll')
    expect(brolls[0].durS).toBe(4)
    expect(brolls[brolls.length - 1].durS).toBe(8)
    expect(brolls[1].durS).toBe(5)
    expect(t.segments.find((s) => s.type === 'promo')!.durS).toBe(3)
  })

  it('lets the clip run long when the pins alone exceed the target', () => {
    const t = buildCutsTimeline(spec, { introS: 15, outroS: 20, promoS: 15 })
    expect(t.durationS).toBeGreaterThan(33)
  })

  it('materializes into a list identical to the derived structure', () => {
    const clips = ['a.mp4', 'b.mp4', 'c.mp4']
    const frozen = materializeSegments(spec, clips)
    const derived = buildCutsTimeline(spec)
    expect(frozen.map((s) => s.type)).toEqual(derived.segments.map((s) => s.type))
    expect(frozen.map((s) => s.durS)).toEqual(derived.segments.map((s) => s.durS))
    expect(segmentsDurationS(frozen)).toBeCloseTo(derived.durationS, 3)
    // Every b-roll frame carries the clip it will actually play.
    expect(frozen.filter((s) => s.type === 'broll').every((s) => 'path' in s && s.path)).toBe(true)
  })

  it('reconciles a frozen edit when messages are deleted or added', () => {
    const frozen = materializeSegments(spec, ['a.mp4'])
    const shorter = { ...spec, messages: spec.messages.slice(0, 3) }
    const trimmed = reconcileSegments(frozen, shorter)
    expect(trimmed.every((s) => s.type !== 'chat' || s.visibleCount <= 3)).toBe(true)

    const longer = { ...spec, messages: [...spec.messages, { from: 'them' as const, text: 'new one' }] }
    const grown = reconcileSegments(frozen, longer)
    const chats = grown.filter((s) => s.type === 'chat')
    expect(chats.some((s) => s.visibleCount === longer.messages.length)).toBe(true)
  })

  it('fits a frozen edit back to the target runtime', () => {
    const stretched = materializeSegments(spec, ['a.mp4']).map((s) => ({ ...s, durS: s.durS * 2 }))
    expect(segmentsDurationS(fitToTarget(stretched))).toBeCloseTo(33, 1)
  })

  it('resolveClipSegments prefers the frozen edit over deriving', () => {
    const custom = [{ type: 'chat' as const, visibleCount: 1, durS: 9 }]
    expect(resolveClipSegments({ chat: spec, segments: custom }, [])).toBe(custom)
    expect(resolveClipSegments({ chat: spec }, ['a.mp4']).length).toBeGreaterThan(1)
  })

  it('keeps the total inside the clip limits', () => {
    const long = chat(
      Array.from({ length: 7 }, (_, i) => [i % 2 ? 'me' : 'them', 'a fairly long message to inflate the timing here']),
    )
    expect(buildCutsTimeline(long).durationS).toBeLessThanOrEqual(CLIP_LIMITS.maxDurationS + 0.15)
    expect(buildCutsTimeline(spec).durationS).toBeGreaterThanOrEqual(CLIP_LIMITS.minDurationS - 0.15)
  })
})
