import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { newId } from '../db/index'
import { PROMO_DIR } from '../paths'
import { rescanAssets, listAssets, type Asset } from '../assets/catalog'
import { captureSequence } from '../capture/screenshot'

export const PromoShotSpecSchema = z.object({
  /** Repo-relative path of a cataloged image asset (library/backgrounds/…). */
  imagePath: z.string().max(300).optional(),
  bubbleMe: z.string().min(1).max(200),
  bubbleThem: z.string().min(1).max(200),
  suggestion: z.string().min(1).max(300),
})

export type PromoShotSpec = z.infer<typeof PromoShotSpecSchema>

// Ephemeral: the spec only needs to survive the capture round-trip.
const pending = new Map<string, { spec: PromoShotSpec; expiresAt: number }>()

export function getPromoShotSpec(id: string): PromoShotSpec | null {
  const entry = pending.get(id)
  if (!entry || entry.expiresAt < Date.now()) return null
  return entry.spec
}

/** Renders the WingAI promo screenshot into library/promo and catalogs it. */
export async function createPromoShot(spec: PromoShotSpec): Promise<Asset> {
  const id = newId('ps')
  pending.set(id, { spec, expiresAt: Date.now() + 5 * 60_000 })
  for (const [key, entry] of pending) if (entry.expiresAt < Date.now()) pending.delete(key)

  mkdirSync(PROMO_DIR, { recursive: true })
  const filename = `promo-shot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  const outPath = path.join(PROMO_DIR, filename)
  try {
    await captureSequence([{ route: `/render/promoshot?id=${id}`, outPath }])
  } finally {
    pending.delete(id)
  }

  await rescanAssets()
  const asset = listAssets().find((a) => a.kind === 'promo' && a.path.endsWith(filename))
  if (!asset) throw new Error('shot rendered but did not appear in the catalog')
  return asset
}
