import { ClipSpecSchema } from '../../../shared/formats/clip'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildClipPrompt(brief: string, count: number, avoidHooks: string[]) {
  return {
    toolName: 'submit_clips',
    schema: variantsSchema(ClipSpecSchema),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: 15-40 second vertical clip. B-roll (basketball highlights or 3D animation) fills the frame; the chat card animates message by message on top; the hook is burned into frame 1.
- hook: instruction framing, max ~50 chars: "Texting huzz *take notes*", "How to revive a dry convo *open your notebook*". This is THE retention device.
- hookPersists: true for lesson-style clips, false when the chat itself is the star.
- chat: ONE short exchange, 4-9 messages, sub-40s read time. The payoff message lands last.
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
