import { CHAT_CANVAS, CHAT_THEMES, TAPBACK_GLYPHS, type ChatMessage, type ChatSpec } from '@shared/formats/chat'

interface ChatScreenProps {
  spec: ChatSpec
  /** Messages revealed so far; defaults to all (carousel stills). */
  visibleCount?: number
  /** Show the incoming typing indicator (clip states). */
  showTyping?: boolean
  /** 'full' = whole phone screen; 'card' = floating card for clip overlays. */
  mode?: 'full' | 'card'
}

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"

function Avatar({ spec, size }: { spec: ChatSpec; size: number }) {
  const theme = CHAT_THEMES[spec.theme]
  const initials = spec.contact.emoji ?? spec.contact.name.slice(0, 1).toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: theme.avatarBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.44,
        color: '#FFFFFF',
        fontWeight: 500,
      }}
    >
      {initials}
    </div>
  )
}

function TypingBubble({ spec }: { spec: ChatSpec }) {
  const theme = CHAT_THEMES[spec.theme]
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '2px 0' }}>
      <div
        style={{
          background: theme.bubbleThem,
          borderRadius: 20,
          padding: '14px 18px',
          display: 'flex',
          gap: 5,
        }}
      >
        {[0.35, 0.6, 1].map((opacity, i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: theme.typingDot,
              opacity,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function Bubble({ spec, message, isLast }: { spec: ChatSpec; message: ChatMessage; isLast: boolean }) {
  const theme = CHAT_THEMES[spec.theme]
  const mine = message.from === 'me'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
      {message.timestampDivider && (
        <div
          style={{
            textAlign: 'center',
            color: theme.subtleText,
            fontSize: 12,
            fontWeight: 500,
            padding: '10px 0 6px',
          }}
        >
          {message.timestampDivider}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <div style={{ position: 'relative', maxWidth: '75%' }}>
          <div
            style={{
              background: mine ? theme.bubbleMe : theme.bubbleThem,
              color: mine ? theme.bubbleMeText : theme.bubbleThemText,
              borderRadius: 20,
              [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 6,
              padding: '9px 14px',
              fontSize: 17,
              lineHeight: 1.28,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message.text}
          </div>
          {message.reactions?.map((reaction, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: -16,
                [mine ? 'left' : 'right']: -10 - i * 26,
                background:
                  reaction.from === 'me' ? theme.bubbleMe : spec.theme === 'dark' ? '#3A3A3E' : '#D6D6DA',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                border: `2px solid ${theme.background}`,
              }}
            >
              {TAPBACK_GLYPHS[reaction.kind]}
            </div>
          ))}
        </div>
      </div>
      {mine && isLast && spec.lastMessageStatus !== 'none' && (
        <div
          style={{
            textAlign: 'right',
            color: theme.subtleText,
            fontSize: 12,
            fontWeight: 500,
            paddingTop: 3,
            paddingRight: 4,
          }}
        >
          {spec.lastMessageStatus === 'read' ? 'Read' : 'Delivered'}
        </div>
      )}
    </div>
  )
}

function StatusBar({ spec }: { spec: ChatSpec }) {
  const theme = CHAT_THEMES[spec.theme]
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 28px 6px',
        color: theme.text,
        fontSize: 16,
        fontWeight: 600,
      }}
    >
      <span>{spec.statusBar.time}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* signal bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
          {[4, 6, 8, 10].map((h) => (
            <span key={h} style={{ width: 3, height: h, background: theme.text, borderRadius: 1 }} />
          ))}
        </div>
        {/* wifi */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <path
            d="M8.5 11.5 L2 4.5 A9.5 9.5 0 0 1 15 4.5 Z"
            fill={theme.text}
            fillRule="evenodd"
          />
        </svg>
        {/* battery */}
        <div
          style={{
            width: 26,
            height: 12.5,
            border: `1px solid ${theme.text}80`,
            borderRadius: 4,
            padding: 1.5,
            display: 'flex',
          }}
        >
          <div
            style={{
              width: `${spec.statusBar.batteryPct}%`,
              background: spec.statusBar.batteryPct <= 20 ? '#FF453A' : theme.text,
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Header({ spec }: { spec: ChatSpec }) {
  const theme = CHAT_THEMES[spec.theme]
  return (
    <div
      style={{
        background: theme.headerBackground,
        borderBottom: `0.5px solid ${theme.headerBorder}`,
        padding: '4px 14px 8px',
        display: 'flex',
        alignItems: 'center',
        backdropFilter: 'blur(20px)',
      }}
    >
      <svg width="12" height="21" viewBox="0 0 12 21" style={{ flexShrink: 0 }}>
        <path d="M10.5 1.5 L2 10.5 L10.5 19.5" stroke="#0A84FF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Avatar spec={spec} size={50} />
        <div style={{ color: theme.text, fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
          {spec.contact.name}
          <svg width="7" height="11" viewBox="0 0 7 11">
            <path d="M1 1 L6 5.5 L1 10" stroke={theme.subtleText} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <svg width="24" height="21" viewBox="0 0 24 16" style={{ flexShrink: 0 }}>
        <rect x="0" y="1" width="16" height="14" rx="3.5" fill="none" stroke="#0A84FF" strokeWidth="1.8" />
        <path d="M17 6 L23 2.5 V13.5 L17 10 Z" fill="none" stroke="#0A84FF" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export default function ChatScreen({ spec, visibleCount, showTyping = false, mode = 'full' }: ChatScreenProps) {
  const theme = CHAT_THEMES[spec.theme]
  const shown = spec.messages.slice(0, visibleCount ?? spec.messages.length)
  const lastIndex = shown.length - 1

  const thread = (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
      {shown.map((message, i) => (
        <Bubble key={i} spec={spec} message={message} isLast={i === lastIndex && !showTyping} />
      ))}
      {showTyping && <TypingBubble spec={spec} />}
    </div>
  )

  if (mode === 'card') {
    // Floating card for clip overlays: transparent page, card centered.
    return (
      <div
        style={{
          width: CHAT_CANVAS.width,
          height: CHAT_CANVAS.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_STACK,
        }}
      >
        <div
          style={{
            width: CHAT_CANVAS.width * 0.78,
            maxHeight: CHAT_CANVAS.height * 0.72,
            overflow: 'hidden',
            background: theme.background,
            borderRadius: 24,
            boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          }}
        >
          <div
            style={{
              background: theme.headerBackground,
              borderBottom: `0.5px solid ${theme.headerBorder}`,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Avatar spec={spec} size={34} />
            <span style={{ color: theme.text, fontSize: 15, fontWeight: 600 }}>{spec.contact.name}</span>
          </div>
          {thread}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        background: theme.background,
        fontFamily: FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <StatusBar spec={spec} />
      <Header spec={spec} />
      <div style={{ flex: 1, overflow: 'hidden' }}>{thread}</div>
      {/* input bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 30px' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: spec.theme === 'dark' ? '#1C1C1E' : '#E9E9EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.subtleText,
            fontSize: 22,
            fontWeight: 400,
          }}
        >
          +
        </div>
        <div
          style={{
            flex: 1,
            border: `1px solid ${spec.theme === 'dark' ? '#3A3A3E' : '#D1D1D6'}`,
            borderRadius: 18,
            padding: '7px 14px',
            color: theme.subtleText,
            fontSize: 16,
          }}
        >
          iMessage
        </div>
      </div>
    </div>
  )
}
