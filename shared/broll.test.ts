import { describe, expect, it } from 'vitest'
import { byRole, roleOfPath } from './broll'

describe('roleOfPath', () => {
  it('reads the role from the folder the clip sits in', () => {
    expect(roleOfPath('library/broll/basketball/intro/tip-off.mp4')).toBe('intro')
    expect(roleOfPath('library/broll/basketball/outro/buzzer.mp4')).toBe('outro')
    expect(roleOfPath('library/broll/3d/beats/loop-02.mp4')).toBe('beats')
  })

  it('leaves clips dropped straight into the tag folder as between-message beats', () => {
    expect(roleOfPath('library/broll/basketball/nba-01.mp4')).toBe('beats')
  })

  it('does not mistake a file named like a role for a folder', () => {
    expect(roleOfPath('library/broll/basketball/intro.mp4')).toBe('beats')
  })

  it('falls back for anything outside the b-roll tree', () => {
    expect(roleOfPath('library/backgrounds/woman.png')).toBe('beats')
  })
})

describe('byRole', () => {
  it('splits the clips into pools, keeping their order', () => {
    expect(
      byRole([
        'library/broll/basketball/beats/b2.mp4',
        'library/broll/basketball/intro/a.mp4',
        'library/broll/basketball/beats/b1.mp4',
      ]),
    ).toEqual({
      intro: ['library/broll/basketball/intro/a.mp4'],
      beats: ['library/broll/basketball/beats/b2.mp4', 'library/broll/basketball/beats/b1.mp4'],
      outro: [],
    })
  })
})
