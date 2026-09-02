import { z } from 'zod'
import { DraftMetaSchema, SPEC_SCHEMAS, type AnySpec, type Draft, type DraftMeta, type Format } from '../../shared/formats/draft'
import { zodIssues } from '../../shared/validate'
import type { SlideshowSpec } from '../../shared/formats/slideshow'
import type { ClipSpec } from '../../shared/formats/clip'
import { SLIDESHOW_STYLES } from '../../shared/formats/slideshow'
import { createBatch, createDraft, createSeries, getDraft, recentHooks, updateDraft } from '../db/repo'
import { currentModel, generateStructured, StructuredOutputError } from './client'
import { buildCarouselPrompt } from './prompts/carousel'
import { buildClipPrompt } from './prompts/clip'
import { buildSerialPrompt } from './prompts/serial'
import { buildSlideshowPrompt } from './prompts/slideshow'

export interface GenerateRequest {
  format: Format
  brief: string
  count: number
  /** Only for slideshows. */
  style?: (typeof SLIDESHOW_STYLES)[number]
  /** Only for clips; omitted = Claude mixes both structures across the batch. */
  structure?: 'overlay' | 'cuts'
  /** Only for clips; omitted = Claude picks the b-roll tag per variant. */
  brollTag?: 'basketball' | '3d'
  /** Comment-gated serial: generates 2-3 linked parts instead of variants. */
  serial?: boolean
}

interface VariantPrompt {
  system: string
  user: string
  toolName: string
  schema: z.ZodType<{ variants: Array<{ spec: AnySpec; meta: DraftMeta }> }>
}

/**
 * Runs a variants prompt, salvaging the valid variants when the model gets
 * one wrong twice in a row — a single bad variant no longer sinks the batch.
 */
async function generateVariants(
  prompt: VariantPrompt,
  format: Format,
): Promise<Array<{ spec: AnySpec; meta: DraftMeta }>> {
  try {
    return (await generateStructured(prompt)).variants
  } catch (error) {
    if (!(error instanceof StructuredOutputError)) throw error
    const itemSchema = z.object({ spec: SPEC_SCHEMAS[format], meta: DraftMetaSchema })
    const raw = (error.raw as { variants?: unknown[] })?.variants ?? []
    const salvaged = raw
      .map((v) => itemSchema.safeParse(v))
      .filter((r) => r.success)
      .map((r) => r.data as { spec: AnySpec; meta: DraftMeta })
    if (salvaged.length === 0) {
      throw new Error(`generation failed validation twice: ${zodIssues(error.zodError)}`)
    }
    return salvaged
  }
}

function promptFor(request: GenerateRequest, avoid: string[]): VariantPrompt {
  // Each builder's schema narrows spec to its own format; erased to AnySpec
  // here so one code path can create drafts for all three.
  if (request.format === 'carousel')
    return buildCarouselPrompt(request.brief, request.count, avoid) as unknown as VariantPrompt
  if (request.format === 'clip')
    return buildClipPrompt(
      request.brief,
      request.count,
      avoid,
      request.structure,
      request.brollTag,
    ) as unknown as VariantPrompt
  return buildSlideshowPrompt(
    request.style ?? 'shoot_your_shot',
    request.brief,
    request.count,
    avoid,
  ) as unknown as VariantPrompt
}

export async function generateBatch(request: GenerateRequest): Promise<Draft[]> {
  const model = currentModel()

  if (request.serial) {
    const prompt = buildSerialPrompt(request.format, request.brief, recentHooks('serial'))
    const { plan } = await generateStructured(prompt)
    const batchId = createBatch({ format: 'serial', brief: request.brief, model, variantCount: plan.parts.length })
    const seriesId = createSeries(plan.keyword, plan.title)
    return plan.parts.map((part, index) =>
      createDraft({
        batchId,
        format: part.format,
        spec: part.spec,
        meta: { ...part.meta, gateKeyword: part.meta.gateKeyword ?? plan.keyword },
        seriesId,
        partIndex: index,
        partRole: part.role,
      }),
    )
  }

  const prompt = promptFor(request, recentHooks(request.format))
  const variants = await generateVariants(prompt, request.format)
  const batchId = createBatch({
    format: request.format,
    brief: request.brief,
    model,
    variantCount: variants.length,
  })
  return variants.map((variant) =>
    createDraft({ batchId, format: request.format, spec: variant.spec, meta: variant.meta }),
  )
}

/** Replaces a draft's spec+meta with a fresh variant that avoids its current hook. */
export async function regenerateDraft(draftId: string): Promise<Draft> {
  const draft = getDraft(draftId)
  if (!draft) throw new Error(`draft ${draftId} not found`)
  const avoid = [draft.meta.caption, ...recentHooks(draft.format)]
  const style = draft.format === 'slideshow' ? (draft.spec as SlideshowSpec).style : undefined
  const structure = draft.format === 'clip' ? (draft.spec as ClipSpec).structure : undefined
  const brollTag = draft.format === 'clip' ? (draft.spec as ClipSpec).brollTag : undefined
  const prompt = promptFor(
    { format: draft.format, brief: 'Fresh take, same general vibe as before.', count: 1, style, structure, brollTag },
    avoid,
  )
  const [variant] = await generateVariants(prompt, draft.format)
  return updateDraft(draftId, { spec: variant.spec, meta: variant.meta, status: 'draft' })
}
