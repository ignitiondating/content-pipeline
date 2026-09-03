import { z } from 'zod'
import { ClipSpecSchema } from '../../../shared/formats/clip'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildClipPrompt(
  brief: string,
  count: number,
  avoidHooks: string[],
  structure?: 'overlay' | 'cuts',
  brollTag?: 'basketball' | '3d',
) {
  const overrides: Record<string, z.ZodType> = {}
  if (structure) overrides.structure = z.literal(structure)
  if (brollTag) overrides.brollTag = z.literal(brollTag)
  const spec: z.ZodType = Object.keys(overrides).length
    ? ClipSpecSchema.extend(overrides)
    : ClipSpecSchema
  const schema = variantsSchema(spec)
  const structureLine = structure
    ? `Use structure "${structure}" for EVERY variant.`
    : 'Two structures, pick per variant (mix them across a batch):'
  const brollLine = brollTag ? `\nUse brollTag "${brollTag}" for EVERY variant.` : ''
  return {
    toolName: 'submit_clips',
    schema,
    system: STYLE_GUIDE,
    user: [
      `FORMAT: 15-40 second vertical clip. ${structureLine}${brollLine}
- structure "overlay": continuous b-roll with a floating chat card revealing message by message. Lesson energy.
- structure "cuts": full-screen chat screenshots HARD-CUT with 2-3s b-roll hype bursts after every exchange — the payoff of each exchange earns the hype cut. Highlight-reel energy.
- hook: instruction framing, max ~50 chars: "Texting huzz *take notes*", "How to revive a dry convo *open your notebook*". This is THE retention device.
- hookPersists: true for lesson-style overlay clips, false for cuts (the hook rides only the intro burst).
- chat: ONE short exchange, 4-9 messages, sub-40s read time. The payoff message lands last.
- chat.skin: "instagram" (purple DM bubbles) when the scenario reads as an IG story-reply or DM slide; "imessage" otherwise. Mix across variants.
- chat.storyReply: true when skin is "instagram" AND the first message is an opener replying to her story (then write message 1 as that reply, e.g. "is your dad a pirate?").
- brollTag: "basketball" for confident/outcome energy, "3d" for absurd/comedic energy.
- withMusic: false by default (trending sound is added at post time).
- meta.caption: outcome or question caption ("did I cook?", "date secured"). Include one outcome hashtag.`,
      briefBlock(brief, count),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
