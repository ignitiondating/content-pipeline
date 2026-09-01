import { z } from 'zod'
import { DraftMetaSchema } from '../../../shared/formats/draft'
import { HASHTAG_POOL } from '../styleGuide'

export function variantsSchema<S extends z.ZodType>(spec: S) {
  return z.object({
    variants: z.array(z.object({ spec, meta: DraftMetaSchema })).min(1),
  })
}

export function briefBlock(brief: string, count: number): string {
  return [
    `Generate exactly ${count} variant(s). Each variant must be a DIFFERENT scenario — different premise, different contact, different payoff.`,
    brief.trim() ? `Creative brief from the operator:\n${brief.trim()}` : '',
    `Hashtags: pick 3-5 per variant, mixing outcome tags from this pool with at most one generic tag: ${HASHTAG_POOL.join(' ')}.`,
    'songSuggestion: name one currently-trending-style TikTok sound that fits the mood (the operator picks the real sound in-app).',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function avoidBlock(hooks: string[]): string {
  if (hooks.length === 0) return ''
  return `DO NOT repeat these premises/captions from recent posts (write something clearly different):\n${hooks
    .map((h) => `- ${h}`)
    .join('\n')}`
}
