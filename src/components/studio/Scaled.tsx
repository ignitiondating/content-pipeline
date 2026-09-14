import type { ReactNode } from 'react'
import { CHAT_CANVAS } from '@shared/formats/chat'

/** Renders a 540×960 canvas child scaled down to the given height. */
export default function Scaled({ height, children }: { height: number; children: ReactNode }) {
  const scale = height / CHAT_CANVAS.height
  return (
    <div
      style={{ width: CHAT_CANVAS.width * scale, height, overflow: 'hidden' }}
      className="rounded-xl border border-white/10 bg-black shadow-lg"
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}
