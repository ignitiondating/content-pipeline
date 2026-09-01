import { z } from 'zod'
import { DraftMetaSchema } from './draft'
import { CarouselSpecSchema } from './carousel'
import { SlideshowSpecSchema } from './slideshow'
import { ClipSpecSchema } from './clip'

export const SERIAL_ROLES = ['cliffhanger', 'payoff', 'bonus'] as const

const SerialPartBase = {
  role: z.enum(SERIAL_ROLES),
  meta: DraftMetaSchema,
}

/**
 * Format 4 — comment-gated serial. Not a render format: a plan whose parts
 * ARE specs of formats 1–3, linked by a series id. Part 1 must end on a
 * cliffhanger and its caption must carry the gate keyword.
 */
export const SerialPlanSchema = z.object({
  /** Odd, memorable comment keyword in CAPS, e.g. "JOB", "SHOWER". */
  keyword: z.string().min(2).max(20),
  title: z.string().min(1).max(80),
  parts: z
    .array(
      z.discriminatedUnion('format', [
        z.object({ format: z.literal('carousel'), spec: CarouselSpecSchema, ...SerialPartBase }),
        z.object({ format: z.literal('slideshow'), spec: SlideshowSpecSchema, ...SerialPartBase }),
        z.object({ format: z.literal('clip'), spec: ClipSpecSchema, ...SerialPartBase }),
      ]),
    )
    .min(2)
    .max(3),
})

export type SerialPlan = z.infer<typeof SerialPlanSchema>
