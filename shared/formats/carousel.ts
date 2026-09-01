import { z } from 'zod'
import { ChatSpecSchema } from './chat'

/**
 * Format 1 — TikTok photo carousel: 2–3 chat screenshots posted as a photo
 * set with a question caption and a trending-song suggestion.
 */
export const CarouselSpecSchema = z.object({
  slides: z.array(ChatSpecSchema).min(1).max(4),
})

export type CarouselSpec = z.infer<typeof CarouselSpecSchema>
