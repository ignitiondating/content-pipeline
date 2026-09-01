import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { loadEnv } from './env'
import { API_PORT, EXPORTS_DIR, PROJECT_ROOT, RENDER_DIR } from './paths'
import { getDb } from './db/index'
import { api } from './routes/api'
import { sweepWorkdirs } from './render/jobs'
import { closeBrowser } from './capture/browser'

loadEnv()
mkdirSync(RENDER_DIR, { recursive: true })
mkdirSync(EXPORTS_DIR, { recursive: true })
getDb()
sweepWorkdirs()

const app = new Hono()

app.route('/api', api)

// Previews and downloads: only library/ and out/ are exposed.
app.use(
  '/files/*',
  serveStatic({
    root: path.relative(process.cwd(), PROJECT_ROOT) || '.',
    rewriteRequestPath: (p) => {
      const clean = p.replace(/^\/files\//, '')
      if (!clean.startsWith('library/') && !clean.startsWith('out/')) return '/__forbidden__'
      return `/${clean}`
    },
  }),
)

serve({ fetch: app.fetch, port: API_PORT }, (info) => {
  console.log(`content-pipeline API listening on http://localhost:${info.port}`)
})

process.on('SIGINT', async () => {
  await closeBrowser()
  process.exit(0)
})
