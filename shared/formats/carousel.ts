import { z } from 'zod'
import { ChatSpecSchema } from './chat'

/**
 * Format 1 — TikTok photo carousel. Two styles:
 * - 'screenshot': 2-3 full-app iMessage screenshots (slides), each one
 *   screen of the same conversation.
 * - 'zoom': ONE conversation (chat) split into one slide per message,
 *   rendered in the zoomed-DM look (huge bubbles, bare background,
 *   optional Instagram skin + story-reply opener).
 */
export const CarouselSpecSchema = z
  .object({
    style: z.enum(['screenshot', 'zoom']).default('screenshot'),
    /** screenshot style: the chat screens, in swipe order. */
    slides: z.array(ChatSpecSchema).min(1).max(4).optional(),
    /** zoom style: the single conversation, one slide per message. */
    chat: ChatSpecSchema.optional(),
  })
  .refine((s) => (s.style === 'zoom' ? Boolean(s.chat) : Boolean(s.slides?.length)), {
    message: 'screenshot style requires slides; zoom style requires chat',
  })

export type CarouselSpec = z.infer<typeof CarouselSpecSchema>

/** How many images this carousel exports. */
export function carouselSlideCount(spec: CarouselSpec): number {
  return spec.style === 'zoom' ? (spec.chat?.messages.length ?? 0) : (spec.slides?.length ?? 0)
}
