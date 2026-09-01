import { z } from 'zod'

/**
 * The chat canvas is designed at 540×960 CSS px and captured with
 * deviceScaleFactor 2, so exports are exactly 1080×1920. Every visual metric
 * lives here so the studio preview and the headless export stay identical.
 */
export const CHAT_CANVAS = {
  width: 540,
  height: 960,
  deviceScaleFactor: 2,
} as const

export const CHAT_THEMES = {
  light: {
    background: '#FFFFFF',
    headerBackground: 'rgba(249,249,249,0.94)',
    headerBorder: 'rgba(0,0,0,0.12)',
    text: '#000000',
    subtleText: '#8E8E93',
    bubbleMe: '#0A84FF',
    bubbleMeText: '#FFFFFF',
    bubbleThem: '#E9E9EB',
    bubbleThemText: '#000000',
    avatarBackground: 'linear-gradient(180deg,#A9B2BD 0%,#8E98A3 100%)',
    typingDot: '#8E8E93',
  },
  dark: {
    background: '#000000',
    headerBackground: 'rgba(22,22,24,0.94)',
    headerBorder: 'rgba(255,255,255,0.12)',
    text: '#FFFFFF',
    subtleText: '#8D8D93',
    bubbleMe: '#0A84FF',
    bubbleMeText: '#FFFFFF',
    bubbleThem: '#26262A',
    bubbleThemText: '#FFFFFF',
    avatarBackground: 'linear-gradient(180deg,#8E98A3 0%,#6B7480 100%)',
    typingDot: '#8D8D93',
  },
} as const

export type ChatTheme = keyof typeof CHAT_THEMES

export const TapbackSchema = z.object({
  kind: z.enum(['heart', 'haha', 'doubleExclamation', 'like', 'dislike', 'question']),
  from: z.enum(['me', 'them']),
})

export const ChatMessageSchema = z.object({
  from: z.enum(['me', 'them']),
  text: z.string().min(1).max(400),
  /** Tapback reactions rendered on the bubble corner. */
  reactions: z.array(TapbackSchema).max(2).optional(),
  /** Optional grey divider rendered ABOVE this message, e.g. "Today 9:41 PM". */
  timestampDivider: z.string().max(40).optional(),
})

export const ChatSpecSchema = z.object({
  theme: z.enum(['light', 'dark']),
  contact: z.object({
    name: z.string().min(1).max(30),
    /** Single emoji shown instead of initials in the avatar, optional. */
    emoji: z.string().max(8).optional(),
  }),
  statusBar: z.object({
    time: z.string().max(8),
    batteryPct: z.number().int().min(5).max(100),
  }),
  messages: z.array(ChatMessageSchema).min(1).max(24),
  /** Show "Read"/"Delivered" under the last own message. */
  lastMessageStatus: z.enum(['read', 'delivered', 'none']),
})

export type Tapback = z.infer<typeof TapbackSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatSpec = z.infer<typeof ChatSpecSchema>

export const TAPBACK_GLYPHS: Record<Tapback['kind'], string> = {
  heart: '❤️',
  haha: '😂',
  doubleExclamation: '‼️',
  like: '👍',
  dislike: '👎',
  question: '❓',
}
