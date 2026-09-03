import { CHAT_CANVAS, type ChatSpec } from '@shared/formats/chat'
import { promoTargetIndex } from '@shared/timeline'
import { BRAND } from '@shared/brand'

/**
 * The product moment of a cuts clip: WingAI suggesting the payoff line
 * right before the chat screen shows it sent — the reference format's
 * app-promo beat, in WingAI's own identity.
 */
export default function PromoScreen({ spec }: { spec: ChatSpec }) {
  const target = promoTargetIndex(spec)
  const suggestion = spec.messages[target]?.text ?? ''
  // Context: the last incoming message before the suggestion.
  let context = ''
  for (let i = target - 1; i >= 0; i--) {
    if (spec.messages[i].from === 'them') {
      context = spec.messages[i].text
      break
    }
  }

  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        background: '#000000',
        fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 30px',
      }}
    >
      <div
        style={{
          width: '100%',
          background: '#161618',
          border: '1px solid #2A2A2E',
          borderRadius: 30,
          padding: '30px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', letterSpacing: 0.5 }}>
            {BRAND.wordmark}
            <span style={{ color: BRAND.orange }}>.</span>
          </div>
          <div
            style={{
              background: 'rgba(255,130,72,0.16)',
              color: BRAND.orange,
              borderRadius: 999,
              padding: '8px 16px',
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            ✦ suggested reply
          </div>
        </div>

        {context && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: '#8D8D93', fontSize: 16, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
              her
            </div>
            <div
              style={{
                alignSelf: 'flex-start',
                background: '#26262A',
                color: '#D6D6DA',
                borderRadius: 22,
                padding: '12px 18px',
                fontSize: 21,
                lineHeight: 1.3,
                maxWidth: '92%',
              }}
            >
              {context}
            </div>
          </div>
        )}

        <div
          style={{
            background: `linear-gradient(180deg, ${BRAND.orange} 0%, #f06a2f 100%)`,
            color: '#FFFFFF',
            borderRadius: 26,
            padding: '20px 24px',
            fontSize: 29,
            fontWeight: 600,
            lineHeight: 1.25,
            boxShadow: '0 10px 34px rgba(255,130,72,0.28)',
          }}
        >
          {suggestion}
        </div>

        <div style={{ textAlign: 'center', color: '#6A6A6E', fontSize: 17 }}>tap to send</div>
      </div>
    </div>
  )
}
