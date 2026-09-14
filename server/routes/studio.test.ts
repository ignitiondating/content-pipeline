import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { STARTER_TEMPLATES } from '../../shared/templates'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../generate/client', () => ({ generateStructured: mocks.generate }))
const root = mkdtempSync(path.join(tmpdir(), 'studio-api-'))
vi.stubEnv('STATE_DIR', root)
const { studio } = await import('./studio')
const { getDb } = await import('../db/index')
afterAll(() => { getDb().close(); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs() })
const post = (url: string, body: unknown) => studio.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

it('saves and starts a reusable template without an AI request', async () => {
  const template = { ...STARTER_TEMPLATES[0], name: 'Reviewed format' }
  const saved = await (await post('/templates', template)).json()
  expect(saved.template.id).not.toBe(template.id)
  const response = await post(`/templates/${saved.template.id}/start`, {})
  const { draft } = await response.json()
  expect(response.status).toBe(200)
  expect(draft.spec).toEqual(template.spec)
  expect(draft.status).toBe('draft')
  expect(mocks.generate).not.toHaveBeenCalled()
})

it('creates all requested edit versions as drafts while keeping the script unchanged', async () => {
  const file = 'library/broll/basketball/test.mp4'
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), 'test media')
  getDb().prepare("INSERT INTO assets (id,kind,path,sha256,tag,duration_s) VALUES ('test','broll',?,'test-hash','basketball',10)").run(file)
  const { spec, meta } = STARTER_TEMPLATES[0]
  const response = await post('/edit-variations', { spec, meta, count: 3 })
  const { drafts } = await response.json()
  expect(response.status).toBe(200)
  expect(drafts).toHaveLength(3)
  expect(new Set(drafts.map((d: { id: string }) => d.id)).size).toBe(3)
  for (const draft of drafts) { expect(draft.spec.chat).toEqual(spec.chat); expect(draft.status).toBe('draft') }
  expect((await post('/edit-variations', { spec, meta, count: 11 })).status).toBe(400)
})

it('rejects AI edits that reference missing media or drop the script', async () => {
  const { spec } = STARTER_TEMPLATES[0]
  mocks.generate.mockResolvedValueOnce({ segments: [{ type: 'broll', path: '../private.mp4', durS: 2 }] })
  expect((await post('/ai-edit', { spec, instruction: 'Make it punchy' })).status).toBe(400)
  mocks.generate.mockResolvedValueOnce({ segments: [{ type: 'chat', visibleCount: 1, durS: 2 }] })
  expect((await post('/ai-edit', { spec, instruction: 'Make it punchy' })).status).toBe(400)
})


it('creates hook tests with the exact script and pacing preserved by default', async () => {
  const { spec, meta } = STARTER_TEMPLATES[0]
  const master = { ...spec, segments: [{ type: 'chat', visibleCount: 1, durS: 3 }, { type: 'broll', path: 'library/broll/basketball/test.mp4', durS: 2 }] }
  const response = await post('/edit-variations', { spec: master, meta, count: 2, hooks: ['My first creative hook', 'My second creative hook'] })
  const { drafts } = await response.json()
  expect(response.status).toBe(200)
  expect(drafts.map((d: { spec: { hook: string } }) => d.spec.hook)).toEqual(['My first creative hook', 'My second creative hook'])
  for (const draft of drafts) {
    expect(draft.spec.chat).toEqual(spec.chat)
    expect(draft.spec.segments.map((s: { durS: number }) => s.durS)).toEqual([3, 2])
  }
  expect((await post('/edit-variations', { spec, meta, count: 2, hooks: ['Only one hook'] })).status).toBe(400)
})

it('allows hook-only versions without requiring a footage library', async () => {
  const { spec, meta } = STARTER_TEMPLATES[0]
  const response = await post('/edit-variations', { spec: { ...spec, brollTag: '3d' }, meta, count: 1, hooks: ['My hook'], shuffleFootage: false })
  const { drafts } = await response.json()
  expect(response.status).toBe(200)
  expect(drafts[0].spec.hook).toBe('My hook')
  expect(drafts[0].spec.chat).toEqual(spec.chat)
})

it('suggests script text without creating drafts or changing the template', async () => {
  const { spec } = STARTER_TEMPLATES[0]
  const original = structuredClone(spec)
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM drafts').get()
  const texts = spec.chat.messages.map((_, i) => `New line ${i + 1}`)
  mocks.generate.mockResolvedValueOnce({ texts })
  const response = await post('/ai-script', { hook: spec.hook, chat: spec.chat, instruction: 'A funny comeback' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ texts })
  expect(spec).toEqual(original)
  expect(getDb().prepare('SELECT COUNT(*) AS n FROM drafts').get()).toEqual(before)
})

it('rejects AI scripts with missing beats or empty text', async () => {
  const { spec } = STARTER_TEMPLATES[0]
  const body = { hook: spec.hook, chat: spec.chat, instruction: 'A new conversation' }
  mocks.generate.mockResolvedValueOnce({ texts: ['Too few messages'] })
  expect((await post('/ai-script', body)).status).toBe(400)
  mocks.generate.mockResolvedValueOnce({ texts: spec.chat.messages.map(() => '') })
  expect((await post('/ai-script', body)).status).toBe(400)
})

it('starts with existing B-roll selected and preserves saved footage choices', async () => {
  const file = 'library/broll/basketball/test.mp4'
  for (const template of STARTER_TEMPLATES) {
    const response = await post(`/templates/${template.id}/start`, {})
    const { draft } = await response.json()
    expect(draft.spec.brollPaths).toContain(file)
    const { resolveClipSegments } = await import('../../shared/timeline')
    if (template.spec.structure === 'cuts') {
      const footage = resolveClipSegments(draft.spec, draft.spec.brollPaths).filter((s) => s.type === 'broll')
      expect(footage.length).toBeGreaterThan(0)
      expect(footage.every((s) => s.path === file)).toBe(true)
    }
  }
  const template = { ...STARTER_TEMPLATES[0], spec: { ...STARTER_TEMPLATES[0].spec, brollPaths: ['library/broll/basketball/custom.mp4'] } }
  const { template: saved } = await (await post('/templates', template)).json()
  const { draft } = await (await post(`/templates/${saved.id}/start`, {})).json()
  expect(draft.spec.brollPaths).toEqual(template.spec.brollPaths)
})
