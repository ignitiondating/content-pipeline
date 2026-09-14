import { describe, expect, it } from 'vitest'
import { STARTER_TEMPLATES, remixClip } from './templates'
import { ClipSpecSchema } from './formats/clip'
import { DEFAULT_EXAMPLES } from './examples'

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

describe('remixClip on a frozen overlay', () => {
  const base = ClipSpecSchema.parse({
    hook: 'Texting huzz', hookPersists: false, structure: 'overlay',
    chat: DEFAULT_EXAMPLES.clipChat, brollTag: 'basketball', withMusic: false,
    overlay: {
      bg: [
        { type: 'broll', path: 'old-a.mp4', durS: 6, trimStartS: 1, trimEndS: 7 },
        { type: 'broll', path: 'old-b.mp4', durS: 6 },
      ],
      reveals: [{ visibleCount: 0, typing: false, durS: 0.5 }, { visibleCount: 1, typing: false, durS: 11.5 }],
    },
  })
  const assets = [{ path: 'new-a.mp4', durationS: 20 }, { path: 'new-b.mp4', durationS: 20 }]

  it('reassigns the background clips instead of quietly doing nothing', () => {
    const remixed = remixClip(base, assets, () => 0.5)
    const paths = remixed.overlay!.bg.map((b) => b.type === 'broll' && b.path)
    expect(paths.every((p) => p && p.startsWith('new-'))).toBe(true)
    expect(remixed.overlay!.reveals).toEqual(base.overlay!.reveals)
  })

  it('retrims to the new clip rather than keeping the old handles', () => {
    const remixed = remixClip(base, assets, () => 0)
    const first = remixed.overlay!.bg[0]
    expect(first.type === 'broll' && first.trimStartS).toBe(0)
    expect(first.type === 'broll' && first.trimEndS).toBeCloseTo(6, 3)
  })

  it('leaves the source spec untouched', () => {
    remixClip(base, assets, () => 0.5)
    expect(base.overlay!.bg[0].type === 'broll' && base.overlay!.bg[0].path).toBe('old-a.mp4')
  })
})
