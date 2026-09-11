import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Draft } from '@shared/formats/draft'
import { SPEC_SCHEMAS, type Format } from '@shared/formats/draft'
import { buildClipTimeline, resolveClipSegments } from '@shared/timeline'
import type { ClipSpec } from '@shared/formats/clip'
import { carouselSlideCount, type CarouselSpec } from '@shared/formats/carousel'
import DraftPreview from '../components/studio/DraftPreview'
import Storyboard from '../components/studio/Storyboard'
import ConversationEditor from '../components/studio/ConversationEditor'
import { api } from '../lib/api'

export default function DraftEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [specText, setSpecText] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [song, setSong] = useState('')
  const [gate, setGate] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [stateIndex, setStateIndex] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api.draft(id).then(({ draft }) => {
      setDraft(draft)
      setSpecText(JSON.stringify(draft.spec, null, 2))
      setCaption(draft.meta.caption)
      setHashtags(draft.meta.hashtags.join(' '))
      setSong(draft.meta.songSuggestion)
      setGate(draft.meta.gateKeyword ?? '')
    })
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

  if (!draft) return <p className="text-neutral-500">Loading…</p>

  const effectiveSpec = parsed.spec ?? draft.spec
  const slideCount =
    draft.format === 'clip'
      ? 0
      : draft.format === 'carousel'
        ? carouselSlideCount(effectiveSpec as CarouselSpec)
        : ((effectiveSpec as { slides: unknown[] }).slides?.length ?? 0)

  const save = async () => {
    setStatus('saving')
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
      setStatus('saved')
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  const sendToRender = async () => {
    await save()
    await api.render(draft.id)
    navigate('/queue')
  }

  const clipState = timeline && stateIndex !== null ? timeline.states[stateIndex] : null
  const previewSpec = parsed.spec ?? draft.spec

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="min-w-0 flex-1">
        <h1 className="mb-4 text-2xl font-bold">Edit draft</h1>
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

        {draft.format === 'clip' && Boolean(parsed.spec) && (
          <div className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {(parsed.spec as ClipSpec).structure === 'cuts' ? 'Storyboard' : 'Conversation'}
            </div>
            {(parsed.spec as ClipSpec).structure === 'cuts' ? (
              <Storyboard
                spec={parsed.spec as ClipSpec}
                onChange={(next) => setSpecText(JSON.stringify(next, null, 2))}
              />
            ) : (
              <ConversationEditor
                messages={(parsed.spec as ClipSpec).chat.messages}
                onChange={(messages) => {
                  const spec = parsed.spec as ClipSpec
                  setSpecText(JSON.stringify({ ...spec, chat: { ...spec.chat, messages } }, null, 2))
                }}
              />
            )}
          </div>
        )}

        <label className="text-sm">
          <span className="text-neutral-500">Advanced — raw spec (the preview updates live)</span>
          <textarea
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            spellCheck={false}
            className="mt-1 h-96 w-full rounded-lg border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs"
          />
        </label>
        {parsed.error && (
          <div className="mt-2 rounded-lg bg-red-950 p-2 text-xs text-red-300">{parsed.error}</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={Boolean(parsed.error)}
            className="rounded-lg bg-emerald-700 px-4 py-2 hover:bg-emerald-600 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={sendToRender}
            disabled={Boolean(parsed.error)}
            className="rounded-lg bg-wing-500 px-4 py-2 hover:bg-wing-400 disabled:opacity-50"
          >
            Save & render
          </button>
          <button
            onClick={() => navigate(-1)}
            title="Discard changes and go back"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            Cancel
          </button>
          {status && <span className="text-sm text-neutral-400">{status}</span>}
        </div>
      </div>

      <div className="w-full shrink-0 lg:w-[360px]">
        <div className="flex flex-col items-center lg:sticky lg:top-6 lg:items-stretch">
          <DraftPreview
            draft={{ format: draft.format, spec: previewSpec as Draft['spec'] }}
            height={560}
            slideIndex={slideIndex}
            visibleCount={clipState?.visibleCount}
            showTyping={clipState?.typing ?? false}
            brollBeat={(clipState as { broll?: boolean } | null)?.broll ?? false}
            promoBeat={(clipState as { promo?: boolean } | null)?.promo ?? false}
          />
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
          {timeline && (
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
      </div>
    </div>
  )
}
