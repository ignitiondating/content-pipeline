import { Hono } from 'hono'
import { z } from 'zod'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/index'
import { BACKGROUNDS_DIR, BROLL_DIR, FILES_ROOT, MUSIC_DIR } from '../paths'
import { createPromoShot, getPromoShotSpec, PromoShotSpecSchema } from '../render/promoShot'
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
import { exportJob, listExports } from '../render/export'
import { enqueueRender, getJob, listJobs, jobOutputs } from '../render/jobs'

export const api = new Hono()

const asError = (error: unknown) =>
  error instanceof z.ZodError
    ? zodIssues(error)
    : error instanceof Error
      ? error.message
      : String(error)

// ---- generation ----------------------------------------------------------

const GenerateBody = z.object({
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
    const drafts = await generateBatch(body)
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
      caption: draft?.meta.caption ?? '(draft deleted)',
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

api.get('/exports', (c) => c.json({ exports: listExports() }))

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

api.get('/promo-shots/:id', (c) => {
  const spec = getPromoShotSpec(c.req.param('id'))
  return spec ? c.json({ spec }) : c.json({ error: 'not found or expired' }, 404)
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
