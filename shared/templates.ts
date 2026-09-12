import { z } from 'zod'
import { ClipSpecSchema, type ClipSpec } from './formats/clip'
import { DraftMetaSchema } from './formats/draft'
import { DEFAULT_EXAMPLES } from './examples'
import { resolveClipSegments } from './timeline'

export const VideoTemplateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(240),
  spec: ClipSpecSchema,
  meta: DraftMetaSchema,
})
export type VideoTemplate = z.infer<typeof VideoTemplateSchema>

export const STARTER_TEMPLATES: VideoTemplate[] = ['cuts', 'overlay'].map((structure) => ({
  id: `starter-${structure}`,
  name: structure === 'cuts' ? 'Shoot your shot' : 'Floating conversation',
  description: structure === 'cuts'
    ? 'Chat reveals, B-roll cutaways, and a product moment. Every beat is editable.'
    : 'A conversation unfolds over continuous footage.',
  spec: ClipSpecSchema.parse({ hook: DEFAULT_EXAMPLES.hook, hookPersists: false,
    structure, chat: DEFAULT_EXAMPLES.clipChat, brollTag: 'basketball', withMusic: false }),
  meta: { caption: DEFAULT_EXAMPLES.hook, hashtags: ['#takenotes', '#wingai'], songSuggestion: '' },
}))

/** Randomize the edit only. Never alter a human's script or mutate the source. */
export function remixClip(spec: ClipSpec, assets: { path: string; durationS?: number | null }[], random = Math.random, options: { varyPacing?: boolean } = {}): ClipSpec {
  if (!assets.length) throw new Error('Add B-roll to the library before making edit variations.')
  const shuffled = [...assets]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  if (spec.structure === 'overlay') return { ...spec, brollPaths: [shuffled[0].path] }
  let clip = 0
  const segments = resolveClipSegments(spec, assets.map((a) => a.path)).map((s) => {
    if (s.type !== 'broll') return { ...s }
    const asset = shuffled[clip++ % shuffled.length]
    const durS = options.varyPacing === false ? s.durS : Math.round(Math.min(20, Math.max(0.4, s.durS * (0.85 + random() * 0.3))) * 10) / 10
    const available = asset.durationS ?? durS
    const trimStartS = Math.floor(random() * Math.max(0, available - durS) * 10) / 10
    return { ...s, path: asset.path, durS, trimStartS, trimEndS: Math.min(available, trimStartS + durS) }
  })
  return ClipSpecSchema.parse({ ...spec, segments })
}
