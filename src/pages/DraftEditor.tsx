import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import { SPEC_SCHEMAS, type Format } from '@shared/formats/draft'
import { buildClipTimeline, resolveClipSegments } from '@shared/timeline'
import type { ClipSpec } from '@shared/formats/clip'
import { carouselSlideCount, type CarouselSpec } from '@shared/formats/carousel'
import DraftPreview from '../components/studio/DraftPreview'
import OverlayPreview from '../components/studio/OverlayPreview'
import Storyboard from '../components/studio/Storyboard'
import VideoVersions from '../components/studio/VideoVersions'
import ConversationEditor from '../components/studio/ConversationEditor'
import AiScript from '../components/studio/AiScript'
import { api } from '../lib/api'

export default function DraftEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [specText, setSpecText] = useState('')
  const [formSpec, setFormSpec] = useState<Draft['spec'] | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [song, setSong] = useState('')
  const [gate, setGate] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [stateIndex, setStateIndex] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [renderBusy, setRenderBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api.draft(id).then(({ draft }) => {
      setDraft(draft)
      setFormSpec(draft.spec)
      setSpecText(JSON.stringify(draft.spec, null, 2))
      setCaption(draft.meta.caption)
      setHashtags(draft.meta.hashtags.join(' '))
      setSong(draft.meta.songSuggestion)
      setGate(draft.meta.gateKeyword ?? '')
    }).catch((e: Error) => setLoadingError(e.message))
  }, [id])

  // Live-parse the JSON so the preview follows every keystroke.
  const parsed = useMemo(() => {
    if (!draft) return { spec: null as unknown, error: null as string | null }
    try {
      const spec = SPEC_SCHEMAS[draft.format as Format].parse(JSON.parse(specText))
      return { spec, error: null }
    } catch (e) {
      return { spec: null, error: (e as Error).message.slice(0, 300) }
    }
  }, [draft, specText])

  const timeline = useMemo(() => {
    if (draft?.format !== 'clip' || !parsed.spec) return null
    const spec = parsed.spec as ClipSpec
    if ((spec.structure ?? 'overlay') === 'cuts') {
      // Scrub through the cuts segments (b-roll beats keep the previous count).
      let t = 0
      const states = resolveClipSegments(spec, []).map((segment) => {
        const state = {
          visibleCount: segment.type === 'chat' ? segment.visibleCount : undefined,
          typing: false,
          broll: segment.type === 'broll',
          promo: segment.type === 'promo',
          tStartS: Math.round(t * 1000) / 1000,
          tEndS: Math.round((t + segment.durS) * 1000) / 1000,
        }
        t += segment.durS
        return state
      })
      return { states, durationS: Math.round(t * 1000) / 1000 }
    }
    return buildClipTimeline(spec.chat)
  }, [draft, parsed.spec])

  if (loadingError) return <p role="alert" className="text-red-400">{loadingError}</p>
  if (!draft) return <p className="text-neutral-500">Loading…</p>

  const effectiveSpec = formSpec ?? parsed.spec ?? draft.spec
  const slideCount =
    draft.format === 'clip'
      ? 0
      : draft.format === 'carousel'
        ? carouselSlideCount(effectiveSpec as CarouselSpec)
        : ((effectiveSpec as { slides: unknown[] }).slides?.length ?? 0)

  const save = async () => {
    if (parsed.error) { setStatus('Finish the hook and any empty messages before saving.'); return false }
    setStatus('Saving…')
    try {
      const meta = {
        caption,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        songSuggestion: song,
        ...(gate ? { gateKeyword: gate } : {}),
      }
      const { draft: updated } = await api.patchDraft(draft.id, {
        spec: parsed.spec ?? undefined,
        meta,
      })
      setDraft(updated)
      setStatus('All changes saved')
      return true
    } catch (e) {
      setStatus((e as Error).message)
      return false
    }
  }

  const sendToRender = async () => {
    if (renderBusy) return
    setRenderBusy(true)
    try {
      if (!await save()) return
      await api.render(draft.id)
      navigate('/queue')
    } catch (e) { setStatus((e as Error).message) }
    finally { setRenderBusy(false) }
  }

  const clipState = timeline && stateIndex !== null ? timeline.states[stateIndex] : null
  const previewSpec = effectiveSpec
  const changeForm = (next: Draft['spec']) => { setFormSpec(next); setSpecText(JSON.stringify(next, null, 2)); setStatus('Unsaved changes') }

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-5"><p className="mb-2 text-xs uppercase tracking-wider text-wing-400">WingAI content studio</p><h1 className="text-3xl font-semibold">Make this version yours</h1><p className="mt-2 text-sm text-neutral-400">Polish the hook, make the script natural, and bring your own clips.</p></div>
        {draft.format === 'clip' && formSpec && (
          <div className="mb-5">
            {(formSpec as ClipSpec).structure === 'cuts' ? (
              <Storyboard
                onReadyChange={setEditorReady}
                onRender={sendToRender}
                renderBusy={renderBusy}
                spec={formSpec as ClipSpec}
                onChange={changeForm}
              />
            ) : (
              <>
              <label className="mb-4 block text-sm">On-screen hook<input value={(formSpec as ClipSpec).hook} maxLength={80} onChange={(e) => changeForm({ ...formSpec as ClipSpec, hook: e.target.value })} className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2" /></label>
              <AiScript key={draft.id} hook={(formSpec as ClipSpec).hook} chat={(formSpec as ClipSpec).chat} onChange={(chat) => changeForm({ ...formSpec as ClipSpec, chat })} />
              <ConversationEditor
                messages={(formSpec as ClipSpec).chat.messages}
                onChange={(messages) => {
                  const spec = formSpec as ClipSpec
                  changeForm({ ...spec, chat: { ...spec.chat, messages } })
                }}
              />
              </>
            )}
          </div>
        )}

        <details className="mt-5 rounded-xl border border-neutral-800 p-4"><summary className="mb-3 cursor-pointer text-sm text-neutral-400">Caption, hashtags & posting details</summary>
        <div className="mb-4 grid gap-3">
          <label className="text-sm">
            Caption
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Hashtags (space separated)
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Song suggestion
              <input
                value={song}
                onChange={(e) => setSong(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Gate keyword
              <input
                value={gate}
                onChange={(e) => setGate(e.target.value.toUpperCase())}
                placeholder="(none)"
                className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              />
            </label>
          </div>
        </div>

        </details>
        {draft.format === 'clip' && Boolean(formSpec) && <VideoVersions beforeCreate={save} spec={formSpec as ClipSpec} meta={{ caption, hashtags: hashtags.split(/\s+/).filter(Boolean), songSuggestion: song, ...(gate ? { gateKeyword: gate } : {}) }} />}
        <details className="mt-5"><summary className="cursor-pointer text-sm text-neutral-500">Advanced specification</summary>
        <label className="text-sm">
          <span className="text-neutral-500">Advanced — raw spec (the preview updates live)</span>
          <textarea
            value={specText}
            onChange={(e) => {
              setSpecText(e.target.value)
              try { setFormSpec(SPEC_SCHEMAS[draft.format].parse(JSON.parse(e.target.value)) as Draft['spec']) } catch { /* keep the editable form while raw JSON is incomplete */ }
            }}
            spellCheck={false}
            className="mt-1 h-96 w-full rounded-lg border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs"
          />
        </label>
        </details>
        {parsed.error && (
          <div role="alert" className="mt-2 rounded-lg bg-red-950 p-3 text-sm text-red-300">Finish the hook and any empty messages before saving. Check the advanced specification if you edited it directly.</div>
        )}

        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-950/95 p-3 shadow-xl backdrop-blur">
          <button
            onClick={save}
            disabled={Boolean(parsed.error)}
            className="rounded-lg bg-emerald-700 px-4 py-2 hover:bg-emerald-600 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={sendToRender}
            disabled={renderBusy || Boolean(parsed.error) || (draft.format === 'clip' && (effectiveSpec as ClipSpec).structure === 'cuts' && !editorReady)}
            className="rounded-lg bg-wing-500 px-4 py-2 hover:bg-wing-400 disabled:opacity-50"
          >
            {draft.format === 'clip' && (effectiveSpec as ClipSpec).structure === 'cuts' && !editorReady ? 'Complete missing items to render' : 'Render this version →'}
          </button>
          <button
            onClick={async () => { if (await save()) navigate(draft.batchId ? `/batches/${draft.batchId}` : '/drafts') }}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            Save & return to batch
          </button>
          {status && <span className="text-sm text-neutral-400">{status}</span>}
        </div>
      </div>

      {!(draft.format === 'clip' && (effectiveSpec as ClipSpec).structure === 'cuts') && <div className="w-full shrink-0 lg:w-[360px]">
        <div className="flex flex-col items-center lg:sticky lg:top-6 lg:items-stretch">
          {draft.format === 'clip' ? <OverlayPreview key={draft.id} spec={effectiveSpec as ClipSpec} height={500} /> : <DraftPreview
            draft={{ format: draft.format, spec: previewSpec as Draft['spec'] }}
            height={560}
            slideIndex={slideIndex}
            visibleCount={clipState?.visibleCount}
            showTyping={clipState?.typing ?? false}
            brollBeat={(clipState as { broll?: boolean } | null)?.broll ?? false}
            promoBeat={(clipState as { promo?: boolean } | null)?.promo ?? false}
          />}
          {slideCount > 1 && (
            <div className="mt-3 flex justify-center gap-2">
              {Array.from({ length: slideCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIndex(i)}
                  className={`h-8 w-8 rounded-lg border text-sm ${
                    slideIndex === i ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {timeline && draft.format !== 'clip' && (
            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={timeline.states.length - 1}
                value={stateIndex ?? timeline.states.length - 1}
                onChange={(e) => setStateIndex(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-center text-xs text-neutral-500">
                {clipState
                  ? `state ${stateIndex} · t=${clipState.tStartS}s`
                  : `${timeline.states.length} states · ${timeline.durationS}s total`}
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  )
}
