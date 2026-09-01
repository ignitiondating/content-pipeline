import { z } from 'zod'
import { ChatSpecSchema } from './chat'

export const BROLL_TAGS = ['basketball', '3d'] as const

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
  chat: ChatSpecSchema,
  brollTag: z.enum(BROLL_TAGS),
  /** Mux a music track from library/music. Trending sound is added in-app at post time. */
  withMusic: z.boolean(),
})

export type ClipSpec = z.infer<typeof ClipSpecSchema>

export const CLIP_LIMITS = {
  minDurationS: 15,
  maxDurationS: 40,
  hookOnlyIntroS: 3,
  tailS: 1.6,
} as const
