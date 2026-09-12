import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ChatSpec } from '@shared/formats/chat'
import { api } from '../../lib/api'

/** Optional script suggestions, reviewed in place before changing the video. */
export default function AiScript({ hook, chat, onChange }: {
  hook: string
  chat: ChatSpec
  onChange: (chat: ChatSpec) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [ready, setReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<{ source: string; texts: string[] } | null>(null)
  const source = JSON.stringify({ hook, chat })
  const latestSource = useRef(source)
  latestSource.current = source
  const active = suggestion?.source === source ? suggestion : null

  useEffect(() => { api.settings().then((r) => setReady(r.apiKeySet)).catch(() => {}) }, [])

  const generate = async () => {
    setBusy(true); setError(''); setSuggestion(null)
    try {
      const { texts } = await api.aiScript(hook, chat, instruction)
      if (latestSource.current !== source) {
        setError('Your script changed while AI was writing. Try again with your latest edits.')
        return
      }
      setSuggestion({ source, texts })
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return <details className="mb-5 rounded-xl border border-neutral-700 bg-neutral-900/30 p-4">
    <summary className="cursor-pointer text-sm font-medium text-wing-400">Draft a new script with AI <span className="font-normal text-neutral-500">· optional</span></summary>
    <p className="mt-3 text-xs leading-relaxed text-neutral-400">Describe your angle and review a new conversation here. Your hook, clips, and format stay in place. Apply it when you’re ready, then polish every line.</p>
    <label className="mt-3 block text-sm">What should this conversation be about?
      <textarea value={instruction} maxLength={2000} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="A confident comeback after being left on read. Funny, casual, no cheesy pickup lines." className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm" />
    </label>
    {ready === false && <p className="mt-3 text-sm text-amber-200">Add an API key in <Link to="/settings" className="underline">Settings</Link> to use AI writing. You can edit the sample script now.</p>}
    <button disabled={busy || ready === false || !instruction.trim()} onClick={generate} className="mt-3 rounded-lg border border-wing-600 px-3 py-2 text-sm text-wing-400 disabled:opacity-50">{busy ? 'Writing a suggestion…' : 'Suggest a script'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {active && <div className="mt-4 border-t border-neutral-700 pt-4">
      <p className="mb-3 text-sm font-medium">Suggested script · not applied yet</p>
      <ol className="space-y-2">{active.texts.map((text, i) => <li key={i} className="rounded-lg bg-neutral-950 p-3 text-sm"><span className="mb-1 block text-xs text-neutral-500">{chat.messages[i].from === 'me' ? 'You' : chat.contact.name}</span>{text}</li>)}</ol>
      <div className="mt-3 flex flex-wrap gap-3"><button onClick={() => {
        onChange({ ...chat, messages: chat.messages.map((message, i) => ({ ...message, text: active.texts[i] })) })
        setSuggestion(null)
      }} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Use this script</button><button onClick={() => setSuggestion(null)} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm">Keep current script</button></div>
    </div>}
  </details>
}
