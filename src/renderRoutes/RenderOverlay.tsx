import { CHAT_CANVAS } from '@shared/formats/chat'
import type { ClipSpec } from '@shared/formats/clip'
import { BRAND } from '@shared/brand'
import { useReadyFlag, useSpec } from './useCapture'

/** Capture page for the clip's hook text: transparent PNG, ?specId=<draftId>. */
export default function RenderOverlay() {
  const { data, error } = useSpec()
  useReadyFlag(Boolean(data))

  if (error) return <div data-capture-page>error: {error}</div>
  if (!data) return <div data-capture-page />

  const spec = data.spec as ClipSpec
  return (
    <div data-capture-page>
      <div
        style={{
          width: CHAT_CANVAS.width,
          height: CHAT_CANVAS.height,
          display: 'flex',
          justifyContent: 'center',
          paddingTop: 64,
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '86%',
            textAlign: 'center',
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1.15,
            color: '#FFFFFF',
            textShadow:
              '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 0 #000, 0 0 12px rgba(0,0,0,0.8)',
          }}
        >
          {spec.hook}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 46,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: '#FFFFFF',
            textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.6)',
          }}
        >
          {BRAND.wordmark}
          <span style={{ color: BRAND.orange }}>.</span>
        </div>
      </div>
    </div>
  )
}
