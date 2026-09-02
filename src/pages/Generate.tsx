import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHAT_CANVAS } from '@shared/formats/chat'
import { DEFAULT_EXAMPLES, type Examples } from '@shared/examples'
import { buildClipTimeline, buildCutsTimeline } from '@shared/timeline'
import ChatScreen from '../components/chat/ChatScreen'
import SlideCard from '../components/slide/SlideCard'
import Scaled from '../components/studio/Scaled'
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

const PREVIEW_H = 560

function HookText({ hook }: { hook: string }) {
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
        {hook}
      </div>
    </div>
  )
}

/** Loops through a list of step durations (seconds), returning the active index. */
function useLoop(durationsS: number[]): number {
  const [index, setIndex] = useState(0)
  const step = Math.min(index, durationsS.length - 1)
  useEffect(() => {
    const timer = setTimeout(
      () => setIndex((step + 1) % durationsS.length),
      Math.max(durationsS[step], 0.2) * 1000,
    )
    return () => clearTimeout(timer)
  }, [step, durationsS])
  return step
}

/** Plays the real overlay timeline in a loop: same solver the renderer uses. */
function OverlayExample({ examples, height }: { examples: Examples; height: number }) {
  const timeline = useMemo(() => buildClipTimeline(examples.clipChat), [examples])
  const durations = useMemo(() => timeline.states.map((s) => s.tEndS - s.tStartS), [timeline])
  const state = timeline.states[useLoop(durations)]
  return (
    <Scaled height={height}>
      <div
        style={{
          width: CHAT_CANVAS.width,
          height: CHAT_CANVAS.height,
          background: '#212121',
          position: 'relative',
        }}
      >
        <ChatScreen spec={examples.clipChat} mode="card" visibleCount={state.visibleCount} showTyping={state.typing} />
        <HookText hook={examples.hook} />
      </div>
    </Scaled>
  )
}

function BrollPlaceholder() {
  return (
    <div
      style={{
        width: CHAT_CANVAS.width,
        height: CHAT_CANVAS.height,
        background: 'linear-gradient(160deg,#2a2a2e,#151517)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 90 }}>🏀</div>
      <div style={{ color: '#8D8D93', fontSize: 20, fontWeight: 600 }}>b-roll burst</div>
    </div>
  )
}

/** Plays the cuts timeline in a loop: chat screens hard-cut with b-roll beats. */
function CutsExample({ examples, height }: { examples: Examples; height: number }) {
  const timeline = useMemo(() => buildCutsTimeline(examples.clipChat), [examples])
  const durations = useMemo(() => timeline.segments.map((s) => s.durS), [timeline])
  const segment = timeline.segments[useLoop(durations)]
  const isIntro = segment === timeline.segments[0]
  return (
    <Scaled height={height}>
      {segment.type === 'broll' ? (
        <div style={{ position: 'relative' }}>
          <BrollPlaceholder />
          {isIntro && <HookText hook={examples.hook} />}
        </div>
      ) : (
        <ChatScreen spec={examples.clipChat} mode="full" visibleCount={segment.visibleCount} />
      )}
    </Scaled>
  )
}

/** Preview with ‹ › arrows when the example has more than one slide. */
function Pager({ slides }: { slides: ReactNode[] }) {
  const [index, setIndex] = useState(0)
  const shown = Math.min(index, slides.length - 1)
  return (
    <div>
      {slides[shown]}
      {slides.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setIndex((shown - 1 + slides.length) % slides.length)}
            className="h-8 w-8 rounded-lg border border-neutral-700 hover:border-neutral-500"
            aria-label="Previous slide"
          >
            ‹
          </button>
          <span className="tabular-nums text-neutral-500">
            {shown + 1} / {slides.length}
          </span>
          <button
            onClick={() => setIndex((shown + 1) % slides.length)}
            className="h-8 w-8 rounded-lg border border-neutral-700 hover:border-neutral-500"
            aria-label="Next slide"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

function ExamplePanel({
  examples,
  format,
  style,
  structure,
  serial,
}: {
  examples: Examples
  format: FormatKey
  style: StyleKey
  structure: StructureKey
  serial: boolean
}) {
  let preview: ReactNode
  let caption: string
  if (format === 'carousel') {
    preview = (
      <Pager
        slides={examples.carousel.map((chat, i) => (
          <Scaled key={i} height={PREVIEW_H}>
            <ChatScreen spec={chat} mode="full" />
          </Scaled>
        ))}
      />
    )
    caption = 'Fake iMessage screenshots, 1080×1920 PNGs. Posted as a TikTok photo carousel with a question caption.'
  } else if (format === 'slideshow') {
    preview = (
      <Pager
        slides={examples.slideshow[style].map((slide, i) => (
          <Scaled key={i} height={PREVIEW_H}>
            <SlideCard slide={slide} />
          </Scaled>
        ))}
      />
    )
    caption =
      style === 'shoot_your_shot'
        ? 'A texting mini-lesson: promise → moves with chat receipts → outcome. WingAI matte look.'
        : style === 'comedic'
          ? 'An escalating joke about texting culture, punchline on the last slide.'
          : 'One concrete, cheap date idea per slide — engineered for saves.'
  } else if (structure === 'overlay') {
    preview = <OverlayExample examples={examples} height={PREVIEW_H} />
    caption = 'Chat card floats over continuous b-roll; messages reveal one by one with a typing indicator.'
  } else if (structure === 'cuts') {
    preview = <CutsExample examples={examples} height={PREVIEW_H} />
    caption = 'Full-screen chat cuts hard against 2-3s b-roll hype bursts after every exchange. Hook rides the intro.'
  } else {
    preview = (
      <div className="flex gap-4">
        <div>
          <OverlayExample examples={examples} height={PREVIEW_H * 0.62} />
          <div className="mt-1 text-center text-xs text-neutral-500">overlay</div>
        </div>
        <div>
          <CutsExample examples={examples} height={PREVIEW_H * 0.62} />
          <div className="mt-1 text-center text-xs text-neutral-500">cuts</div>
        </div>
      </div>
    )
    caption = 'Claude picks the structure per variant, mixing both across the batch.'
  }

  return (
    <div className="sticky top-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Example</div>
      <div className="flex justify-center">{preview}</div>
      <p className="mt-3 text-sm text-neutral-400">{caption}</p>
      {serial && (
        <p className="mt-2 rounded-lg bg-wing-950/40 p-2 text-xs text-wing-400">
          Serial: part 1 cuts on a cliffhanger and its caption ends with{' '}
          <span className="font-semibold">comment "WORD" for part 2 — link in bio</span>; part 2 pays it off.
        </p>
      )}
    </div>
  )
}

export default function Generate() {
  const navigate = useNavigate()
  const [examples, setExamples] = useState<Examples>(DEFAULT_EXAMPLES)
  const [format, setFormat] = useState<FormatKey>('carousel')
  const [style, setStyle] = useState<StyleKey>('shoot_your_shot')
  const [structure, setStructure] = useState<StructureKey>('mix')
  const [brief, setBrief] = useState('')
  const [count, setCount] = useState(5)
  const [serial, setSerial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.examples().then((r) => setExamples(r.examples)).catch(() => {})
  }, [])

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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div>
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
          <div className="mb-4 grid grid-cols-3 gap-3">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  style === s.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {format === 'clip' && (
          <div className="mb-4 grid grid-cols-3 gap-3">
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

      <div className="hidden lg:block">
        <ExamplePanel
          key={`${format}-${style}-${structure}`}
          examples={examples}
          format={format}
          style={style}
          structure={structure}
          serial={serial}
        />
      </div>
    </div>
  )
}
