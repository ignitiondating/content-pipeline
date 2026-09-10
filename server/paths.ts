import path from 'node:path'

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')

// Read-only pieces always live in the repo/image.
export const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'ffmpeg')
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'data', 'migrations')
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist')

// Mutable state (db, assets, renders) roots at STATE_DIR when set — on
// Railway that's the persistent volume (/data); locally it's the repo.
const STATE_ROOT = process.env.STATE_DIR ?? PROJECT_ROOT

export const DATA_DIR = path.join(STATE_ROOT, 'data')
export const DB_PATH = path.join(DATA_DIR, 'studio.db')

export const LIBRARY_DIR = path.join(STATE_ROOT, 'library')
export const BROLL_DIR = path.join(LIBRARY_DIR, 'broll')
export const BACKGROUNDS_DIR = path.join(LIBRARY_DIR, 'backgrounds')
export const MUSIC_DIR = path.join(LIBRARY_DIR, 'music')
export const PROMO_DIR = path.join(LIBRARY_DIR, 'promo')
/** Standalone chat screenshots made in Tools (deliverables, not pipeline assets). */
export const SHOTS_DIR = path.join(LIBRARY_DIR, 'shots')

export const OUT_DIR = path.join(STATE_ROOT, 'out')
export const RENDER_DIR = path.join(OUT_DIR, 'render')
export const EXPORTS_DIR = path.join(OUT_DIR, 'exports')

/** Served files live under STATE_ROOT (library/, out/). */
export const FILES_ROOT = STATE_ROOT

export const API_PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8787)

// Where Playwright loads the /render/* capture pages: the Vite dev server
// locally, the app itself in production.
export const WEB_ORIGIN =
  process.env.WEB_ORIGIN ??
  (process.env.NODE_ENV === 'production'
    ? `http://127.0.0.1:${API_PORT}`
    : 'http://localhost:5173')
