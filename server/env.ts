import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT } from './paths'

/**
 * Minimal .env loader: KEY=VALUE lines, # comments, no expansion. Values
 * already present in the environment win, so real env vars can override.
 */
export function loadEnv(): void {
  const file = path.join(PROJECT_ROOT, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = value
  }
}
