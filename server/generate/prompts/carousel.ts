import { z } from 'zod'
import { CarouselSpecSchema } from '../../../shared/formats/carousel'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildCarouselPrompt(
  brief: string,
  count: number,
  avoidHooks: string[],
  style?: 'screenshot' | 'zoom',
) {
  const spec: z.ZodType = style
    ? CarouselSpecSchema.extend({ style: z.literal(style) })
    : CarouselSpecSchema
  const styleLine = style
    ? `Use style "${style}" for EVERY variant.`
    : 'Two styles, pick per variant (mix them across a batch):'
  return {
    toolName: 'submit_carousels',
    schema: variantsSchema(spec),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: TikTok photo carousel — images posted as a photo set with a trending song; a viewer swipes to see how the conversation ends. ${styleLine}
- style "screenshot": fill "slides" with 2-3 full-app iMessage screens of the SAME conversation, 4-8 messages per slide, flowing across slides without repeating. Realism is the point: theme mostly "dark", lastMessageStatus "read" on the final slide when the payoff is an own message left on read.
- style "zoom": fill "chat" with ONE conversation of 5-10 short messages — each message becomes its own slide in the zoomed-DM look (huge bubbles, bare background). Every message must earn its swipe: short, punchy, the payoff last. Use chat.skin "instagram" + chat.storyReply true when the opener replies to her story (then message 1 IS that reply); "imessage" otherwise.
- meta.caption: a short QUESTION that invites comments ("She's a keeper?", "did I cook?"). Max ~60 chars.`,
      briefBlock(brief, count),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
