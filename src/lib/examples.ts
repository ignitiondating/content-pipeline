import type { ChatSpec } from '@shared/formats/chat'
import type { Slide } from '@shared/formats/slideshow'

/** Sample content for the Generate page's live example panel. */

export const EXAMPLE_CHAT: ChatSpec = {
  theme: 'dark',
  contact: { name: 'Maya', emoji: '🧿' },
  statusBar: { time: '9:41', batteryPct: 71 },
  lastMessageStatus: 'read',
  messages: [
    { from: 'me', text: 'is your dad a pirate?', timestampDivider: 'Today 9:38 PM' },
    { from: 'them', text: 'no, why?' },
    { from: 'me', text: 'because you look like a treasure' },
    { from: 'them', text: 'omg 💀', reactions: [{ kind: 'haha', from: 'them' }] },
    { from: 'them', text: 'ok that actually worked' },
  ],
}

export const EXAMPLE_HOOK = 'Texting huzz *take notes*'

export const EXAMPLE_SLIDES: Record<'shoot_your_shot' | 'comedic' | 'date_ideas', Slide> = {
  shoot_your_shot: {
    kicker: 'move 1',
    title: 'open with a claim, not a question',
    chatSnippet: [
      { from: 'me', text: 'you look like trouble' },
      { from: 'them', text: 'and yet here you are' },
    ],
  },
  comedic: {
    title: 'the group chat reviewing your text for 45 minutes',
    lines: ['12 unread messages', 'before you even hit send'],
  },
  date_ideas: {
    kicker: 'date idea #2',
    title: 'rooftop parking garage picnic',
    lines: ['blanket, gas station snacks, city view', 'free, no crowd, no reservations'],
  },
}
