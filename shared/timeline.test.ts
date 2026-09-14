import { describe, expect, it } from 'vitest'
import {
  buildClipTimeline,
  buildCutsTimeline,
  fitToTarget,
  materializeSegments,
  reconcileSegments,
  fitBackground,
  overlayDurationS,
  reconcileReveals,
  resolveBrollForBursts,
  resolveClipSegments,
  resolveOverlayEdit,
  retimeBackground,
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

describe('resolveBrollForBursts', () => {
  const loose = ['library/broll/basketball/nba-01.mp4', 'library/broll/basketball/nba-02.mp4', 'library/broll/basketball/nba-03.mp4']
  const filed = [
    'library/broll/basketball/beats/play-a.mp4',
    'library/broll/basketball/beats/play-b.mp4',
    'library/broll/basketball/intro/tip-off.mp4',
    'library/broll/basketball/outro/buzzer.mp4',
  ]
  const names = (paths: string[]) => paths.map((p) => p.split('/').pop())

  it('keeps filename order and closes on the last file when nothing is filed by role', () => {
    expect(names(resolveBrollForBursts(4, loose))).toEqual([
      'nba-01.mp4', 'nba-02.mp4', 'nba-03.mp4', 'nba-03.mp4',
    ])
  })

  it('opens from intro, rotates the between-message plays, and closes from outro', () => {
    expect(names(resolveBrollForBursts(4, filed))).toEqual([
      'tip-off.mp4', 'play-a.mp4', 'play-b.mp4', 'buzzer.mp4',
    ])
  })

  it('never spends an opening or closing clip between the messages', () => {
    const between = resolveBrollForBursts(6, filed).slice(1, -1)
    expect(between.some((p) => p.includes('/intro/') || p.includes('/outro/'))).toBe(false)
  })

  it('falls back to the between-message clips when a role has no footage', () => {
    const onlyBeats = filed.filter((p) => p.includes('/beats/'))
    expect(names(resolveBrollForBursts(3, onlyBeats))).toEqual([
      'play-a.mp4', 'play-b.mp4', 'play-b.mp4',
    ])
  })

  it('lets a pinned slot win over the role', () => {
    expect(resolveBrollForBursts(3, filed, { '0': 'library/broll/3d/loop.mp4' })[0]).toBe(
      'library/broll/3d/loop.mp4',
    )
  })

  it('has no clip to give when the library is empty', () => {
    expect(resolveBrollForBursts(2, [])).toEqual(['', ''])
  })
})

describe('overlay edit', () => {
  const spec = chat([
    ['them', 'so what are we'],
    ['me', 'the reason your phone battery dies'],
    ['them', 'omg'],
  ])
  const clips = ['library/broll/basketball/nba-01.mp4', 'library/broll/basketball/nba-02.mp4']
  it('reproduces the derived timeline when nothing has been edited', () => {
    const resolved = resolveOverlayEdit({ chat: spec }, clips)
    expect(resolved.states).toEqual(buildClipTimeline(spec).states)
    expect(resolved.durationS).toBeCloseTo(buildClipTimeline(spec).durationS, 3)
  })

  it('backs an untouched clip with one piece of footage covering the whole runtime', () => {
    const resolved = resolveOverlayEdit({ chat: spec }, clips)
    expect(resolved.bg).toHaveLength(1)
    expect(resolved.bg[0].durS).toBeCloseTo(resolved.durationS, 3)
    expect(resolved.bg[0].path).toBe(clips[0])
  })

  it('keeps a frozen reveal track and covers it with the frozen footage', () => {
    const overlay = {
      bg: [
        { type: 'broll' as const, path: clips[0], durS: 4 },
        { type: 'broll' as const, path: clips[1], durS: 4 },
      ],
      reveals: [
        { visibleCount: 0, typing: false, durS: 0.5 },
        { visibleCount: 0, typing: true, durS: 1.1 },
        { visibleCount: 1, typing: false, durS: 3 },
        { visibleCount: 2, typing: false, durS: 3 },
        { visibleCount: 3, typing: false, durS: 4 },
      ],
    }
    const resolved = resolveOverlayEdit({ chat: spec, overlay }, clips)
    expect(resolved.reveals).toBe(overlay.reveals)
    expect(resolved.durationS).toBeCloseTo(11.6, 3)
    expect(resolved.bg.reduce((sum, b) => sum + b.durS, 0)).toBeCloseTo(11.6, 3)
    expect(resolved.states.at(-1)?.tEndS).toBeCloseTo(11.6, 3)
  })

  it('never leaves the footage short when a message is retimed', () => {
    const overlay = {
      bg: [{ type: 'broll' as const, path: clips[0], durS: 8 }],
      reveals: [
        { visibleCount: 0, typing: false, durS: 0.5 },
        { visibleCount: 1, typing: false, durS: 12 },
      ],
    }
    const resolved = resolveOverlayEdit({ chat: chat([['me', 'hey']]), overlay }, clips)
    expect(resolved.bg.reduce((sum, b) => sum + b.durS, 0)).toBeCloseTo(resolved.durationS, 3)
  })

  it('states run back to back and finish on the runtime', () => {
    const { states, durationS } = resolveOverlayEdit({ chat: spec }, clips)
    states.forEach((state, i) => {
      if (i > 0) expect(state.tStartS).toBeCloseTo(states[i - 1].tEndS, 3)
    })
    expect(states.at(-1)?.tEndS).toBeCloseTo(durationS, 3)
  })
})

describe('fitBackground', () => {
  const clip = (durS: number) => ({ type: 'broll' as const, path: 'a.mp4', durS })

  it('covers the runtime exactly, scaling every clip', () => {
    const fitted = fitBackground([clip(4), clip(6)], 20)
    expect(fitted.reduce((sum, b) => sum + b.durS, 0)).toBeCloseTo(20, 3)
    expect(fitted[0].durS).toBeCloseTo(8, 3)
  })

  it('keeps the cuts when it has to squeeze', () => {
    const fitted = fitBackground([clip(10), clip(10), clip(10)], 9)
    expect(fitted).toHaveLength(3)
    expect(fitted.reduce((sum, b) => sum + b.durS, 0)).toBeCloseTo(9, 3)
  })
})

describe('reconcileReveals', () => {
  /** The reveal track as a readable shape: t3 = typing before message 3. */
  const shape = (reveals: { visibleCount: number; typing: boolean }[]) =>
    reveals.map((r) => (r.typing ? `t${r.visibleCount + 1}` : `m${r.visibleCount}`)).join('-')

  it('adds a reveal, with its typing beat, for a message that gained none', () => {
    const conversation = chat([['me', 'hey'], ['them', 'hi']])
    const reveals = reconcileReveals(
      [{ visibleCount: 0, typing: false, durS: 0.5 }, { visibleCount: 1, typing: false, durS: 2 }],
      conversation,
    )
    expect(shape(reveals)).toBe('m0-m1-t2-m2')
  })

  it('drops reveals whose message is gone and keeps one lead-in', () => {
    const reveals = reconcileReveals(
      [
        { visibleCount: 0, typing: false, durS: 0.5 },
        { visibleCount: 1, typing: false, durS: 2 },
        { visibleCount: 2, typing: false, durS: 2 },
        { visibleCount: 3, typing: false, durS: 2 },
      ],
      chat([['me', 'only one left']]),
    )
    expect(shape(reveals)).toBe('m0-m1')
  })

  it('leaves a complete track alone', () => {
    const conversation = chat([['them', 'hey'], ['me', 'hey yourself']])
    const reveals = resolveOverlayEdit({ chat: conversation }, []).reveals
    expect(shape(reconcileReveals(reveals, conversation))).toBe(shape(reveals))
  })
})

describe('retimeBackground', () => {
  const clip = (path: string, durS: number) => ({ type: 'broll' as const, path, durS })

  it('takes the time from the next clip so the runtime holds', () => {
    const bg = retimeBackground([clip('a', 5), clip('b', 5)], 0, 7)
    expect(bg.map((b) => b.durS)).toEqual([7, 3])
  })

  it('takes from the previous clip when retiming the last one', () => {
    const bg = retimeBackground([clip('a', 5), clip('b', 5)], 1, 8)
    expect(bg.map((b) => b.durS)).toEqual([2, 8])
  })

  it('never shrinks a neighbour below the floor', () => {
    const bg = retimeBackground([clip('a', 5), clip('b', 1)], 0, 20)
    expect(bg.map((b) => b.durS)).toEqual([5.6, 0.4])
  })

  it('leaves a lone clip alone: it has to cover the whole video', () => {
    const bg = [clip('a', 12)]
    expect(retimeBackground(bg, 0, 4)).toBe(bg)
  })
})
