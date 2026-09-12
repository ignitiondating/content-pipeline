import { describe, expect, it } from 'vitest'
import { STARTER_TEMPLATES, remixClip } from './templates'
import { ClipSpecSchema } from './formats/clip'

describe('edit variations', () => {
  it('preserves human wording and non-footage beats, and leaves the source untouched', () => {
    const spec = structuredClone(STARTER_TEMPLATES[0].spec)
    spec.segments = [
      { type: 'chat', visibleCount: 1, durS: 4 },
      { type: 'broll', path: 'old.mp4', durS: 3, trimStartS: 100, trimEndS: 103 },
      { type: 'image', path: 'photo.png', durS: 2 },
    ]
    const original = structuredClone(spec)
    const next = remixClip(spec, [{ path: 'new.mp4', durationS: 8 }], () => 0.5)
    expect(next.chat).toEqual(original.chat)
    expect(next.segments?.[0]).toEqual(original.segments?.[0])
    expect(next.segments?.[2]).toEqual(original.segments?.[2])
    expect(next.segments?.[1]).toMatchObject({ path: 'new.mp4', trimStartS: 2.5, trimEndS: 5.5 })
    expect(spec).toEqual(original)
    expect(ClipSpecSchema.safeParse(next).success).toBe(true)
  })
  it('selects one background for overlays and rejects an empty footage pool', () => {
    expect(remixClip(STARTER_TEMPLATES[1].spec, [{ path: 'custom.mov' }]).brollPaths).toEqual(['custom.mov'])
    expect(() => remixClip(STARTER_TEMPLATES[0].spec, [])).toThrow('Add B-roll')
  })
})
