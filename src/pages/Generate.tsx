import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const FORMAT_CARDS = [
  { key: 'carousel', title: 'Chat carousel', blurb: '2-3 chat screenshots as a photo post. Cheapest, 100-300K view ceiling.' },
  { key: 'slideshow', title: 'Slideshow', blurb: 'Text-forward 9:16 slides: shoot your shot, comedy, date ideas.' },
  { key: 'clip', title: '"Take notes" clip', blurb: '15-40s video over b-roll, chat reveals message by message.' },
] as const

const STYLES = [
  { key: 'shoot_your_shot', label: 'Shoot your shot' },
  { key: 'comedic', label: 'Comedic' },
  { key: 'date_ideas', label: 'Date ideas' },
] as const

export default function Generate() {
  const navigate = useNavigate()
  const [format, setFormat] = useState<'carousel' | 'slideshow' | 'clip'>('carousel')
  const [style, setStyle] = useState<(typeof STYLES)[number]['key']>('shoot_your_shot')
  const [brief, setBrief] = useState('')
  const [count, setCount] = useState(5)
  const [serial, setSerial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const { drafts } = await api.generate({ format, brief, count, style, serial })
      const batchId = drafts[0]?.batchId
      navigate(batchId ? `/batches/${batchId}` : '/drafts')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Generate</h1>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {FORMAT_CARDS.map((card) => (
          <button
            key={card.key}
            onClick={() => setFormat(card.key)}
            className={`rounded-xl border p-4 text-left ${
              format === card.key ? 'border-sky-500 bg-sky-950/40' : 'border-neutral-800 hover:border-neutral-600'
            }`}
          >
            <div className="font-semibold">{card.title}</div>
            <div className="mt-1 text-xs text-neutral-400">{card.blurb}</div>
          </button>
        ))}
      </div>

      {format === 'slideshow' && (
        <div className="mb-4 flex gap-2">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                style === s.key ? 'border-sky-500 bg-sky-950/40' : 'border-neutral-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={serial} onChange={(e) => setSerial(e.target.checked)} />
        Comment-gated serial — generate 2-3 linked parts with a cliffhanger + keyword instead of variants
      </label>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Creative brief (optional): topic, tone, scenario… e.g. 'reviving a convo she left on read, cocky but likeable'"
        className="mb-4 h-28 w-full rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm"
      />

      {!serial && (
        <label className="mb-4 block text-sm">
          Variants:{' '}
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-16 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1"
          />
        </label>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-lg bg-sky-600 px-5 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? 'Generating…' : serial ? 'Generate serial' : `Generate ${count} variants`}
      </button>
    </div>
  )
}
