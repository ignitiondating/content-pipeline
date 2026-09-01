import { CHAT_CANVAS, CHAT_THEMES, type ChatMessage } from '@shared/formats/chat'
import type { Slide } from '@shared/formats/slideshow'

interface SlideCardProps {
  slide: Slide
  /** URL of the background image; falls back to a gradient when absent. */
  backgroundUrl?: string
}

const FONT_STACK = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"

function SnippetCard({ messages }: { messages: ChatMessage[] }) {
  const theme = CHAT_THEMES.dark
  return (
    <div
      style={{
        background: 'rgba(10,10,12,0.92)',
        borderRadius: 20,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
    >
      {messages.map((message, i) => {
        const mine = message.from === 'me'
        return (
          <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                background: mine ? theme.bubbleMe : theme.bubbleThem,
                color: '#FFFFFF',
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
  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT_STACK,
        background: backgroundUrl
          ? undefined
          : 'linear-gradient(160deg,#12131a 0%,#1d2030 55%,#2a1f3d 100%)',
      }}
    >
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {/* scrim so text always reads */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.25) 45%,rgba(0,0,0,0.6) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 40px',
          gap: 22,
          color: '#FFFFFF',
        }}
      >
        {slide.kicker && (
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            {slide.kicker}
          </div>
        )}
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.12,
            textShadow: '0 2px 14px rgba(0,0,0,0.55)',
          }}
        >
          {slide.title}
        </div>
        {slide.lines && slide.lines.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {slide.lines.map((line, i) => (
              <div key={i} style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.3, opacity: 0.94 }}>
                {line}
              </div>
            ))}
          </div>
        )}
        {slide.chatSnippet && <SnippetCard messages={slide.chatSnippet} />}
      </div>
    </div>
  )
}
