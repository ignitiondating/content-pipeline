import { z } from 'zod'
import { ChatSpecSchema } from './chat'

export const BROLL_TAGS = ['basketball', '3d'] as const

const DurS = z.number().min(0.2).max(20)
/**
 * Seconds of fade to black on each side of this frame. Absent is a hard cut:
 * which beat needs softening is decided clip by clip, never video-wide.
 */
const FadeS = z.number().min(0).max(2).optional()

// The frames of an edit, named once so both structures share them: the 'cuts'
// timeline uses all four, the 'overlay' background track the visual two.
export const ChatSegmentSchema = z.object({
  type: z.literal('chat'),
  visibleCount: z.number().int().min(1),
  durS: DurS,
  fadeS: FadeS,
})
export const PromoSegmentSchema = z.object({ type: z.literal('promo'), durS: DurS, fadeS: FadeS })
export const BrollSegmentSchema = z.object({
  type: z.literal('broll'),
  path: z.string().max(300),
  durS: DurS,
  trimStartS: z.number().min(0).optional(),
  trimEndS: z.number().min(0).optional(),
  fadeS: FadeS,
})
export const ImageSegmentSchema = z.object({
  type: z.literal('image'),
  path: z.string().max(300),
  durS: DurS,
  fadeS: FadeS,
})

export const EditedSegmentSchema = z.discriminatedUnion('type', [
  ChatSegmentSchema,
  PromoSegmentSchema,
  BrollSegmentSchema,
  ImageSegmentSchema,
])

/** Background beats of an 'overlay' clip: footage and stills, no chat screens. */
export const BackgroundSegmentSchema = z.discriminatedUnion('type', [BrollSegmentSchema, ImageSegmentSchema])

/**
 * One visual state of the floating card: a message reveal, or the typing beat
 * that precedes an incoming one. `visibleCount` 0 is the empty thread.
 */
export const OverlayRevealSchema = z.object({
  visibleCount: z.number().int().min(0),
  typing: z.boolean().default(false),
  durS: DurS,
})

/**
 * The 'overlay' edit, frozen: two parallel tracks. They are kept apart from
 * `segments` because every helper there assumes the frames add up to the
 * runtime, which is only true of the reveal track here.
 */
export const OverlayEditSchema = z.object({
  bg: z.array(BackgroundSegmentSchema).min(1).max(40),
  reveals: z.array(OverlayRevealSchema).min(1).max(80),
})

/**
 * Format 3 — 15–40s vertical clip: b-roll fills the frame, hook text is
 * burned into frame 1, and the chat exchange reveals message by message
 * with a typing indicator before each incoming message.
 */
export const ClipSpecSchema = z.object({
  /** Burned into frame 1, e.g. "Texting huzz *take notes*". */
  hook: z.string().min(1).max(80),
  /** Keep the hook on screen the whole clip (true) or only the first 3s. */
  hookPersists: z.boolean(),
  /**
   * 'overlay': chat card floats over continuous b-roll, revealing message by
   * message. 'cuts': full-screen chat screenshots hard-cut with 2-3s b-roll
   * hype bursts (the @fivestaryra "shoot your shot" reference format).
   */
  structure: z.enum(['overlay', 'cuts']).default('overlay'),
  chat: ChatSpecSchema,
  brollTag: z.enum(BROLL_TAGS),
  /** Mux a music track from library/music. Trending sound is added in-app at post time. */
  withMusic: z.boolean(),
  /**
   * Exact clips for this video, in order. Without it the renderer walks the
   * tag's files by filename (nba-01, nba-02, …), which stays the default.
   */
  brollPaths: z.array(z.string().max(300)).max(20).optional(),
  /**
   * Per-slot replacements: burst ordinal → clip path. Wins over brollPaths
   * and the filename order for that one beat, so swapping the intro clip
   * doesn't reshuffle the rest of the edit.
   */
  brollSlots: z.record(z.string(), z.string().max(300)).optional(),
  /** Exact photo for the story-reply opener; otherwise rotation picks one. */
  storyImagePath: z.string().max(300).optional(),
  /**
   * The edit, frozen. Absent means the structure is derived from the chat
   * (the default); present means the operator moved, trimmed or inserted
   * something and this list is now the truth.
   */
  segments: z.array(EditedSegmentSchema).max(60).optional(),
  /**
   * The same, for the 'overlay' structure. Absent means the card timing comes
   * from the conversation and one clip plays underneath, as it always has.
   */
  overlay: OverlayEditSchema.optional(),
  /**
   * Per-beat duration overrides in seconds. Keys are stable across text
   * edits: chat holds by visibleCount, b-roll beats by burst ordinal.
   * Anything absent is computed by the solver as usual.
   */
  timing: z
    .object({
      // Same range as a frozen frame's durS, so retiming a beat can't depend
      // on whether the edit happens to be frozen yet.
      chatHoldsS: z.record(z.string(), z.number().min(0.4).max(20)).optional(),
      brollBeatsS: z.record(z.string(), z.number().min(0.4).max(20)).optional(),
      introS: z.number().min(0.4).max(20).optional(),
      outroS: z.number().min(0.4).max(20).optional(),
      promoS: z.number().min(0.4).max(20).optional(),
    })
    .optional(),
})

export type ClipSpec = z.infer<typeof ClipSpecSchema>

export const CLIP_LIMITS = {
  minDurationS: 15,
  maxDurationS: 40,
  hookOnlyIntroS: 3,
  tailS: 1.6,
} as const
