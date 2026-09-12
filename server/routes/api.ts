import { Hono } from 'hono'
import { z } from 'zod'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/index'
import { BACKGROUNDS_DIR, BROLL_DIR, FILES_ROOT, MUSIC_DIR } from '../paths'
import { createPromoShot, getPromoShotSpec, PromoShotSpecSchema } from '../render/promoShot'
import { ChatShotSpecSchema, createChatShot, getChatShotSpec } from '../render/chatShot'
import { FORMATS, DRAFT_STATUSES } from '../../shared/formats/draft'
import { SLIDESHOW_STYLES } from '../../shared/formats/slideshow'
import { buildClipTimeline } from '../../shared/timeline'
import { DEFAULT_EXAMPLES, ExamplesSchema } from '../../shared/examples'
import { zodIssues } from '../../shared/validate'
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT, listAssets, rescanAssets } from '../assets/catalog'
import { chromiumAvailable } from '../capture/browser'
import { allSettings, getDraft, getSetting, listDrafts, setSetting, statusCounts, updateDraft } from '../db/repo'
import { MODELS } from '../generate/client'
import { generateBatch, regenerateDraft } from '../generate/service'
import { probeFfmpeg } from '../render/ffmpeg'
import { FILMSTRIP_FRAMES, filmstripFor } from '../render/filmstrip'
import { exportJob, listExports } from '../render/export'
import { writeMediaZip } from '../render/zip'
import { EXPORTS_DIR } from '../paths'
import { newId } from '../db/index'
import { enqueueRender, getJob, listJobs, jobOutputs } from '../render/jobs'

import { studio, videoTemplate } from './studio'
import { reconcileSegments } from '../../shared/timeline'
import type { ClipSpec } from '../../shared/formats/clip'

export const api = new Hono()
api.route('/', studio)

const asError = (error: unknown) =>
  error instanceof z.ZodError
    ? zodIssues(error)
    : error instanceof Error
      ? error.message
      : String(error)

// ---- generation ----------------------------------------------------------

const GenerateBody = z.object({
  templateId: z.string().optional(),
  hook: z.string().trim().max(80).optional(),
  format: z.enum(FORMATS),
  brief: z.string().max(2000).default(''),
  count: z.number().int().min(1).max(10).default(5),
  style: z.enum(SLIDESHOW_STYLES).optional(),
  structure: z.enum(['overlay', 'cuts']).optional(),
  brollTag: z.enum(['basketball', '3d']).optional(),
  carouselStyle: z.enum(['screenshot', 'zoom']).optional(),
  skin: z.enum(['imessage', 'instagram']).optional(),
  serial: z.boolean().default(false),
})

api.post('/generate', async (c) => {
  try {
    const body = GenerateBody.parse(await c.req.json())
    const template = body.templateId ? videoTemplate(body.templateId) : null
    if (template && (body.format !== 'clip' || body.serial)) throw new Error('Video templates require a non-serial clip batch')
    const generated = await generateBatch(template ? { ...body, structure: template.spec.structure,
      skin: template.spec.chat.skin, brollTag: template.spec.brollTag,
      brief: `${body.brief}${body.hook ? `\nBuild the script around this exact on-screen hook: ${body.hook}` : ''}\nTemplate: ${template.name}. ${template.description}` } : body)
    const drafts = template ? generated.map((draft) => {
      const written = draft.spec as ClipSpec
      return updateDraft(draft.id, { spec: { ...template.spec, hook: body.hook || written.hook,
        chat: { ...template.spec.chat, messages: written.chat.messages, contact: written.chat.contact },
        segments: template.spec.segments ? reconcileSegments(template.spec.segments, written.chat) : undefined } })
    }) : generated
    return c.json({ drafts })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- drafts --------------------------------------------------------------

api.get('/drafts', (c) => {
  const { status, format, seriesId, batchId } = c.req.query()
  return c.json({ drafts: listDrafts({ status, format, seriesId, batchId }) })
})

api.get('/drafts/:id', (c) => {
  const draft = getDraft(c.req.param('id'))
  return draft ? c.json({ draft }) : c.json({ error: 'not found' }, 404)
})

const PatchBody = z.object({
  spec: z.unknown().optional(),
  meta: z.unknown().optional(),
  status: z.enum(DRAFT_STATUSES).optional(),
})

api.patch('/drafts/:id', async (c) => {
  try {
    const body = PatchBody.parse(await c.req.json())
    return c.json({ draft: updateDraft(c.req.param('id'), body) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

api.post('/drafts/:id/regenerate', async (c) => {
  try {
    return c.json({ draft: await regenerateDraft(c.req.param('id')) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- specs (consumed by the /render/* capture pages) ---------------------

api.get('/specs/:id', (c) => {
  const draft = getDraft(c.req.param('id'))
  if (!draft) return c.json({ error: 'not found' }, 404)
  const clipTimeline =
    draft.format === 'clip'
      ? buildClipTimeline((draft.spec as { chat: Parameters<typeof buildClipTimeline>[0] }).chat)
      : null
  return c.json({ format: draft.format, spec: draft.spec, meta: draft.meta, clipTimeline })
})

// ---- render jobs ---------------------------------------------------------

api.post('/render', async (c) => {
  try {
    const { draftId } = z.object({ draftId: z.string() }).parse(await c.req.json())
    return c.json({ jobId: enqueueRender(draftId) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

api.get('/render', (c) => {
  // Jobs enriched with their draft's identity so the queue can show what
  // was rendered instead of an opaque id.
  const jobs = listJobs().map((job) => {
    const draft = getDraft(job.draft_id)
    return {
      ...job,
      caption: draft?.format === 'clip' ? (draft.spec as ClipSpec).hook : draft?.meta.caption ?? '(draft deleted)',
      format: draft?.format ?? job.kind,
      draftStatus: draft?.status ?? 'unknown',
      outputs: job.status === 'done' ? jobOutputs(job) : [],
    }
  })
  return c.json({ jobs })
})

api.get('/render/:jobId', (c) => {
  const job = getJob(c.req.param('jobId'))
  if (!job) return c.json({ error: 'not found' }, 404)
  return c.json({ job, outputs: job.status === 'done' ? jobOutputs(job) : [] })
})

api.post('/render/:jobId/export', (c) => {
  try {
    return c.json({ export: exportJob(c.req.param('jobId')) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- exports / library ---------------------------------------------------

api.get('/exports', (c) => c.json({ exports: listExports().map((item) => { const draft = getDraft(item.draftId); return { ...item, title: draft?.format === 'clip' ? (draft.spec as ClipSpec).hook : item.caption } }) }))

api.post('/exports/download-batch', async (c) => {
  try {
    const { draftIds } = z.object({ draftIds: z.array(z.string()).min(1).max(50) }).parse(await c.req.json())
    const exports = listExports()
    const entries = [...new Set(draftIds)].flatMap((id, index) => {
      const item = exports.find((item) => item.draftId === id)
      if (!item) throw new Error('A selected video has not been exported yet.')
      return item.files.filter((file) => file !== 'capcut-media.zip').map((file) => ({
        name: `video-${String(index + 1).padStart(2, '0')}/${file}`,
        file: path.join(item.dir, file),
      }))
    })
    const filename = `wingai-batch-${newId('download')}.zip`
    const directory = path.join(EXPORTS_DIR, 'batches')
    mkdirSync(directory, { recursive: true })
    writeMediaZip(path.join(directory, filename), entries)
    return c.json({ url: `/files/out/exports/batches/${filename}` })
  } catch (error) { return c.json({ error: asError(error) }, 400) }
})

api.post('/exports/:draftId/posted', (c) => {
  try {
    return c.json({ draft: updateDraft(c.req.param('draftId'), { status: 'posted' }) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- assets --------------------------------------------------------------

api.get('/assets', (c) => c.json({ assets: listAssets() }))

api.post('/assets/upload', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) return c.json({ error: 'multipart field "file" is required' }, 400)

    const kind = body.kind
    const ext = path.extname(file.name).toLowerCase()
    let dir: string
    if (kind === 'background') {
      if (!IMAGE_EXT.has(ext)) return c.json({ error: 'backgrounds take png/jpg/webp images' }, 400)
      dir = BACKGROUNDS_DIR
    } else if (kind === 'music') {
      if (!AUDIO_EXT.has(ext)) return c.json({ error: 'music takes mp3/m4a/wav/aac files' }, 400)
      dir = MUSIC_DIR
    } else if (kind === 'broll') {
      if (!VIDEO_EXT.has(ext)) return c.json({ error: 'b-roll takes mp4/mov/webm files' }, 400)
      if (body.tag !== 'basketball' && body.tag !== '3d') {
        return c.json({ error: 'b-roll needs tag "basketball" or "3d"' }, 400)
      }
      dir = path.join(BROLL_DIR, body.tag)
    } else {
      return c.json({ error: 'kind must be background, music or broll' }, 400)
    }

    const safe = file.name.replace(/[^\w.-]+/g, '-')
    let target = path.join(dir, safe)
    if (existsSync(target)) target = path.join(dir, `${Date.now()}-${safe}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(target, Buffer.from(await file.arrayBuffer()))
    await rescanAssets()
    const relative = path.relative(FILES_ROOT, target)
    const asset = listAssets().find((a) => a.path === relative)
    return c.json({ asset })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- promo shots (WingAI screenshot generator) ---------------------------

api.post('/promo-shots', async (c) => {
  try {
    const spec = PromoShotSpecSchema.parse(await c.req.json())
    return c.json({ asset: await createPromoShot(spec) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

api.post('/chat-shots', async (c) => {
  try {
    const spec = ChatShotSpecSchema.parse(await c.req.json())
    return c.json({ asset: await createChatShot(spec) })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

api.get('/chat-shots/:id', (c) => {
  const spec = getChatShotSpec(c.req.param('id'))
  return spec ? c.json({ spec }) : c.json({ error: 'not found or expired' }, 404)
})

api.get('/promo-shots/:id', (c) => {
  const spec = getPromoShotSpec(c.req.param('id'))
  return spec ? c.json({ spec }) : c.json({ error: 'not found or expired' }, 404)
})

// The thumbnail strip behind the trim handles. Cached per file, so the
// first request pays for FFmpeg and the rest are served from disk.
api.get('/assets/filmstrip', async (c) => {
  const assetPath = c.req.query('path') ?? ''
  const listed = listAssets().some((a) => a.path === assetPath && !a.missing)
  if (!listed) return c.json({ error: 'unknown asset' }, 404)
  try {
    const { file, durationS } = await filmstripFor(assetPath)
    return c.json({
      url: `/files/${path.relative(FILES_ROOT, file).split(path.sep).join('/')}`,
      frames: FILMSTRIP_FRAMES,
      durationS,
    })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

api.post('/assets/rescan', async (c) => {
  try {
    return c.json(await rescanAssets())
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- examples (Generate page sample content, persisted in settings) ------

api.get('/examples', (c) => {
  const stored = getSetting('examples')
  if (stored) {
    try {
      return c.json({ examples: ExamplesSchema.parse(JSON.parse(stored)) })
    } catch {
      // fall through and re-seed when the stored value no longer validates
    }
  }
  setSetting('examples', JSON.stringify(DEFAULT_EXAMPLES))
  return c.json({ examples: DEFAULT_EXAMPLES })
})

api.put('/examples', async (c) => {
  try {
    const examples = ExamplesSchema.parse(await c.req.json())
    setSetting('examples', JSON.stringify(examples))
    return c.json({ examples })
  } catch (error) {
    return c.json({ error: asError(error) }, 400)
  }
})

// ---- settings / health ---------------------------------------------------

api.get('/settings', (c) =>
  c.json({ settings: allSettings(), models: MODELS, apiKeySet: Boolean(process.env.ANTHROPIC_API_KEY) }),
)

api.put('/settings', async (c) => {
  const body = z.record(z.string(), z.string()).parse(await c.req.json())
  for (const [key, value] of Object.entries(body)) setSetting(key, value)
  return c.json({ settings: allSettings() })
})

/** Lightweight status counts for the pipeline steps bar. */
api.get('/counts', (c) => {
  const active = getDb()
    .prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')")
    .get() as { n: number }
  return c.json({ drafts: statusCounts(), activeJobs: active.n })
})

api.get('/health', async (c) => {
  const [ffmpeg, chromium] = await Promise.all([
    probeFfmpeg().catch((e: Error) => ({ ok: false, error: e.message })),
    chromiumAvailable(),
  ])
  return c.json({
    ffmpeg,
    chromium,
    apiKeySet: Boolean(process.env.ANTHROPIC_API_KEY),
    counts: statusCounts(),
  })
})
