import { useCallback, useEffect, useState } from 'react'
import type { ChatMessage, ChatSpec } from '@shared/formats/chat'
import ChatScreen from '../chat/ChatScreen'
import Scaled from '../studio/Scaled'
import Toast, { useToast } from '../studio/Toast'
import { api, type AssetItem } from '../../lib/api'

const STARTER: ChatMessage[] = [
  { from: 'me', text: 'is your dad a pirate?' },
  { from: 'them', text: 'no, why?' },
  { from: 'me', text: 'because you look like a treasure' },
]

/** Standalone chat screenshots: type the messages, download a 1080x1920 PNG. */
export default function ChatScreenshotTool() {
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER)
  const [contact, setContact] = useState('Maya')
  const [skin, setSkin] = useState<'imessage' | 'instagram'>('instagram')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [mode, setMode] = useState<'full' | 'zoom'>('zoom')
  const [storyReply, setStoryReply] = useState(false)
  const [storyImagePath, setStoryImagePath] = useState<string | undefined>()
  const [backgrounds, setBackgrounds] = useState<AssetItem[]>([])
  const [shots, setShots] = useState<AssetItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  const load = useCallback(() => {
    api
      .assets()
      .then((r) => {
        const live = r.assets.filter((a) => !a.missing)
        setBackgrounds(live.filter((a) => a.kind === 'background'))
        setShots(live.filter((a) => a.kind === 'shot'))
      })
      .catch(() => {})
  }, [])
  useEffect(load, [load])

  const spec: ChatSpec = {
    theme,
    skin,
    storyReply: storyReply && skin === 'instagram',
    contact: { name: contact || 'Maya' },
    statusBar: { time: '9:41', batteryPct: 71 },
    lastMessageStatus: 'none',
    messages: messages.length ? messages : STARTER,
  }

  const setMessage = (index: number, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const { asset } = await api.createChatShot({ chat: spec, mode, storyImagePath })
      showToast(`Saved ${asset.path.split('/').pop()}`)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div>
        <p className="mb-6 max-w-xl text-sm text-neutral-400">
          A one-off chat screenshot for a post or an ad. Type the conversation, pick the look, and
          download the PNG. Nothing here touches the video pipeline.
        </p>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Contact name
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label className="col-span-3 text-neutral-400">Look</label>
            {(
              [
                ['instagram', 'Instagram'],
                ['imessage', 'iMessage'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSkin(key)}
                className={`rounded-lg border px-2 py-1.5 ${
                  skin === key ? 'border-neutral-500 bg-neutral-800' : 'border-neutral-900 bg-neutral-950'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg border border-neutral-900 bg-neutral-950 px-2 py-1.5"
            >
              {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-400">Framing</span>
          {(
            [
              ['zoom', 'Zoomed messages'],
              ['full', 'Full phone screen'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`rounded-lg border px-3 py-1.5 ${
                mode === key ? 'border-neutral-500 bg-neutral-800' : 'border-neutral-900 bg-neutral-950'
              }`}
            >
              {label}
            </button>
          ))}
          {skin === 'instagram' && (
            <label className="ml-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={storyReply}
                onChange={(e) => setStoryReply(e.target.checked)}
              />
              Story reply opener
            </label>
          )}
        </div>

        {storyReply && skin === 'instagram' && (
          <div className="mb-5">
            <div className="mb-2 text-sm text-neutral-400">Story photo</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStoryImagePath(undefined)}
                className={`flex h-20 w-14 items-center justify-center rounded-lg border text-xs text-neutral-500 ${
                  storyImagePath ? 'border-neutral-800' : 'border-wing-500'
                }`}
              >
                none
              </button>
              {backgrounds.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setStoryImagePath(asset.path)}
                  className={`overflow-hidden rounded-lg border ${
                    storyImagePath === asset.path ? 'border-wing-500' : 'border-neutral-800'
                  }`}
                >
                  <img src={`/files/${asset.path}`} alt="" className="h-20 w-14 object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 text-sm text-neutral-400">Messages</div>
        <div className="mb-4 flex flex-col gap-2">
          {messages.map((message, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => setMessage(i, { from: message.from === 'me' ? 'them' : 'me' })}
                title="Switch sender"
                className={`w-16 shrink-0 rounded-lg border px-2 py-2 text-xs font-medium ${
                  message.from === 'me'
                    ? 'border-wing-500 bg-wing-950/40'
                    : 'border-neutral-800 bg-neutral-900'
                }`}
              >
                {message.from === 'me' ? 'You' : 'Her'}
              </button>
              <input
                value={message.text}
                onChange={(e) => setMessage(i, { text: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              />
              <button
                onClick={() => setMessages((prev) => prev.filter((_, index) => index !== i))}
                disabled={messages.length <= 1}
                className="shrink-0 rounded-lg border border-neutral-800 px-2 py-2 text-neutral-500 hover:text-white disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setMessages((prev) => [
              ...prev,
              { from: prev[prev.length - 1]?.from === 'me' ? 'them' : 'me', text: '' },
            ])
          }
          className="mb-6 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
        >
          + Add message
        </button>

        {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
        <div>
          <button
            onClick={generate}
            disabled={busy || messages.every((m) => !m.text.trim())}
            className="rounded-lg bg-wing-500 px-5 py-2 font-medium hover:bg-wing-400 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate screenshot'}
          </button>
        </div>

        {shots.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Your screenshots
            </div>
            <div className="flex flex-wrap gap-3">
              {shots.map((shot) => (
                <a key={shot.id} href={`/files/${shot.path}`} download>
                  <img
                    src={`/files/${shot.path}`}
                    alt=""
                    className="h-40 rounded-lg border border-neutral-800 hover:border-neutral-600"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 lg:mt-0">
        <div className="flex flex-col items-center lg:sticky lg:top-6 lg:items-stretch">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Preview</div>
          <Scaled height={620}>
            <ChatScreen
              spec={spec}
              mode={mode}
              storyImageUrl={storyImagePath ? `/files/${storyImagePath}` : undefined}
            />
          </Scaled>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  )
}
