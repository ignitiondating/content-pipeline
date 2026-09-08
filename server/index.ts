import { serve } from '@hono/node-server'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { Hono } from 'hono'
import { loadEnv } from './env'
import {
  API_PORT,
  BACKGROUNDS_DIR,
  BROLL_DIR,
  DIST_DIR,
  EXPORTS_DIR,
  FILES_ROOT,
  MUSIC_DIR,
  PROMO_DIR,
  RENDER_DIR,
} from './paths'
import { getDb } from './db/index'
import { api } from './routes/api'
import { sweepWorkdirs } from './render/jobs'
import { closeBrowser } from './capture/browser'

loadEnv()
for (const dir of [
  RENDER_DIR,
  EXPORTS_DIR,
  path.join(BROLL_DIR, 'basketball'),
  path.join(BROLL_DIR, '3d'),
  BACKGROUNDS_DIR,
  MUSIC_DIR,
  PROMO_DIR,
]) {
  mkdirSync(dir, { recursive: true })
}
getDb()
sweepWorkdirs()

const app = new Hono()

app.route('/api', api)

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
}

// Previews and downloads: only library/ and out/ under the state root.
app.get('/files/*', (c) => {
  const requested = decodeURIComponent(c.req.path.replace(/^\/files\//, ''))
  if (!requested.startsWith('library/') && !requested.startsWith('out/')) {
    return c.text('forbidden', 403)
  }
  const full = path.resolve(FILES_ROOT, requested)
  if (!full.startsWith(path.resolve(FILES_ROOT) + path.sep)) return c.text('forbidden', 403)
  const stat = statSync(full, { throwIfNoEntry: false })
  if (!stat?.isFile()) return c.text('not found', 404)
  const mime = MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream'
  return c.body(Readable.toWeb(createReadStream(full)) as ReadableStream, 200, {
    'Content-Type': mime,
    'Content-Length': String(stat.size),
  })
})

// Production: serve the built SPA (dev uses the Vite server instead).
if (existsSync(DIST_DIR)) {
  const indexHtml = readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8')
  app.get('/assets/*', (c) => {
    const full = path.resolve(DIST_DIR, decodeURIComponent(c.req.path.slice(1)))
    if (!full.startsWith(DIST_DIR + path.sep)) return c.text('forbidden', 403)
    const stat = statSync(full, { throwIfNoEntry: false })
    if (!stat?.isFile()) return c.text('not found', 404)
    const ext = path.extname(full).toLowerCase()
    const mime =
      ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : (MIME[ext] ?? 'application/octet-stream')
    return c.body(Readable.toWeb(createReadStream(full)) as ReadableStream, 200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  })
  // SPA fallback covers the studio pages and the /render/* capture pages.
  app.get('*', (c) => c.html(indexHtml))
}

serve({ fetch: app.fetch, port: API_PORT }, (info) => {
  console.log(`content-pipeline listening on http://localhost:${info.port}`)
})

process.on('SIGINT', async () => {
  await closeBrowser()
  process.exit(0)
})
