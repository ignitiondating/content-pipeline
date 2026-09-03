import { z } from 'zod'
import { ChatSpecSchema, type ChatSpec } from './formats/chat'
import { SlideSchema, SLIDESHOW_STYLES, type Slide } from './formats/slideshow'

/**
 * The sample content the studio shows in the Generate page's example panel.
 * Stored in the settings table (key 'examples') so it survives as app data;
 * these defaults seed the database on first read.
 */
export const ExamplesSchema = z.object({
  hook: z.string().min(1).max(80),
  /** Carousel example: one chat screen per slide, conversation progressing. */
  carousel: z.array(ChatSpecSchema).min(1).max(4),
  /** Chat used by both clip structure examples. */
  clipChat: ChatSpecSchema,
  slideshow: z.object({
    shoot_your_shot: z.array(SlideSchema).min(1).max(6),
    comedic: z.array(SlideSchema).min(1).max(6),
    date_ideas: z.array(SlideSchema).min(1).max(6),
  }),
})

export type Examples = z.infer<typeof ExamplesSchema>
export type SlideshowStyle = (typeof SLIDESHOW_STYLES)[number]

const pirateChat = (messages: ChatSpec['messages']): ChatSpec => ({
  theme: 'dark',
  contact: { name: 'Maya', emoji: '🧿' },
  statusBar: { time: '9:41', batteryPct: 71 },
  lastMessageStatus: 'read',
  messages,
})

export const DEFAULT_EXAMPLES: Examples = {
  hook: 'Texting huzz *take notes*',
  carousel: [
    pirateChat([
      { from: 'me', text: 'is your dad a pirate?', timestampDivider: 'Today 9:38 PM' },
      { from: 'them', text: 'no, why?' },
      { from: 'me', text: 'because you look like a treasure' },
      { from: 'them', text: 'omg 💀', reactions: [{ kind: 'haha', from: 'them' }] },
    ]),
    pirateChat([
      { from: 'them', text: 'ok that actually worked' },
      { from: 'me', text: 'friday. bring the treasure map' },
      { from: 'them', text: 'fine but you better cook' },
      { from: 'me', text: "we'll find out together 😌" },
    ]),
  ],
  clipChat: {
    ...pirateChat([
      { from: 'me', text: 'is your dad a pirate?' },
      { from: 'them', text: 'no, why?' },
      { from: 'me', text: 'because you look like a treasure' },
      { from: 'them', text: 'omg 💀' },
      { from: 'them', text: 'ok that actually worked' },
    ]),
    skin: 'instagram',
    storyReply: true,
  },
  slideshow: {
    shoot_your_shot: [
      { title: 'how to text huzz *take notes*', lines: ['3 moves, 40 seconds'] },
      {
        kicker: 'move 1',
        title: 'open with a claim, not a question',
        chatSnippet: [
          { from: 'me', text: 'you look like trouble' },
          { from: 'them', text: 'and yet here you are' },
        ],
      },
      { title: "it's not luck it's a skill", lines: ['WingAI wrote that one'] },
    ],
    comedic: [
      { title: 'the group chat reviewing your text for 45 minutes', lines: ['12 unread messages'] },
      { kicker: 'exhibit a', title: 'too many emojis', lines: ['"hey 😄😄🔥💯" is a crime scene'] },
      { title: 'and she replied "lol"', lines: ['start over. all of it.'] },
    ],
    date_ideas: [
      {
        kicker: 'date idea #1',
        title: 'grocery store dinner challenge',
        lines: ['$10 each, random ingredients', 'cook it together, loser does dishes'],
      },
      {
        kicker: 'date idea #2',
        title: 'rooftop parking garage picnic',
        lines: ['blanket, gas station snacks, city view', 'free, no crowd, no reservations'],
      },
      {
        kicker: 'date idea #3',
        title: 'thrift store style swap',
        lines: ['$15 budget each, pick outfits for each other', 'wear them to dinner. no vetoes.'],
      },
    ],
  },
}
