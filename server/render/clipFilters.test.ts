import { describe, expect, it } from 'vitest'
import { NORM, stillChain, videoChain, type VideoSource } from './clipFilters'

const source = (durS: number, uses = 0): VideoSource => ({ input: 0, durS, uses })
const looping = (durS: number): VideoSource => ({ input: 0, durS, uses: 0, looped: true })

describe('videoChain', () => {
  it('cuts a long clip to its beat and leaves the source alone', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 2.8 }, source(8), 's0')
    expect(chain.filter).toBe(
      `[0:v]trim=start=0.000:duration=2.800,setpts=PTS-STARTPTS,${NORM}[s0]`,
    )
    expect(chain).toMatchObject({ trimStartS: 0, trimEndS: 2.8 })
  })

  it('samples a later offset when the same clip plays a second time', () => {
    const file = source(8)
    videoChain({ path: 'a.mp4', durS: 2.8 }, file, 's0')
    const again = videoChain({ path: 'a.mp4', durS: 2.8 }, file, 's4')
    expect(again.trimStartS).toBeCloseTo(1.5, 3)
    expect(file.uses).toBe(2)
  })

  it('stretches a clip shorter than its beat instead of looping it', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 2.8 }, source(1.3), 's2')
    expect(chain.filter).toBe(
      `[0:v]setpts=2.1538*(PTS-STARTPTS),${NORM},trim=duration=2.800[s2]`,
    )
    expect(chain).toMatchObject({ trimStartS: 0, trimEndS: 1.3 })
  })

  it('plays exactly what the trim handles kept', () => {
    const chain = videoChain(
      { path: 'a.mp4', durS: 2.0, trimStartS: 3.5, trimEndS: 9 },
      source(12),
      's1',
    )
    expect(chain.filter).toContain('trim=start=3.500:duration=2.000')
    expect(chain.trimStartS).toBeCloseTo(3.5, 3)
  })

  it('fades after the normalization, timed from the start of the beat', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 2.8 }, source(8), 's0', { inS: 0.3, outS: 0.4 })
    expect(chain.filter.endsWith(',fade=t=in:st=0:d=0.300,fade=t=out:st=2.400:d=0.400[s0]')).toBe(true)
    expect(chain.filter.indexOf('format=yuv420p')).toBeLessThan(chain.filter.indexOf('fade='))
  })

  it('fades a stretched clip over its beat, not over the source range', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 2.8 }, source(1.3), 's0', { inS: 0, outS: 0.28 })
    expect(chain.filter).toContain('trim=duration=2.800,fade=t=out:st=2.520:d=0.280')
  })
})

describe('videoChain on a looping input', () => {
  it('plays straight through instead of slowing a short clip down', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 9.5 }, looping(3.4), 'b1')
    expect(chain.filter).toContain('trim=start=0.000:duration=9.500')
    expect(chain.filter).not.toContain('setpts=2')
    expect(chain.trimEndS).toBeCloseTo(9.5, 3)
  })

  it('still starts from the trim handle', () => {
    const chain = videoChain({ path: 'a.mp4', durS: 9.5, trimStartS: 1.2, trimEndS: 3 }, looping(3.4), 'b1')
    expect(chain.filter).toContain('trim=start=1.200:duration=9.500')
  })
})

describe('stillChain', () => {
  it('holds the image for its beat and dips it in and out', () => {
    expect(stillChain(5, 2.2, 's3', { inS: 0.22, outS: 0.22 })).toBe(
      `[5:v]${NORM},trim=duration=2.200,fade=t=in:st=0:d=0.220,fade=t=out:st=1.980:d=0.220[s3]`,
    )
  })

  it('emits a plain hold when there is no fade', () => {
    expect(stillChain(5, 2.2, 's3')).toBe(`[5:v]${NORM},trim=duration=2.200[s3]`)
  })
})
