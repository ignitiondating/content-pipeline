import { z } from 'zod'
import { SlideshowSpecSchema, SLIDESHOW_STYLES } from '../../../shared/formats/slideshow'
import { STYLE_GUIDE } from '../styleGuide'
import { avoidBlock, briefBlock, variantsSchema } from './common'

const STYLE_NOTES: Record<(typeof SLIDESHOW_STYLES)[number], string> = {
  shoot_your_shot: `"Shoot your shot" slides: a mini-lesson in 4-6 slides on landing a specific kind of opener. Slide 1 = the promise ("how to text huzz *take notes*"), middle slides = the moves (each with a 1-2 message chatSnippet example), last slide = the outcome + subtle CTA mentioning WingAI.`,
  comedic: `Comedic slideshow: an escalating joke across 4-7 slides about texting culture (left on read, double texting, the group chat reviewing your texts). Punchline on the last slide. chatSnippets welcome when the joke needs a receipt.`,
  date_ideas: `Date-idea slideshow: 5-8 slides, each ONE concrete, cheap, specific date idea (kicker = "date idea #N"). Ideas must be actually good — screenshot-and-save quality, that's what makes this format rank. Last slide: CTA to save the post.`,
}

export function buildSlideshowPrompt(
  style: (typeof SLIDESHOW_STYLES)[number],
  brief: string,
  count: number,
  avoidHooks: string[],
) {
  const spec = SlideshowSpecSchema.extend({ style: z.literal(style) })
  return {
    toolName: 'submit_slideshows',
    schema: variantsSchema(spec),
    system: STYLE_GUIDE,
    user: [
      `FORMAT: image slideshow 9:16 (text-forward slides over a photo background).\n${STYLE_NOTES[style]}\n- Titles max ~8 words, punchy. Lines are short — this is read in under 3 seconds per slide.\n- meta.caption follows the instruction framing ("*take notes*" energy) or a question.`,
      briefBlock(brief, count),
      avoidBlock(avoidHooks),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
