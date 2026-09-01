import { z } from 'zod'
import { CarouselSpecSchema } from './carousel'
import { SlideshowSpecSchema } from './slideshow'
import { ClipSpecSchema } from './clip'

export const FORMATS = ['carousel', 'slideshow', 'clip'] as const
export type Format = (typeof FORMATS)[number]

export const DRAFT_STATUSES = [
  'draft',
  'approved',
  'rejected',
  'rendered',
  'exported',
  'posted',
] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

/** Posting metadata attached to every draft; exported as caption.txt. */
export const DraftMetaSchema = z.object({
  /** The first line of the post caption; also the dedupe key ("hook"). */
  caption: z.string().min(1).max(150),
  hashtags: z.array(z.string().regex(/^#[^\s#]+$/)).min(2).max(8),
  songSuggestion: z.string().max(120),
  /** Comment-gating: "comment KEYWORD for part 2 — link in bio". */
  gateKeyword: z.string().max(20).optional(),
})

export type DraftMeta = z.infer<typeof DraftMetaSchema>

export const SPEC_SCHEMAS = {
  carousel: CarouselSpecSchema,
  slideshow: SlideshowSpecSchema,
  clip: ClipSpecSchema,
} as const

export type SpecFor<F extends Format> = z.infer<(typeof SPEC_SCHEMAS)[F]>
export type AnySpec = SpecFor<Format>

export interface Draft {
  id: string
  batchId: string | null
  format: Format
  spec: AnySpec
  meta: DraftMeta
  status: DraftStatus
  seriesId: string | null
  partIndex: number | null
  partRole: 'cliffhanger' | 'payoff' | 'bonus' | null
  hookText: string
  createdAt: string
  updatedAt: string
  postedAt: string | null
}
