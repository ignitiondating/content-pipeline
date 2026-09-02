import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatScreen from '../components/chat/ChatScreen'
import SlideCard from '../components/slide/SlideCard'
import Scaled from '../components/studio/Scaled'
import { EXAMPLE_CHAT, EXAMPLE_HOOK, EXAMPLE_SLIDES } from '../lib/examples'
import { api } from '../lib/api'

const FORMAT_CARDS = [
  { key: 'carousel', title: 'Chat carousel', blurb: '2-3 chat screenshots as a photo post. Cheapest, 100-300K view ceiling.' },
  { key: 'slideshow', title: 'Slideshow', blurb: 'Text-forward 9:16 slides: shoot your shot, comedy, date ideas.' },
  { key: 'clip', title: '"Take notes" clip', blurb: '15-40s video: chat card over b-roll, or full screens hard-cut with hype bursts.' },
] as const

const STYLES = [
  { key: 'shoot_your_shot', label: 'Shoot your shot' },
  { key: 'comedic', label: 'Comedic' },
  { key: 'date_ideas', label: 'Date ideas' },
] as const

const STRUCTURES = [
  { key: 'mix', label: 'Mix', hint: 'Claude picks per variant' },
  { key: 'overlay', label: 'Overlay', hint: 'chat card over continuous b-roll' },
  { key: 'cuts', label: 'Cuts', hint: 'full chat screens + hard-cut b-roll bursts' },
] as const

type FormatKey = (typeof FORMAT_CARDS)[number]['key']
type StyleKey = (typeof STYLES)[number]['key']
type StructureKey = (typeof STRUCTURES)[number]['key']

function HookText() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: '86%',
          textAlign: 'center',
          fontSize: 34,
          fontWeight: 900,
          lineHeight: 1.15,
          color: '#FFFFFF',
          textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 0 #000',
        }}
      >
        {EXAMPLE_HOOK}
      </div>
    </div>
  )
}

function OverlayExample({ height }: { height: number }) {
  return (
    <Scaled height={height}>
      <div style={{ background: '#212121', position: 'relative' }}>
        <ChatScreen spec={EXAMPLE_CHAT} mode="card" visibleCount={3} showTyping />
        <HookText />
      </div>
    </Scaled>
  )
}

function CutsExample({ height }: { height: number }) {
  return (
    <Scaled height={height}>
      <ChatScreen spec={EXAMPLE_CHAT} mode="full" visibleCount={3} />
    </Scaled>
  )
}

function ExamplePanel({
  format,
  style,
  structure,
  serial,
}: {
  format: FormatKey
  style: StyleKey
  structure: StructureKey
  serial: boolean
}) {
  let preview
  let caption: string
  if (format === 'carousel') {
    preview = (
      <Scaled height={520}>
        <ChatScreen spec={EXAMPLE_CHAT} mode="full" />
      </Scaled>
    )
    caption = 'Fake iMessage screenshots, 1080×1920 PNGs. Posted as a TikTok photo carousel with a question caption.'
  } else if (format === 'slideshow') {
    preview = (
      <Scaled height={520}>
        <SlideCard slide={EXAMPLE_SLIDES[style]} />
      </Scaled>
    )
    caption =
      style === 'shoot_your_shot'
        ? 'A texting mini-lesson: promise → moves with chat receipts → outcome. WingAI matte look.'
        : style === 'comedic'
          ? 'An escalating joke about texting culture, punchline on the last slide.'
          : 'One concrete, cheap date idea per slide — engineered for saves.'
  } else if (structure === 'overlay') {
    preview = <OverlayExample height={520} />
    caption = 'Chat card floats over continuous b-roll; messages reveal one by one with a typing indicator.'
  } else if (structure === 'cuts') {
    preview = <CutsExample height={520} />
    caption = 'Full-screen chat cuts hard against 2-3s b-roll hype bursts after every exchange. Hook rides the intro.'
  } else {
    preview = (
      <div className="flex gap-3">
        <div>
          <OverlayExample height={330} />
          <div className="mt-1 text-center text-xs text-neutral-500">overlay</div>
        </div>
        <div>
          <CutsExample height={330} />
          <div className="mt-1 text-center text-xs text-neutral-500">cuts</div>
        </div>
      </div>
    )
    caption = 'Claude picks the structure per variant, mixing both across the batch.'
  }

  return (
    <div className="sticky top-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Example</div>
      {preview}
      <p className="mt-3 max-w-[340px] text-sm text-neutral-400">{caption}</p>
      {serial && (
        <p className="mt-2 max-w-[340px] rounded-lg bg-wing-950/40 p-2 text-xs text-wing-400">
          Serial: part 1 cuts on a cliffhanger and its caption ends with{' '}
          <span className="font-semibold">comment "WORD" for part 2 — link in bio</span>; part 2 pays it off.
        </p>
      )}
    </div>
  )
}

export default function Generate() {
  const navigate = useNavigate()
  const [format, setFormat] = useState<FormatKey>('carousel')
  const [style, setStyle] = useState<StyleKey>('shoot_your_shot')
  const [structure, setStructure] = useState<StructureKey>('mix')
  const [brief, setBrief] = useState('')
  const [count, setCount] = useState(5)
  const [serial, setSerial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const { drafts } = await api.generate({
        format,
        brief,
        count,
        style,
        serial,
        ...(format === 'clip' && structure !== 'mix' ? { structure } : {}),
      })
      const batchId = drafts[0]?.batchId
      navigate(batchId ? `/batches/${batchId}` : '/drafts')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-10">
      <div className="max-w-2xl flex-1">
        <h1 className="mb-6 text-2xl font-bold">Generate</h1>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {FORMAT_CARDS.map((card) => (
            <button
              key={card.key}
              onClick={() => setFormat(card.key)}
              className={`rounded-xl border p-4 text-left ${
                format === card.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800 hover:border-neutral-600'
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
                  style === s.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {format === 'clip' && (
          <div className="mb-4 flex gap-2">
            {STRUCTURES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStructure(s.key)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  structure === s.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800'
                }`}
              >
                <span className="block font-medium">{s.label}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">{s.hint}</span>
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
          className="rounded-lg bg-wing-500 px-5 py-2 font-medium hover:bg-wing-400 disabled:opacity-50"
        >
          {busy ? 'Generating…' : serial ? 'Generate serial' : `Generate ${count} variants`}
        </button>
      </div>

      <div className="hidden shrink-0 lg:block">
        <ExamplePanel format={format} style={style} structure={structure} serial={serial} />
      </div>
    </div>
  )
}
