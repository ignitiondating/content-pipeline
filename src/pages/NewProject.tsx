import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEFAULT_EXAMPLES, type Examples } from '@shared/examples'
import ChatScreen from '../components/chat/ChatScreen'
import SlideCard from '../components/slide/SlideCard'
import Scaled from '../components/studio/Scaled'
import { api } from '../lib/api'

type FormatKey = 'clip' | 'carousel' | 'slideshow'

const FORMATS: Array<{
  key: FormatKey
  title: string
  blurb: string
}> = [
  {
    key: 'clip',
    title: 'Video',
    blurb: '15–40s vertical clip with chat over b-roll.',
  },
  {
    key: 'carousel',
    title: 'Chat carousel',
    blurb: '2–6 swipeable chat screenshots.',
  },
  {
    key: 'slideshow',
    title: 'Slideshow',
    blurb: 'Text slides: lesson, comedy, or date ideas.',
  },
]

const CLIP_LOOKS = [
  { key: 'cuts', label: 'Hard cuts', hint: 'Chat screens cut against hype clips' },
  { key: 'overlay', label: 'Floating chat', hint: 'Chat card over one continuous clip' },
] as const

const SLIDESHOW_STYLES = [
  { key: 'shoot_your_shot', label: 'Texting lesson' },
  { key: 'comedic', label: 'Comedy' },
  { key: 'date_ideas', label: 'Date ideas' },
] as const

export default function NewProject() {
  const navigate = useNavigate()
  const [format, setFormat] = useState<FormatKey>('clip')
  const [brief, setBrief] = useState('')
  const [look, setLook] = useState<(typeof CLIP_LOOKS)[number]['key']>('cuts')
  const [slideStyle, setSlideStyle] = useState<(typeof SLIDESHOW_STYLES)[number]['key']>(
    'shoot_your_shot',
  )
  const [examples, setExamples] = useState<Examples>(DEFAULT_EXAMPLES)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.examples().then((r) => setExamples(r.examples)).catch(() => {})
  }, [])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { drafts } = await api.generate({
        format,
        brief,
        count: 1,
        serial: false,
        ...(format === 'clip' ? { structure: look } : {}),
        ...(format === 'slideshow' ? { style: slideStyle } : {}),
      })
      const draft = drafts[0]
      if (!draft) throw new Error('No draft returned')
      navigate(`/edit/${draft.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 p-5 sm:p-7 lg:p-8">
      <header className="mb-6 flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-5 py-3 sm:px-6">
        <Link
          to="/"
          className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-white"
        >
          ← Projects
        </Link>
        <h1 className="text-sm font-semibold">New project</h1>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-2 py-2 sm:px-4">
        {error && (
          <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>
        )}

        <h2 className="mb-3 text-lg font-semibold">Format</h2>
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {FORMATS.map((card) => (
            <button
              key={card.key}
              onClick={() => setFormat(card.key)}
              className={`rounded-2xl border-2 p-4 text-left transition ${
                format === card.key ? 'border-wing-500 bg-wing-950/20' : 'border-neutral-800 hover:border-neutral-600'
              }`}
            >
              <div className="mb-3 flex justify-center">
                <Scaled height={140}>
                  {card.key === 'slideshow' ? (
                    <SlideCard slide={examples.slideshow.shoot_your_shot[1]} />
                  ) : (
                    <ChatScreen
                      spec={card.key === 'clip' ? examples.clipChat : examples.carousel[0]}
                      mode={card.key === 'clip' ? 'zoom' : 'full'}
                    />
                  )}
                </Scaled>
              </div>
              <div className="font-semibold">{card.title}</div>
              <div className="mt-1 text-xs text-neutral-400">{card.blurb}</div>
            </button>
          ))}
        </div>

        {format === 'clip' && (
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Edit style
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {CLIP_LOOKS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLook(l.key)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm ${
                    look === l.key
                      ? 'border-neutral-500 bg-neutral-800'
                      : 'border-neutral-900 bg-neutral-950'
                  }`}
                >
                  <span className="block font-medium">{l.label}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {format === 'slideshow' && (
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Slideshow style
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SLIDESHOW_STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSlideStyle(s.key)}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    slideStyle === s.key
                      ? 'border-neutral-500 bg-neutral-800'
                      : 'border-neutral-900 bg-neutral-950'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mb-2 block text-sm font-medium">What should it be about?</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. reviving a convo she left on read, cocky but likeable"
          className="mb-2 h-28 w-full rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm"
        />
        <p className="mb-6 text-xs text-neutral-500">Leave empty and Claude picks the scenario.</p>

        <button
          onClick={create}
          disabled={busy}
          className="rounded-lg bg-wing-500 px-5 py-2.5 font-medium hover:bg-wing-400 disabled:opacity-50"
        >
          {busy ? 'Writing…' : 'Generate & open editor →'}
        </button>
      </div>
    </div>
  )
}
