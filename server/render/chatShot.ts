import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ChatSpecSchema } from '../../shared/formats/chat'
import { newId } from '../db/index'
import { SHOTS_DIR } from '../paths'
import { listAssets, rescanAssets, type Asset } from '../assets/catalog'
import { captureSequence } from '../capture/screenshot'

export const ChatShotSpecSchema = z.object({
  chat: ChatSpecSchema,
  /** 'full' = whole phone screen, 'zoom' = last two messages, huge. */
  mode: z.enum(['full', 'zoom']),
  /** Story photo for the Instagram story-reply opener (repo-relative path). */
  storyImagePath: z.string().max(300).optional(),
})

export type ChatShotSpec = z.infer<typeof ChatShotSpecSchema>

// Ephemeral: the spec only needs to survive the capture round-trip.
const pending = new Map<string, { spec: ChatShotSpec; expiresAt: number }>()

export function getChatShotSpec(id: string): ChatShotSpec | null {
  const entry = pending.get(id)
  if (!entry || entry.expiresAt < Date.now()) return null
  return entry.spec
}

/** Renders a standalone chat screenshot into library/shots and catalogs it. */
export async function createChatShot(spec: ChatShotSpec): Promise<Asset> {
  const id = newId('cs')
  pending.set(id, { spec, expiresAt: Date.now() + 5 * 60_000 })
  for (const [key, entry] of pending) if (entry.expiresAt < Date.now()) pending.delete(key)

  mkdirSync(SHOTS_DIR, { recursive: true })
  const filename = `chat-shot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  const outPath = path.join(SHOTS_DIR, filename)
  try {
    await captureSequence([{ route: `/render/chatshot?id=${id}`, outPath }])
  } finally {
    pending.delete(id)
  }

  await rescanAssets()
  const asset = listAssets().find((a) => a.kind === 'shot' && a.path.endsWith(filename))
  if (!asset) throw new Error('shot rendered but did not appear in the catalog')
  return asset
}
