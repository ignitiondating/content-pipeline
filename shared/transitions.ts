import type { FadeStyle } from './formats/clip'

/**
 * How long a frame fades to and from black. Felipe's note on the reference
 * edit: the cut between the basketball and a photo reads as a jump, and a
 * short dip to black is what makes them feel like one video. So every frame
 * gets one, scaled to its own length — a 6s outro can afford more than a
 * 1.5s reaction screen.
 */

/** Fraction of the frame spent fading, per style, then clamped. */
const RATIO: Record<FadeStyle, number> = { off: 0, soft: 0.1, strong: 0.15 }
const MIN_S: Record<FadeStyle, number> = { off: 0, soft: 0.1, strong: 0.15 }
const MAX_S: Record<FadeStyle, number> = { off: 0, soft: 0.28, strong: 0.4 }

/** The reference's one soft cut: the story screen dips out, her reply lifts in. */
const STORY_OUT_S = 0.6
const STORY_IN_S = 0.45

export const DEFAULT_FADE_STYLE: FadeStyle = 'soft'

export interface FadeContext {
  style?: FadeStyle
  /** The first frame never fades in: the hook is composited after the concat,
   *  so it would be left hanging over black, and a black frame 1 costs views. */
  isFirst?: boolean
  isLast?: boolean
  /** The story-reply transition, which is longer than a regular cut. */
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
  const style = context.style ?? DEFAULT_FADE_STYLE
  // Both sides together can never eat more than two thirds of the frame, or a
  // short beat would spend its whole life dark.
  const cap = Math.max(0, Math.floor((segment.durS / 3) * 1000) / 1000)
  const auto = style === 'off' ? 0 : Math.min(MAX_S[style], Math.max(MIN_S[style], segment.durS * RATIO[style]))
  const pinned = segment.fadeS
  const storyOut = style === 'off' ? 0 : STORY_OUT_S
  const storyIn = style === 'off' ? 0 : STORY_IN_S

  const outBase = context.story === 'out' ? (pinned ?? storyOut) : (pinned ?? auto)
  const inBase = context.story === 'in' ? (pinned ?? storyIn) : (pinned ?? auto)

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
 * encode. The reference's story transition is just the two beats around it.
 */
export function fadesForSegments(
  segments: Array<{ type: string; durS: number; fadeS?: number; visibleCount?: number }>,
  options: { style?: FadeStyle; storyFade?: boolean } = {},
): Fade[] {
  const style = options.style ?? DEFAULT_FADE_STYLE
  return segments.map((segment, i) =>
    fadeFor(segment, {
      style,
      isFirst: i === 0,
      isLast: i === segments.length - 1,
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
