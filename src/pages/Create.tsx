import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import type { CarouselSpec } from '@shared/formats/carousel'
import type { SlideshowSpec } from '@shared/formats/slideshow'
import { DEFAULT_EXAMPLES, type Examples } from '@shared/examples'
import DraftPreview from '../components/studio/DraftPreview'
import Storyboard from '../components/studio/Storyboard'
import ConversationEditor from '../components/studio/ConversationEditor'
import AssetPicker from '../components/studio/AssetPicker'
import Scaled from '../components/studio/Scaled'
import Toast, { useToast } from '../components/studio/Toast'
import ChatScreen from '../components/chat/ChatScreen'
import SlideCard from '../components/slide/SlideCard'
import { api, type Job } from '../lib/api'

type FormatKey = 'clip' | 'carousel' | 'slideshow'

const FORMATS: Array<{
  key: FormatKey
  title: string
  blurb: string
  outcome: string
}> = [
  {
    key: 'clip',
    title: 'Shoot your shot video',
    blurb: 'A 33 second video: the conversation plays out over basketball footage.',
    outcome: 'You get an MP4 ready to upload',
  },
  {
    key: 'carousel',
    title: 'Chat carousel',
    blurb: 'A few chat screenshots people swipe through, posted as a photo set.',
    outcome: 'You get 2-6 images',
  },
  {
    key: 'slideshow',
    title: 'Slideshow',
    blurb: 'Text slides: a texting lesson, a joke, or date ideas.',
    outcome: 'You get 3-8 images',
  },
]

const CLIP_LOOKS = [
  { key: 'cuts', label: 'Hard cuts', hint: 'chat screens cut against hype clips (the reference look)' },
  { key: 'overlay', label: 'Floating chat', hint: 'chat card over one continuous clip' },
] as const

const SLIDESHOW_STYLES = [
  { key: 'shoot_your_shot', label: 'Texting lesson' },
  { key: 'comedic', label: 'Comedy' },
  { key: 'date_ideas', label: 'Date ideas' },
] as const

const STEPS = ['Format', 'Idea', 'Pick', 'Edit', 'Make', 'Done']

function StepBar({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center gap-1 overflow-x-auto text-sm">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          {i > 0 && <span className="px-1 text-neutral-700">→</span>}
          <span
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
              i === current
                ? 'bg-wing-500 font-medium text-white'
                : i < current
                  ? 'text-neutral-400'
                  : 'text-neutral-700'
            }`}
          >
            {i < current ? '✓ ' : ''}
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The guided path: one decision per screen, ending in a finished file.
 * Uses the same endpoints as the advanced batch flow, just sequenced.
 */
export default function Create() {
  const [step, setStep] = useState(0)
  const [format, setFormat] = useState<FormatKey>('clip')
  const [brief, setBrief] = useState('')
  const [look, setLook] = useState<(typeof CLIP_LOOKS)[number]['key']>('cuts')
  const [slideStyle, setSlideStyle] = useState<(typeof SLIDESHOW_STYLES)[number]['key']>('shoot_your_shot')
  const [examples, setExamples] = useState<Examples>(DEFAULT_EXAMPLES)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [chosen, setChosen] = useState<Draft | null>(null)
  const [edited, setEdited] = useState<Draft['spec'] | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [outputs, setOutputs] = useState<string[]>([])
  const [exported, setExported] = useState(false)
  const [posted, setPosted] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()
  const pollTimer = useRef<number | null>(null)

  useEffect(() => {
    api.examples().then((r) => setExamples(r.examples)).catch(() => {})
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [])

  const formatCard = useMemo(() => FORMATS.find((f) => f.key === format)!, [format])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const { drafts } = await api.generate({
        format,
        brief,
        count: 3,
        serial: false,
        ...(format === 'clip' ? { structure: look } : {}),
        ...(format === 'slideshow' ? { style: slideStyle } : {}),
      })
      setDrafts(drafts)
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const choose = async (draft: Draft) => {
    setChosen(draft)
    setEdited(draft.spec)
    setStep(3)
  }

  // Save whatever was edited, then render — the wizard's point of no return.
  const renderFinal = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      await api.patchDraft(chosen.id, { spec: edited, status: 'approved' })
      const { jobId } = await api.render(chosen.id)
      setStep(4)
      pollTimer.current = window.setInterval(async () => {
        try {
          const r = await api.job(jobId)
          setJob(r.job)
          if (r.job.status === 'done' || r.job.status === 'error') {
            if (pollTimer.current) window.clearInterval(pollTimer.current)
            setOutputs(r.outputs)
            if (r.job.status === 'done') {
              await api.exportJob(jobId).catch(() => {})
              setExported(true)
            }
            setStep(5)
          }
        } catch {
          // keep polling; a transient error shouldn't kill the wizard
        }
      }, 1500)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async (draft: Draft) => {
    setBusy(true)
    try {
      const { draft: fresh } = await api.regenerate(draft.id)
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? fresh : d)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setStep(0)
    setDrafts([])
    setChosen(null)
    setEdited(null)
    setJob(null)
    setOutputs([])
    setExported(false)
    setPosted(false)
    setBrief('')
  }

  const fileUrl = (file: string) =>
    exported && chosen
      ? `/files/out/exports/${chosen.id}/${file}`
      : job
        ? `/files/out/render/${job.id}/${file}`
        : ''

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold">Create</h1>
      <p className="mb-5 text-sm text-neutral-500">{STEPS[step]} · step {step + 1} of {STEPS.length}</p>
      <StepBar current={step} />
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}

      {/* 1 — what are we making */}
      {step === 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">What are you making?</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {FORMATS.map((card) => (
              <button
                key={card.key}
                onClick={() => {
                  setFormat(card.key)
                  setStep(1)
                }}
                className="rounded-2xl border-2 border-neutral-800 p-5 text-left transition hover:border-wing-500"
              >
                <div className="mb-3 flex justify-center">
                  <Scaled height={200}>
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
                <div className="mt-2 text-xs text-wing-400">{card.outcome} →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2 — setup */}
      {step === 1 && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <h2 className="mb-1 text-lg font-semibold">{formatCard.title}</h2>
            <p className="mb-4 text-sm text-neutral-400">{formatCard.blurb}</p>

            {/* Tyler couldn't tell what the AI decides vs what he does. */}
            <div className="mb-5 grid gap-3 rounded-xl border border-neutral-800 p-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-wing-400">
                  You decide
                </div>
                <p className="text-xs text-neutral-400">
                  The format, the style, which clips are used — and after Claude writes, every
                  message, the order and the timing.
                </p>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Claude writes
                </div>
                <p className="text-xs text-neutral-400">
                  Three versions of the conversation with their caption and hashtags. You pick one
                  and edit it before anything renders.
                </p>
              </div>
            </div>

            <label className="mb-2 block text-sm font-medium">What should it be about?</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. reviving a convo she left on read, cocky but likeable"
              className="mb-1 h-24 w-full rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm"
            />
            <p className="mb-5 text-xs text-neutral-500">
              Leave it empty and Claude picks the scenario.
            </p>

            {format === 'clip' && (
              <>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Edit style
                </div>
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {CLIP_LOOKS.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => setLook(l.key)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
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
                <p className="mb-5 rounded-lg border border-neutral-800 p-3 text-xs text-neutral-400">
                  By default the basketball clips come from your library in order and the WingAI
                  app screenshot is generated from the conversation. You can pick exact clips in
                  the next-but-one step.
                </p>
              </>
            )}

            {format === 'slideshow' && (
              <>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Slideshow style
                </div>
                <div className="mb-5 grid gap-2 sm:grid-cols-3">
                  {SLIDESHOW_STYLES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSlideStyle(s.key)}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        slideStyle === s.key
                          ? 'border-neutral-500 bg-neutral-800'
                          : 'border-neutral-900 bg-neutral-950'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(0)}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
              >
                Back
              </button>
              <button
                onClick={generate}
                disabled={busy}
                className="rounded-lg bg-wing-500 px-5 py-2 font-medium hover:bg-wing-400 disabled:opacity-50"
              >
                {busy ? 'Writing 3 options…' : 'Write my options →'}
              </button>
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Example — not your video
            </div>
            <Scaled height={420}>
              {format === 'slideshow' ? (
                <SlideCard slide={examples.slideshow[slideStyle][1]} />
              ) : (
                <ChatScreen
                  spec={format === 'clip' ? examples.clipChat : examples.carousel[0]}
                  mode={format === 'clip' ? 'zoom' : 'full'}
                />
              )}
            </Scaled>
          </div>
        </div>
      )}

      {/* 3 — pick */}
      {step === 2 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">Pick your favorite</h2>
          <p className="mb-5 text-sm text-neutral-400">
            Claude wrote three. Choose one and it gets made.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-2xl border border-neutral-800 p-4">
                <div className="mb-3 flex justify-center">
                  <DraftPreview draft={draft} height={300} />
                </div>
                <div className="mb-1 text-sm font-medium">{draft.meta.caption}</div>
                <div className="mb-3 text-xs text-neutral-500">{draft.meta.hashtags.join(' ')}</div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <button
                    onClick={() => choose(draft)}
                    disabled={busy}
                    className="rounded-lg bg-wing-500 px-3 py-1.5 font-medium hover:bg-wing-400 disabled:opacity-50"
                  >
                    Use this
                  </button>
                  <Link
                    to={`/drafts/${draft.id}`}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => regenerate(draft)}
                    disabled={busy}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500 disabled:opacity-50"
                  >
                    Swap
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setStep(1)}
            className="mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
          >
            Back
          </button>
        </div>
      )}

      {/* 4 — edit everything before committing to a render */}
      {step === 3 && edited && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">Edit before rendering</h2>
          <p className="mb-5 text-sm text-neutral-400">
            This is the real structure of your {format === 'clip' ? 'video' : 'post'}. Change any
            message, swap the clips, retime a beat — nothing is final until you render.
          </p>

          {format === 'clip' && (edited as ClipSpec).structure === 'cuts' ? (
            <Storyboard spec={edited as ClipSpec} onChange={(spec) => setEdited(spec)} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="flex justify-center lg:block">
                <DraftPreview
                  draft={{ format: chosen!.format, spec: edited }}
                  height={440}
                  slideIndex={0}
                />
              </div>
              <div className="min-w-0">
                {format === 'clip' && (
                  <>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Conversation
                    </div>
                    <ConversationEditor
                      messages={(edited as ClipSpec).chat.messages}
                      onChange={(messages) => {
                        const spec = edited as ClipSpec
                        setEdited({ ...spec, chat: { ...spec.chat, messages } })
                      }}
                    />
                    <div className="mt-5">
                      <AssetPicker
                        tag={(edited as ClipSpec).brollTag}
                        selected={(edited as ClipSpec).brollPaths ?? []}
                        onChange={(paths) => {
                          const spec = edited as ClipSpec
                          setEdited({ ...spec, brollPaths: paths.length ? paths : undefined })
                        }}
                      />
                    </div>
                  </>
                )}

                {format === 'carousel' && (edited as CarouselSpec).chat && (
                  <>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Conversation
                    </div>
                    <ConversationEditor
                      messages={(edited as CarouselSpec).chat!.messages}
                      onChange={(messages) => {
                        const spec = edited as CarouselSpec
                        setEdited({ ...spec, chat: { ...spec.chat!, messages } })
                      }}
                    />
                  </>
                )}

                {format === 'carousel' && !(edited as CarouselSpec).chat && (
                  <div className="flex flex-col gap-5">
                    {((edited as CarouselSpec).slides ?? []).map((slide, si) => (
                      <div key={si}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Screen {si + 1}
                        </div>
                        <ConversationEditor
                          messages={slide.messages}
                          onChange={(messages) => {
                            const spec = edited as CarouselSpec
                            setEdited({
                              ...spec,
                              slides: (spec.slides ?? []).map((s, i) =>
                                i === si ? { ...s, messages } : s,
                              ),
                            })
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {format === 'slideshow' && (
                  <div className="flex flex-col gap-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Slides
                    </div>
                    {(edited as SlideshowSpec).slides.map((slide, si) => (
                      <div key={si} className="rounded-xl border border-neutral-800 p-3">
                        <input
                          value={slide.title}
                          onChange={(e) => {
                            const spec = edited as SlideshowSpec
                            setEdited({
                              ...spec,
                              slides: spec.slides.map((s, i) =>
                                i === si ? { ...s, title: e.target.value } : s,
                              ),
                            })
                          }}
                          className="mb-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-medium"
                        />
                        {(slide.lines ?? []).map((line, li) => (
                          <input
                            key={li}
                            value={line}
                            onChange={(e) => {
                              const spec = edited as SlideshowSpec
                              setEdited({
                                ...spec,
                                slides: spec.slides.map((s, i) =>
                                  i === si
                                    ? {
                                        ...s,
                                        lines: (s.lines ?? []).map((l, index) =>
                                          index === li ? e.target.value : l,
                                        ),
                                      }
                                    : s,
                                ),
                              })
                            }}
                            className="mb-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
            >
              Back
            </button>
            <button
              onClick={renderFinal}
              disabled={busy}
              className="rounded-lg bg-wing-500 px-5 py-2 font-medium hover:bg-wing-400 disabled:opacity-50"
            >
              {busy ? 'Starting…' : `Render final ${format === 'clip' ? 'video' : 'images'} →`}
            </button>
          </div>
        </div>
      )}

      {/* 5 — making */}
      {step === 4 && (
        <div className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold">
            Making your {format === 'clip' ? 'video' : 'images'}…
          </h2>
          <p className="mb-5 text-sm text-neutral-400">
            {format === 'clip'
              ? 'Rendering the cuts, this takes a couple of minutes in the cloud.'
              : 'Capturing the slides, almost done.'}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-wing-500 transition-[width] duration-500"
              style={{ width: `${Math.max(6, Math.round((job?.progress ?? 0) * 100))}%` }}
            />
          </div>
          {job?.message && <p className="mt-2 text-xs text-neutral-500">{job.message}</p>}
        </div>
      )}

      {/* 6 — done */}
      {step === 5 && (
        <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex justify-center lg:block">
            {outputs.find((f) => f.endsWith('.mp4')) ? (
              <video
                src={fileUrl(outputs.find((f) => f.endsWith('.mp4'))!)}
                controls
                className="max-h-[460px] rounded-xl bg-black"
              />
            ) : (
              <div className="flex gap-2 overflow-x-auto">
                {outputs.map((file) => (
                  <img key={file} src={fileUrl(file)} alt="" className="h-[380px] rounded-xl" />
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-1 text-lg font-semibold">
              {job?.status === 'error' ? 'That one failed' : 'Ready to post'}
            </h2>
            {job?.status === 'error' ? (
              <p className="mb-4 text-sm text-red-400">{job.message}</p>
            ) : (
              <>
                <p className="mb-4 text-sm text-neutral-400">{chosen?.meta.caption}</p>
                <div className="mb-5 flex flex-wrap gap-2 text-sm">
                  {outputs.map((file) => (
                    <a
                      key={file}
                      href={fileUrl(file)}
                      download
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 font-medium hover:bg-emerald-600"
                    >
                      ↓ Download {file.endsWith('.mp4') ? 'video' : file}
                    </a>
                  ))}
                  <button
                    onClick={async () => {
                      const caption = [
                        chosen?.meta.caption,
                        chosen?.meta.hashtags.join(' '),
                        chosen?.meta.songSuggestion ? `Sound: ${chosen.meta.songSuggestion}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n')
                      await navigator.clipboard.writeText(caption)
                      showToast('Caption copied to clipboard')
                    }}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-neutral-500"
                  >
                    Copy caption
                  </button>
                </div>
                {chosen && !posted && (
                  <button
                    onClick={async () => {
                      await api.markPosted(chosen.id).catch(() => {})
                      setPosted(true)
                      showToast('Marked as posted')
                    }}
                    className="mb-5 block rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                  >
                    I posted it
                  </button>
                )}
                {posted && <p className="mb-5 text-sm text-emerald-400">Marked as posted ✓</p>}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={restart}
                className="rounded-lg bg-wing-500 px-4 py-2 font-medium hover:bg-wing-400"
              >
                Make another
              </button>
              <Link
                to="/library"
                className="rounded-lg border border-neutral-700 px-4 py-2 hover:border-neutral-500"
              >
                Go to Library
              </Link>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} />
    </div>
  )
}
