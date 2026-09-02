import { ClipSpecSchema } from '../../../shared/formats/clip'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

export function buildClipPrompt(brief: string, count: number, avoidHooks: string[]) {
  return {
    toolName: 'submit_clips',
    schema: variantsSchema(ClipSpecSchema),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: 15-40 second vertical clip. Two structures, pick per variant (mix them across a batch):
- structure "overlay": continuous b-roll with a floating chat card revealing message by message. Lesson energy.
- structure "cuts": full-screen chat screenshots HARD-CUT with 2-3s b-roll hype bursts after every exchange — the payoff of each exchange earns the hype cut. Highlight-reel energy.
- hook: instruction framing, max ~50 chars: "Texting huzz *take notes*", "How to revive a dry convo *open your notebook*". This is THE retention device.
- hookPersists: true for lesson-style overlay clips, false for cuts (the hook rides only the intro burst).
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
