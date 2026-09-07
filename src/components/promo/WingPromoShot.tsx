import { CHAT_CANVAS } from '@shared/formats/chat'
import wingaiLogo from '../../assets/wingai-logo.png'
import wingaiBg from '../../assets/wingai-bg.png'

export interface WingPromoShotSpec {
  /** The imported-conversation photo (story/screenshot), optional. */
  imageUrl?: string
  /** Your sent line (blue bubble). */
  bubbleMe?: string
  /** Her reply (grey bubble). */
  bubbleThem?: string
  /** The WingAI suggested reply shown below. */
  suggestion: string
}

// Palette lifted from the app's chat stack (ResponseListThreads.js,
// HeaderThreads.js, GradientButton.js) — hardcoded there too.
const PINK = '#E64683'
const FONT = "'Poppins', -apple-system, system-ui, sans-serif"

function CopyIcon({ size = 16, color = PINK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="8" width="12" height="12" rx="3" stroke={color} strokeWidth="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke={color} strokeWidth="2" />
    </svg>
  )
}

/**
 * The RIZZ-App-style promo screenshot, in WingAI's real chat UI: pink mesh
 * background, logo header, dark imported-convo card (photo + the exchange),
 * and the app's "Suggested Reply" tray with the generated line.
 */
export default function WingPromoShot({ spec }: { spec: WingPromoShotSpec }) {
  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
        background: '#FDF7FA',
      }}
    >
      <img
        src={wingaiBg}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          maxWidth: 'none',
        }}
      />

      <div style={{ position: 'relative', padding: '26px 24px 0', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header: back chevron · logo with pink glow · two-bar menu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 }}>
          <svg width="14" height="24" viewBox="0 0 12 21">
            <path d="M10.5 1.5 L2 10.5 L10.5 19.5" stroke="#292D32" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </svg>
          <img
            src={wingaiLogo}
            alt="WingAI"
            style={{ height: 44, maxWidth: 'none', filter: 'drop-shadow(0 1px 6px rgba(230,70,131,0.31))' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ width: 24, height: 2.5, borderRadius: 2, background: PINK }} />
            <div style={{ width: 18, height: 2.5, borderRadius: 2, background: PINK }} />
          </div>
        </div>

        {/* Imported conversation card */}
        <div
          style={{
            marginTop: 22,
            background: '#0B0B0C',
            borderRadius: 24,
            padding: 20,
            boxShadow: '0 14px 40px rgba(33,33,33,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {spec.imageUrl && (
            <img
              src={spec.imageUrl}
              alt=""
              style={{
                alignSelf: 'flex-end',
                width: 190,
                height: 250,
                objectFit: 'cover',
                borderRadius: 16,
                maxWidth: 'none',
              }}
            />
          )}
          {spec.bubbleMe && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div
                style={{
                  background: 'linear-gradient(180deg,#3B82F6 0%,#2563EB 75%)',
                  color: '#FFFFFF',
                  borderRadius: 18,
                  padding: '10px 16px',
                  fontSize: 19,
                  lineHeight: 1.3,
                  maxWidth: '82%',
                }}
              >
                {spec.bubbleMe}
              </div>
            </div>
          )}
          {spec.bubbleThem && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  background: '#26262A',
                  color: '#F5F5F7',
                  borderRadius: 18,
                  padding: '10px 16px',
                  fontSize: 19,
                  lineHeight: 1.3,
                  maxWidth: '82%',
                }}
              >
                {spec.bubbleThem}
              </div>
            </div>
          )}
        </div>

        {/* Divider like the reference's "AI generated lines" strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 4px 14px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(230,70,131,0.35)' }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#212121' }}>👇 AI generated lines 👇</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(230,70,131,0.35)' }} />
        </div>

        {/* Suggested Reply tray — the app's real suggestion card anatomy */}
        <div
          style={{
            background: 'rgba(252,248,250,0.82)',
            borderRadius: 18,
            padding: '8px 10px 10px',
            boxShadow: '0 6px 24px rgba(234,80,122,0.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 4px 6px',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: PINK, letterSpacing: 0.2 }}>
              Suggested Reply
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" stroke={PINK} strokeWidth="2" />
              </svg>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={PINK}>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </div>
          </div>
          <div
            style={{
              position: 'relative',
              background: 'linear-gradient(180deg,#FCECE6 0%,#F8E5EB 100%)',
              borderRadius: 12,
              padding: '14px 44px 14px 16px',
              fontSize: 19,
              lineHeight: 1.35,
              color: '#4F4F4F',
            }}
          >
            {spec.suggestion}
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <CopyIcon />
            </div>
          </div>
        </div>

        {/* Brand CTA pill, decorative */}
        <div style={{ marginTop: 'auto', paddingBottom: 34, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              background: 'linear-gradient(90deg,#FF8C5A 0%,#E64683 100%)',
              borderRadius: 50,
              padding: '13px 34px',
              color: '#FFFFFF',
              fontSize: 19,
              fontWeight: 600,
              boxShadow: '0 5px 15px rgba(230,70,131,0.5)',
            }}
          >
            Generate more
          </div>
        </div>
      </div>
    </div>
  )
}
