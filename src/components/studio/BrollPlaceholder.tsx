import { CHAT_CANVAS } from '@shared/formats/chat'

/** Stand-in for a b-roll beat when no real footage is available to preview. */
export default function BrollPlaceholder() {
  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        background: 'linear-gradient(160deg,#2a2a2e,#151517)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 90 }}>🏀</div>
      <div style={{ color: '#8D8D93', fontSize: 20, fontWeight: 600 }}>b-roll burst</div>
    </div>
  )
}
