import { z } from 'zod'
import { ChatMessageSchema } from './chat'

export const SLIDESHOW_STYLES = ['shoot_your_shot', 'comedic', 'date_ideas'] as const

export const SlideSchema = z.object({
  /** Small label above the title, e.g. "date idea #3". */
  kicker: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  /** Body lines rendered under the title. */
  lines: z.array(z.string().max(160)).max(6).optional(),
  /** Optional 1–3 message chat snippet rendered as a floating card. */
  chatSnippet: z.array(ChatMessageSchema).min(1).max(3).optional(),
})

/**
 * Format 2 — image slideshow 9:16: text-forward slides over rotating
 * backgrounds from library/backgrounds (falls back to a gradient).
 */
export const SlideshowSpecSchema = z.object({
  style: z.enum(SLIDESHOW_STYLES),
  slides: z.array(SlideSchema).min(2).max(10),
})

export type Slide = z.infer<typeof SlideSchema>
export type SlideshowSpec = z.infer<typeof SlideshowSpecSchema>
