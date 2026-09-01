import { CHAT_CANVAS, type ChatMessage } from '@shared/formats/chat'
import type { Slide } from '@shared/formats/slideshow'
import { BRAND } from '@shared/brand'

interface SlideCardProps {
  slide: Slide
  /** URL of the background photo; without one the slide is flat matte paper. */
  backgroundUrl?: string
}

const FONT_STACK = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"

function Wordmark({ onPhoto }: { onPhoto: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 34,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: onPhoto ? '#FFFFFF' : BRAND.ink,
      }}
    >
      {BRAND.wordmark}
      <span style={{ color: BRAND.orange }}>.</span>
    </div>
  )
}

/** Chat snippet in WingAI's own styling: orange for "me", matte grey for "them". */
function SnippetCard({ messages }: { messages: ChatMessage[] }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 22,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        boxShadow: '0 8px 30px rgba(33,33,33,0.12)',
      }}
    >
      {messages.map((message, i) => {
        const mine = message.from === 'me'
        return (
          <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                background: mine ? BRAND.orange : '#EEEEEE',
                color: mine ? '#FFFFFF' : BRAND.ink,
                borderRadius: 18,
                [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 5,
                padding: '8px 13px',
                fontSize: 16,
                lineHeight: 1.25,
                maxWidth: '80%',
              }}
            >
              {message.text}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SlideCard({ slide, backgroundUrl }: SlideCardProps) {
  const onPhoto = Boolean(backgroundUrl)
  const textColor = onPhoto ? '#FFFFFF' : BRAND.ink
  const subColor = onPhoto ? 'rgba(255,255,255,0.92)' : BRAND.greyText

  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT_STACK,
        background: BRAND.paper,
      }}
    >
      {backgroundUrl && (
        <>
          <img
            src={backgroundUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg,rgba(33,33,33,0.5) 0%,rgba(33,33,33,0.2) 45%,rgba(33,33,33,0.55) 100%)',
            }}
          />
        </>
      )}
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 44px 90px',
          gap: 20,
          color: textColor,
        }}
      >
        {slide.kicker && (
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: BRAND.orange,
            }}
          >
            {slide.kicker}
          </div>
        )}
        {/* minimalist accent bar */}
        {!slide.kicker && <div style={{ width: 44, height: 6, borderRadius: 3, background: BRAND.orange }} />}
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.12, letterSpacing: -0.5 }}>
          {slide.title}
        </div>
        {slide.lines && slide.lines.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {slide.lines.map((line, i) => (
              <div key={i} style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.35, color: subColor }}>
                {line}
              </div>
            ))}
          </div>
        )}
        {slide.chatSnippet && <SnippetCard messages={slide.chatSnippet} />}
      </div>
      <Wordmark onPhoto={onPhoto} />
    </div>
  )
}
