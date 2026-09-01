import { CarouselSpecSchema } from '../../../shared/formats/carousel'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildCarouselPrompt(brief: string, count: number, avoidHooks: string[]) {
  return {
    toolName: 'submit_carousels',
    schema: variantsSchema(CarouselSpecSchema),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: TikTok photo carousel — 2-3 chat screenshots posted as a photo set with a trending song.
Each slide is one screen of the SAME conversation, in order; a viewer swipes to see how it ends. Slide 1 must hook (the bold text or the setup), the last slide is the payoff.
- 4-8 messages per slide, conversation flows across slides without repeating messages.
- theme: prefer "dark" (most competitor screenshots are dark mode), occasionally "light".
- meta.caption: a short QUESTION that invites comments ("She's a keeper?", "did I cook?"). Max ~60 chars.
- Use lastMessageStatus "read" on the final slide when the payoff is an own message left on read for comedy, otherwise "none".`,
      briefBlock(brief, count),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
