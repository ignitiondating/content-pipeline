import { describe, expect, it } from 'vitest'
import { fadeFilters, fadeFor, fadeOpacityAt, fadesForSegments, suggestedFadeS } from './transitions'

describe('fadeFor', () => {
  it('hard-cuts a frame that asked for nothing', () => {
    expect(fadeFor({ durS: 2.8 })).toEqual({ inS: 0, outS: 0 })
  })

  it('fades both sides of a frame that pinned one', () => {
    expect(fadeFor({ durS: 3, fadeS: 0.5 })).toEqual({ inS: 0.5, outS: 0.5 })
  })

  it('never spends more than a third of the frame on one side', () => {
    const fade = fadeFor({ durS: 0.6, fadeS: 2 })
    expect(fade.inS).toBeLessThanOrEqual(0.2)
    expect(fade.outS).toBeLessThanOrEqual(0.2)
  })

  it('never fades the first frame in', () => {
    expect(fadeFor({ durS: 2.5, fadeS: 0.3 }, { isFirst: true })).toEqual({ inS: 0, outS: 0.3 })
  })

  it('keeps the reference story transition without being asked', () => {
    expect(fadeFor({ durS: 3.1 }, { story: 'out' }).outS).toBeCloseTo(0.6, 3)
    expect(fadeFor({ durS: 2.4 }, { story: 'in' }).inS).toBeCloseTo(0.45, 3)
  })

  it('lets the story beat be overridden, a hard cut included', () => {
    expect(fadeFor({ durS: 3.1, fadeS: 0.2 }, { story: 'out' }).outS).toBeCloseTo(0.2, 3)
    expect(fadeFor({ durS: 3.1, fadeS: 0 }, { story: 'out' }).outS).toBe(0)
  })
})

describe('fadesForSegments', () => {
  const beats = [
    { type: 'broll', durS: 2.5 },
    { type: 'chat', durS: 3.1, visibleCount: 1 },
    { type: 'chat', durS: 2.4, visibleCount: 2 },
    { type: 'broll', durS: 2.8, fadeS: 0.25 },
    { type: 'image', durS: 2.2 },
  ]

  it('leaves every beat alone except the one that asked and the story pair', () => {
    expect(fadesForSegments(beats, { storyFade: true }).map((f) => `${f.inS}/${f.outS}`)).toEqual([
      '0/0', '0/0.6', '0.45/0', '0.25/0.25', '0/0',
    ])
  })

  it('does not invent the story transition when there is no story', () => {
    expect(fadesForSegments(beats).map((f) => `${f.inS}/${f.outS}`)).toEqual([
      '0/0', '0/0', '0/0', '0.25/0.25', '0/0',
    ])
  })
})

describe('suggestedFadeS', () => {
  it('scales with the clip and stays inside sane bounds', () => {
    expect(suggestedFadeS(2.8)).toBeCloseTo(0.28, 2)
    expect(suggestedFadeS(0.6)).toBeCloseTo(0.1, 2)
    expect(suggestedFadeS(10)).toBeCloseTo(0.28, 2)
  })
})

describe('fadeFilters', () => {
  it('times the fade out from the end of the frame, not the source file', () => {
    expect(fadeFilters({ inS: 0.3, outS: 0.4 }, 2.8)).toBe(
      ',fade=t=in:st=0:d=0.300,fade=t=out:st=2.400:d=0.400',
    )
  })

  it('emits nothing for a hard cut', () => {
    expect(fadeFilters({ inS: 0, outS: 0 }, 2.8)).toBe('')
  })
})

describe('fadeOpacityAt', () => {
  it('is black at the edges and clear in the middle', () => {
    const fade = { inS: 0.4, outS: 0.4 }
    expect(fadeOpacityAt(fade, 3, 0)).toBeCloseTo(1, 3)
    expect(fadeOpacityAt(fade, 3, 1.5)).toBeCloseTo(0, 3)
    expect(fadeOpacityAt(fade, 3, 3)).toBeCloseTo(1, 3)
  })

  it('stays clear when there is no fade', () => {
    expect(fadeOpacityAt({ inS: 0, outS: 0 }, 3, 0)).toBe(0)
  })
})
