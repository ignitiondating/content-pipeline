import path from 'node:path'

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')

export const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'ffmpeg')
export const DATA_DIR = path.join(PROJECT_ROOT, 'data')
export const MIGRATIONS_DIR = path.join(DATA_DIR, 'migrations')
export const DB_PATH = path.join(DATA_DIR, 'studio.db')

export const LIBRARY_DIR = path.join(PROJECT_ROOT, 'library')
export const BROLL_DIR = path.join(LIBRARY_DIR, 'broll')
export const BACKGROUNDS_DIR = path.join(LIBRARY_DIR, 'backgrounds')
export const MUSIC_DIR = path.join(LIBRARY_DIR, 'music')

export const OUT_DIR = path.join(PROJECT_ROOT, 'out')
export const RENDER_DIR = path.join(OUT_DIR, 'render')
export const EXPORTS_DIR = path.join(OUT_DIR, 'exports')

export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
export const API_PORT = Number(process.env.API_PORT ?? 8787)
