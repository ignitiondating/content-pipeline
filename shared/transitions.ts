/**
 * A fade to black belongs to the clip, not to the video: which cut needs
 * softening is an editing decision per beat, so nothing fades unless that
 * beat says so. The one exception is the story-reply transition, which the
 * reference format has always carried.
 */

/** The reference's one soft cut: the story screen dips out, her reply lifts in. */
const STORY_OUT_S = 0.6
const STORY_IN_S = 0.45

export interface FadeContext {
  /** The first frame never fades in: the hook is composited after the concat,
   *  so it would be left hanging over black, and a black frame 1 costs views. */
  isFirst?: boolean
  /** The story-reply transition, the one fade a clip gets without asking. */
  story?: 'out' | 'in'
}

export interface Fade {
  inS: number
  outS: number
}

const round = (v: number) => Math.round(v * 1000) / 1000

/**
 * The single source of truth for both the render and the preview: FFmpeg
 * builds its `fade` filters from this, and the storyboard dims the same frame
 * by the same amount, so what plays in the editor is what gets encoded.
 */
export function fadeFor(segment: { durS: number; fadeS?: number }, context: FadeContext = {}): Fade {
  // Both sides together can never eat more than two thirds of the frame, or a
  // short beat would spend its whole life dark.
  const cap = Math.max(0, Math.floor((segment.durS / 3) * 1000) / 1000)
  const pinned = segment.fadeS
  const outBase = pinned ?? (context.story === 'out' ? STORY_OUT_S : 0)
  const inBase = pinned ?? (context.story === 'in' ? STORY_IN_S : 0)
  return {
    inS: context.isFirst ? 0 : round(Math.min(cap, Math.max(0, inBase))),
    outS: round(Math.min(cap, Math.max(0, outBase))),
  }
}

/** The fade suffix for one FFmpeg chain, with `st` relative to the frame. */
export function fadeFilters(fade: Fade, durS: number): string {
  const parts: string[] = []
  if (fade.inS > 0) parts.push(`fade=t=in:st=0:d=${fade.inS.toFixed(3)}`)
  if (fade.outS > 0) {
    parts.push(`fade=t=out:st=${Math.max(0, durS - fade.outS).toFixed(3)}:d=${fade.outS.toFixed(3)}`)
  }
  return parts.length ? `,${parts.join(',')}` : ''
}

/**
 * How dark the frame is at `offset` seconds in — the preview's counterpart of
 * the two FFmpeg filters above. 0 = fully visible, 1 = black.
 */
export function fadeOpacityAt(fade: Fade, durS: number, offset: number): number {
  const into = Math.max(0, Math.min(durS, offset))
  const rising = fade.inS > 0 ? 1 - into / fade.inS : 0
  const falling = fade.outS > 0 ? 1 - (durS - into) / fade.outS : 0
  return Math.max(0, Math.min(1, Math.max(rising, falling)))
}

/**
 * Every frame's fade in one pass — the list the renderer turns into filters
 * and the storyboard turns into opacity, so the preview can't drift from the
 * encode. Frames that pinned no fade simply hard-cut.
 */
export function fadesForSegments(
  segments: Array<{ type: string; durS: number; fadeS?: number; visibleCount?: number }>,
  options: { storyFade?: boolean } = {},
): Fade[] {
  return segments.map((segment, i) =>
    fadeFor(segment, {
      isFirst: i === 0,
      story:
        options.storyFade && segment.type === 'chat'
          ? segment.visibleCount === 1
            ? 'out'
            : segment.visibleCount === 2
              ? 'in'
              : undefined
          : undefined,
    }),
  )
}

/** A sensible fade for a clip the creator just switched on, from its length. */
export function suggestedFadeS(durS: number): number {
  return Math.round(Math.min(0.28, Math.max(0.1, durS * 0.1)) * 100) / 100
}
