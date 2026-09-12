import type { ChatMessage } from '@shared/formats/chat'

/**
 * Every message editable in place: who sent it, what it says, order, and
 * whether it exists at all. Shared by the wizard, the draft editor and the
 * standalone screenshot tool.
 */
export default function ConversationEditor({
  messages,
  onChange,
  highlight,
  onFocusMessage,
}: {
  messages: ChatMessage[]
  onChange: (messages: ChatMessage[]) => void
  /** 1-based message number to outline (the storyboard's selected frame). */
  highlight?: number
  onFocusMessage?: (index: number) => void
}) {
  const patch = (index: number, next: Partial<ChatMessage>) =>
    onChange(messages.map((m, i) => (i === index ? { ...m, ...next } : m)))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= messages.length) return
    const next = [...messages]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, i) => (
        <div
          key={i}
          onFocus={() => onFocusMessage?.(i)}
          className={`flex items-center gap-2 rounded-lg p-1 ${
            highlight === i + 1 ? 'bg-wing-950/40 ring-1 ring-wing-500' : ''
          }`}
        >
          <span className="w-5 shrink-0 text-center text-xs text-neutral-600">{i + 1}</span>
          <button
            onClick={() => patch(i, { from: message.from === 'me' ? 'them' : 'me' })}
            title="Switch sender"
            className={`w-14 shrink-0 rounded-lg border px-2 py-2 text-xs font-medium ${
              message.from === 'me'
                ? 'border-wing-500 bg-wing-950/40'
                : 'border-neutral-800 bg-neutral-900'
            }`}
          >
            {message.from === 'me' ? 'You' : 'Her'}
          </button>
          <textarea
            aria-label={`Message ${i + 1}`}
            rows={2}
            value={message.text}
            onChange={(e) => patch(i, { text: e.target.value })}
            placeholder="Write the message…"
            className="min-w-0 flex-1 resize-y rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
          />
          <div className="flex shrink-0 flex-col">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="px-1 text-xs text-neutral-500 hover:text-white disabled:opacity-20"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === messages.length - 1}
              className="px-1 text-xs text-neutral-500 hover:text-white disabled:opacity-20"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
          <button
            onClick={() => onChange(messages.filter((_, index) => index !== i))}
            disabled={messages.length <= 1}
            className="shrink-0 rounded-lg border border-neutral-800 px-2 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
            aria-label="Delete message"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        disabled={messages.length >= 24}
        onClick={() =>
          onChange([
            ...messages,
            { from: messages[messages.length - 1]?.from === 'me' ? 'them' : 'me', text: '' },
          ])
        }
        className="self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
      >
        + Add message
      </button>
    </div>
  )
}
