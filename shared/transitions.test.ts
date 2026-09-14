import { describe, expect, it } from 'vitest'
import { fadeFilters, fadeFor, fadeOpacityAt } from './transitions'

describe('fadeFor', () => {
  it('scales the fade with the frame and keeps it inside the bounds', () => {
    expect(fadeFor({ durS: 2.8 }).outS).toBeCloseTo(0.28, 3)
    expect(fadeFor({ durS: 0.6 }).outS).toBeCloseTo(0.1, 3)
    expect(fadeFor({ durS: 6.5 }).outS).toBeCloseTo(0.28, 3)
    expect(fadeFor({ durS: 6.5 }, { style: 'strong' }).outS).toBeCloseTo(0.4, 3)
  })

  it('never spends more than a third of the frame on one side', () => {
    const fade = fadeFor({ durS: 0.2 }, { style: 'strong' })
    expect(fade.inS).toBeLessThanOrEqual(0.2 / 3 + 1e-9)
    expect(fade.outS).toBeLessThanOrEqual(0.2 / 3 + 1e-9)
  })

  it('is off when the style is off, the story transition included', () => {
    expect(fadeFor({ durS: 3 }, { style: 'off' })).toEqual({ inS: 0, outS: 0 })
    expect(fadeFor({ durS: 3 }, { style: 'off', story: 'out' }).outS).toBe(0)
  })

  it('lets a frame pin its own fade, including a hard cut', () => {
    expect(fadeFor({ durS: 3, fadeS: 0.5 })).toEqual({ inS: 0.5, outS: 0.5 })
    expect(fadeFor({ durS: 3, fadeS: 0 })).toEqual({ inS: 0, outS: 0 })
    expect(fadeFor({ durS: 3, fadeS: 0.2 }, { story: 'out' }).outS).toBeCloseTo(0.2, 3)
  })

  it('never fades the first frame in', () => {
    expect(fadeFor({ durS: 2.5 }, { isFirst: true }).inS).toBe(0)
    expect(fadeFor({ durS: 2.5 }, { isFirst: true }).outS).toBeGreaterThan(0)
  })

  it('keeps the reference story transition as the default for that beat', () => {
    expect(fadeFor({ durS: 3.1 }, { story: 'out' }).outS).toBeCloseTo(0.6, 3)
    expect(fadeFor({ durS: 2.4 }, { story: 'in' }).inS).toBeCloseTo(0.45, 3)
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
    expect(fadeOpacityAt(fade, 3, 0.4)).toBeCloseTo(0, 3)
    expect(fadeOpacityAt(fade, 3, 1.5)).toBeCloseTo(0, 3)
    expect(fadeOpacityAt(fade, 3, 2.6)).toBeCloseTo(0, 3)
    expect(fadeOpacityAt(fade, 3, 3)).toBeCloseTo(1, 3)
  })

  it('stays clear when there is no fade', () => {
    expect(fadeOpacityAt({ inS: 0, outS: 0 }, 3, 0)).toBe(0)
  })
})
