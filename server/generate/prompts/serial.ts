import { z } from 'zod'
import { SerialPlanSchema } from '../../../shared/formats/serial'
import type { Format } from '../../../shared/formats/draft'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock } from './common'

export function buildSerialPrompt(format: Format, brief: string, avoidHooks: string[]) {
  return {
    toolName: 'submit_serial',
    schema: z.object({ plan: SerialPlanSchema }),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: comment-gated serial — one story split into 2 parts (3 only if the theme truly sustains it), every part in the "${format}" format.
MECHANIC (this is the whole point):
- Part 1 (role "cliffhanger") cuts the story at the most painful possible moment. The conversation stops right before the answer/payoff.
- keyword: ONE odd, memorable word in CAPS related to the story ("JOB", "SHOWER", "FAMOUS"). Odd keywords double as the hook.
- Part 1's meta.caption MUST end with: comment "<KEYWORD>" for part 2 — link in bio. Set meta.gateKeyword on every part.
- Part 2 (role "payoff") delivers — and must stand alone as a strong post for someone who never saw part 1.
- Fantasy beats realistic: the stories that sustain a gate are slightly unhinged ("she found out I'm famous", "the cheating reveal").`,
      briefBlock(brief, 1),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
