import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import type { CarouselSpec } from '@shared/formats/carousel'
import type { SlideshowSpec } from '@shared/formats/slideshow'
import { DEFAULT_EXAMPLES, type Examples } from '@shared/examples'
import DraftPreview from '../components/studio/DraftPreview'
import OverlayTrack from '../components/studio/OverlayTrack'
import Storyboard from '../components/studio/Storyboard'
import BatchReview from '../components/studio/BatchReview'
import VideoVersions from '../components/studio/VideoVersions'
import { STARTER_TEMPLATES, type VideoTemplate } from '@shared/templates'
import ConversationEditor from '../components/studio/ConversationEditor'
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

const SLIDESHOW_STYLES = [
  { key: 'shoot_your_shot', label: 'Texting lesson' },
  { key: 'comedic', label: 'Comedy' },
  { key: 'date_ideas', label: 'Date ideas' },
] as const

const STEPS = ['Format', 'Photo post setup', 'Review batch', 'Customize', 'Render', 'Download']

function StepBar({ current, template }: { current: number; template: string }) {
  return <nav aria-label="Creation context" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-neutral-500"><span>Formats</span><span>/</span><span>{template}</span><span>/</span><span className="text-wing-400">{STEPS[current]}</span></nav>
}

/**
 * Video formats open a populated editor immediately.
 * Photo formats keep their generation setup; batch review is optional.
 */
export default function Create() {
  const [step, setStep] = useState(0)
  const [templates, setTemplates] = useState<VideoTemplate[]>(STARTER_TEMPLATES)
  const [templateId, setTemplateId] = useState<string | undefined>()
  const [count, setCount] = useState(3)
  const [format, setFormat] = useState<FormatKey>('clip')
  const [brief, setBrief] = useState('')
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const [recent, setRecent] = useState<Draft[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [editorReady, setEditorReady] = useState(false)
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
    api.settings().then((r) => setAiReady(r.apiKeySet)).catch(() => {})
    api.drafts({ status: 'draft' }).then((r) => setRecent(r.drafts.slice(0, 3))).catch(() => {})
    api.examples().then((r) => setExamples(r.examples)).catch(() => {})
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [])

  useEffect(() => {
    if (step === 0) api.templates().then((r) => setTemplates(r.templates)).catch(() => {})
  }, [step])

  const formatCard = useMemo(() => FORMATS.find((f) => f.key === format)!, [format])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const { drafts } = await api.generate({
        format,
        brief,
        count,
        serial: false,
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

  const startTemplate = async (template: VideoTemplate) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const { draft } = await api.startTemplate(template.id)
      setTemplateId(template.id); setFormat('clip')
      setJob(null); setOutputs([]); setExported(false); setPosted(false)
      setDrafts([draft]); await choose(draft)
      window.scrollTo({ top: 0 })
    }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const choose = async (draft: Draft) => {
    setEditorReady(false)
    setChosen(draft)
    setEdited(draft.spec)
    setSaveStatus('Saved draft')
    setError(null)
    setStep(3)
  }

  const saveCurrent = async () => {
    if (!chosen || !edited) return false
    setBusy(true); setError(null); setSaveStatus('Saving…')
    try {
      const { draft } = await api.patchDraft(chosen.id, { spec: edited })
      setChosen(draft); setDrafts((items) => items.map((d) => d.id === draft.id ? draft : d))
      setSaveStatus('All changes saved')
      return true
    } catch (e) { setError((e as Error).message); setSaveStatus('Could not save'); return false }
    finally { setBusy(false) }
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
              try { await api.exportJob(jobId); setExported(true) }
              catch (e) { setError(`Rendered, but export failed: ${(e as Error).message}`) }
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

  const restart = () => {
    setStep(0)
    setTemplateId(undefined)
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
      <div className={`${step === 3 ? 'mb-3' : 'mb-6'} flex flex-wrap items-start justify-between gap-4`}>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-wing-400">WingAI content studio</p>
          <h1 className="text-3xl font-semibold tracking-tight">{step === 0 ? 'Same format. Your next great hook.' : step === 3 ? 'Make this version yours' : STEPS[step]}</h1>
          {step !== 3 && <p className="mt-2 text-sm text-neutral-400">{step === 0 ? 'Build a batch from a familiar format. Bring your angle, your clips, and your voice.' : 'Your format handles the structure. You bring the creative.'}</p>}
        </div>
        <Link to="/drafts" className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300">Your content →</Link>
      </div>
      {step > 0 && step !== 3 && <StepBar current={step} template={templates.find((t) => t.id === templateId)?.name ?? formatCard.title} />}
      {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}

      {/* 1 — what are we making */}
      {step === 0 && (
        <div>
          <div className="mb-7 grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 sm:grid-cols-3">
            {['Pick a WingAI format', 'Add your hook & footage', 'Create and review a batch'].map((label, i) => <div key={label} className="flex items-center gap-3 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wing-950 text-wing-400">{i + 1}</span>{label}</div>)}
          </div>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Start with a format</h2><span className="text-xs text-neutral-500">Structure included · fully customizable</span></div>
          {busy && <p role="status" className="mb-4 text-sm text-wing-400">Opening your editable video…</p>}
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            {templates.map((template) => <button key={template.id} disabled={busy} onClick={() => startTemplate(template)} className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 text-left transition hover:border-wing-500 disabled:opacity-50">
              <div className={`flex h-52 items-center justify-center gap-5 overflow-hidden border-b border-neutral-800 p-4 ${template.spec.structure === 'cuts' ? 'bg-sky-950/20' : 'bg-emerald-950/20'}`}>
                <div className="rounded-xl border border-neutral-700 bg-neutral-950 p-1"><Scaled height={175}><ChatScreen spec={template.spec.chat} mode={template.spec.structure === 'cuts' ? 'zoom' : 'card'} /></Scaled></div>
                <div className="max-w-40 space-y-2 text-xs"><span className="block text-[10px] uppercase tracking-wider text-neutral-500">The format</span>
                  {(template.spec.structure === 'cuts' ? ['01  Your hook + clip', '02  The conversation', '03  WingAI reply', '04  The payoff'] : ['01  Your background clip', '02  Chat reveals on top', '03  Your punchline']).map((label) => <span key={label} className="block rounded-lg border border-neutral-700/60 bg-neutral-950/60 px-3 py-2 text-neutral-300">{label}</span>)}
                </div>
              </div>
              <div className="p-5"><span className="text-[10px] uppercase tracking-widest text-wing-400">{template.id.startsWith('starter-') ? 'WingAI format' : 'Saved format'} · 9:16 video</span><h3 className="mt-2 text-lg font-semibold">{template.name}</h3><p className="mt-2 min-h-10 text-sm text-neutral-400">{template.description}</p><p className="mt-5 text-sm font-medium text-wing-400">Use this format <span className="inline-block transition group-hover:translate-x-1">→</span></p></div>
            </button>)}
          </div>
          {recent.length > 0 && <section className="mb-8"><h2 className="mb-3 text-lg font-semibold">Pick up where you left off</h2><div className="grid gap-2 sm:grid-cols-3">{recent.map((draft) => <Link key={draft.id} to={`/drafts/${draft.id}`} className="rounded-xl border border-neutral-800 p-4 hover:border-neutral-600"><span className="text-xs text-neutral-500">Draft · {draft.format === 'clip' ? 'Video' : draft.format}</span><span className="mt-2 block truncate text-sm">{draft.format === 'clip' ? (draft.spec as ClipSpec).hook : draft.meta.caption}</span><span className="mt-3 block text-xs text-wing-400">Continue editing →</span></Link>)}</div></section>}
          <details><summary className="mb-4 cursor-pointer text-sm text-neutral-400">Making a photo post? Browse carousels & slideshows</summary>
          <div className="grid gap-4 md:grid-cols-3">
            {FORMATS.filter((f) => f.key !== 'clip').map((card) => (
              <button
                key={card.key}
                onClick={() => {
                  setFormat(card.key)
                  setTemplateId(undefined); setChosen(null)
                  setTemplateId(undefined)
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
          </details>
        </div>
      )}

      {/* 2 — setup */}
      {step === 1 && (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-3"><div><p className="text-xs text-neutral-500">Selected format</p><h2 className="mt-1 font-semibold">{templates.find((t) => t.id === templateId)?.name ?? formatCard.title}</h2></div><button onClick={() => setStep(0)} className="text-sm text-wing-400">Change format</button></div>
              <label className="mb-4 block text-sm">What’s your angle?
                <textarea value={brief} maxLength={1900} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. a comeback after being left on read. Confident, funny, no cheesy pickup lines." rows={3} className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm" />
              </label>
              {format === 'slideshow' && <label className="mb-4 block text-sm">Slideshow style<select value={slideStyle} onChange={(e) => setSlideStyle(e.target.value as typeof slideStyle)} className="ml-3 rounded-lg bg-neutral-900 p-2">{SLIDESHOW_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select></label>}
              <label className="mb-5 flex items-center justify-between text-sm">How many script drafts?
                <select aria-label="Number of script versions" value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2">{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} drafts</option>)}</select>
              </label>
              {aiReady === false && <p className="mb-4 rounded-lg bg-amber-950/40 p-3 text-sm text-amber-200">AI writing needs an API key. <Link to="/settings" className="underline">Open settings</Link>.</p>}
            <button disabled={busy || aiReady === false} onClick={generate} className="w-full rounded-xl bg-wing-500 px-5 py-3 font-medium text-neutral-950 hover:bg-wing-400 disabled:opacity-50">{busy ? 'Preparing your drafts…' : `Draft ${count} script${count > 1 ? 's' : ''} →`}</button>
          </div>
          <div className="hidden rounded-2xl border border-neutral-800 p-5 lg:block"><p className="mb-4 text-xs uppercase tracking-wider text-neutral-500">Sample script</p><Scaled height={360}>{format === 'slideshow' ? <SlideCard slide={examples.slideshow[slideStyle][1]} /> : <ChatScreen spec={examples.carousel[0]} mode="full" />}</Scaled><p className="mt-4 text-xs leading-relaxed text-neutral-400">The format supplies the structure. Every line and clip is yours to change.</p></div>
        </div>
      )}

      {/* 3 — pick */}
      {step === 2 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">Review your versions</h2>
          <p className="mb-5 text-sm text-neutral-400">
            Open a version to polish its script and edit. Every version is saved in Your content.
          </p>
          <BatchReview drafts={drafts} onEdit={choose} />
          <button
            onClick={() => setStep(chosen ? 3 : 1)}
            className="mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
          >
            {chosen ? 'Back to editor' : 'Back to setup'}
          </button>
        </div>
      )}

      {/* 4 — edit everything before committing to a render */}
      {step === 3 && edited && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-neutral-400">{templates.find((t) => t.id === templateId)?.name ?? formatCard.title} · edit everything below</span><button disabled={busy} onClick={async () => { if (await saveCurrent()) setStep(0) }} className="text-sm text-wing-400">Choose another format</button></div>

          {drafts.length > 1 && <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1"><span className="shrink-0 text-xs text-neutral-500">This batch</span>{drafts.map((draft, i) => <button key={draft.id} disabled={busy} onClick={async () => { if (draft.id !== chosen?.id && await saveCurrent()) await choose(draft) }} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${draft.id === chosen?.id ? 'border-wing-500 bg-wing-950/30' : 'border-neutral-700'}`}>Version {i + 1}</button>)}</div>}
          {/* Both video formats get the same timeline editor. */}
          {format === 'clip' ? (
            (edited as ClipSpec).structure === 'cuts'
              ? <Storyboard key={chosen?.id} onReadyChange={setEditorReady} onRender={renderFinal} renderBusy={busy} spec={edited as ClipSpec} onChange={(spec) => { setEdited(spec); setSaveStatus('Unsaved changes') }} />
              : <OverlayTrack key={chosen?.id} onReadyChange={setEditorReady} onRender={renderFinal} renderBusy={busy} spec={edited as ClipSpec} onChange={(spec) => { setEdited(spec); setSaveStatus('Unsaved changes') }} />
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

          {format === 'clip' && chosen && <VideoVersions spec={edited as ClipSpec} meta={chosen.meta} beforeCreate={saveCurrent} onVersions={(versions) => { setDrafts(versions); setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}
          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-950/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3"><button disabled={busy} onClick={saveCurrent} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">Save draft</button><span role="status" className="text-xs text-neutral-400">{saveStatus}</span></div>
            <div className="flex gap-2"><button disabled={busy} onClick={async () => { if (await saveCurrent()) setStep(2) }} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm">Review batch</button><button onClick={renderFinal} disabled={busy || (format === 'clip' && !editorReady)} className="rounded-lg bg-wing-500 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">{busy ? 'Saving…' : format === 'clip' && !editorReady ? 'Complete missing items to render' : 'Render this version →'}</button></div>
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
              ? 'Creating your video and CapCut handoff. This can take a few minutes.'
              : 'Capturing the slides, almost done.'}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-wing-500 transition-[width] duration-500"
              style={{ width: `${Math.max(6, Math.round((job?.progress ?? 0) * 100))}%` }}
            />
          </div>
          {job?.message && <p className="mt-2 text-xs text-neutral-500">{job.message}</p>}
          <Link to="/queue" className="mt-5 inline-block text-sm text-wing-400 underline">Keep working while this renders →</Link>
        </div>
      )}

      {/* 6 — done */}
      {step === 5 && outputs.includes('capcut-media.zip') && <div className="mb-5 rounded-xl border border-neutral-700 p-4">
        <a href={fileUrl('capcut-media.zip')} download className="text-sm font-medium text-wing-400 underline">Download CapCut media bundle</a>
        <p className="mt-1 text-xs text-neutral-400">Source footage, chat screenshots, and a timing guide. Import the media into CapCut and arrange it using the guide. This is not a native CapCut project.</p>
      </div>}
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
                {outputs.filter((file) => /\.(png|jpe?g|webp)$/.test(file)).map((file) => (
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
              {templateId && <button disabled={busy} onClick={() => { const template = templates.find((t) => t.id === templateId); if (template) void startTemplate(template) }} className="rounded-lg bg-wing-500 px-4 py-2 font-medium text-neutral-950">Use this format again →</button>}
              <button
                onClick={restart}
                className="rounded-lg bg-wing-500 px-4 py-2 font-medium hover:bg-wing-400"
              >
                Choose another format
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
