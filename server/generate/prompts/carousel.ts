import { z } from 'zod'
import { CarouselSpecSchema } from '../../../shared/formats/carousel'
import { ChatSpecSchema } from '../../../shared/formats/chat'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildCarouselPrompt(
  brief: string,
  count: number,
  avoidHooks: string[],
  style?: 'screenshot' | 'zoom',
  skin?: 'imessage' | 'instagram',
) {
  const overrides: Record<string, z.ZodType> = {}
  if (style) overrides.style = z.literal(style)
  // Skin can only be forced alongside the zoom style; purple bubbles inside
  // the full iMessage app chrome would break the screenshot illusion.
  if (skin && style === 'zoom') overrides.chat = ChatSpecSchema.extend({ skin: z.literal(skin) })
  const spec: z.ZodType = Object.keys(overrides).length
    ? CarouselSpecSchema.extend(overrides)
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
- style "zoom": fill "chat" with ONE conversation of 5-10 short messages — each message becomes its own slide in the zoomed-DM look (huge bubbles, bare background). Every message must earn its swipe: short, punchy, the payoff last. chat.skin: ${skin && style === 'zoom' ? `use "${skin}".` : `DEFAULT to "instagram" (the reference look; "imessage" only for explicitly SMS scenarios).`} Set chat.storyReply true when the opener replies to her story (then message 1 IS that reply).
- meta.caption: a short QUESTION that invites comments ("She's a keeper?", "did I cook?"). Max ~60 chars.`,
      briefBlock(brief, count),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
