import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DraftMetaSchema, type Draft, type DraftMeta } from '@shared/formats/draft'
import type { ClipSpec } from '@shared/formats/clip'
import type { CarouselSpec } from '@shared/formats/carousel'
import { carouselSlideCount } from '@shared/formats/carousel'
import type { SlideshowSpec } from '@shared/formats/slideshow'
import type { ChatSpec } from '@shared/formats/chat'
import {
  buildClipTimeline,
  CUTS_TARGET_S,
  fitToTarget,
  reconcileSegments,
  resolveClipSegments,
  segmentsDurationS,
  type EditedSegment,
} from '@shared/timeline'
import EditorShell from '../components/editor/EditorShell'
import PreviewStage from '../components/editor/PreviewStage'
import ExportReady, { type ExportOverlayMode } from '../components/editor/ExportReady'
import { CutsTimeline, ScrubTimeline } from '../components/editor/EditorTimeline'
import EditorDock, {
  AudioPanel,
  CaptionPanel,
  ClipInspector,
  ConversationEditor,
  InsertPanel,
  MediaPanel,
  type DockTab,
} from '../components/editor/EditorDock'
import ClipPlayer from '../components/studio/ClipPlayer'
import DraftPreview from '../components/studio/DraftPreview'
import Toast, { useToast } from '../components/studio/Toast'
import { useLoop } from '../lib/useLoop'
import { api, type AssetItem, type Job } from '../lib/api'

function timingKeyFor(
  segments: EditedSegment[],
  index: number,
): { field: 'introS' | 'outroS' | 'promoS' | 'chatHoldsS' | 'brollBeatsS'; key?: string } {
  const segment = segments[index]
  if (segment.type === 'promo') return { field: 'promoS' }
  if (segment.type === 'chat') return { field: 'chatHoldsS', key: String(segment.visibleCount) }
  if (index === 0) return { field: 'introS' }
  if (index === segments.length - 1) return { field: 'outroS' }
  return { field: 'brollBeatsS', key: String(brollOrdinal(segments, index) - 1) }
}

function brollOrdinal(segments: EditedSegment[], index: number): number {
  if (segments[index]?.type !== 'broll') return -1
  return segments.slice(0, index).filter((s) => s.type === 'broll').length
}

export default function Editor() {
  const { id } = useParams()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [spec, setSpec] = useState<Draft['spec'] | null>(null)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [song, setSong] = useState('')
  const [gate, setGate] = useState('')

  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)
  const [overlayIndex, setOverlayIndex] = useState(0)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [dockTab, setDockTab] = useState<DockTab>('chat')

  const [saveLabel, setSaveLabel] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [outputs, setOutputs] = useState<string[]>([])
  const [exported, setExported] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUi, setExportUi] = useState<ExportOverlayMode | null>(null)
  const [toast, showToast] = useToast()

  const pollTimer = useRef<number | null>(null)
  const saveTimer = useRef<number | null>(null)
  const dirty = useRef(false)
  const skipSave = useRef(true)
  const lastSaved = useRef('')
  const specRef = useRef<Draft['spec'] | null>(null)
  const metaRef = useRef<DraftMeta | null>(null)
  const draftIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    api.draft(id).then(({ draft: d }) => {
      setDraft(d)
      setSpec(d.spec)
      setCaption(d.meta.caption)
      setHashtags(d.meta.hashtags.join(' '))
      setSong(d.meta.songSuggestion)
      setGate(d.meta.gateKeyword ?? '')
      setExported(d.status === 'exported' || d.status === 'posted')
      skipSave.current = true
      dirty.current = false
      lastSaved.current = ''
      if (d.status === 'exported' || d.status === 'posted') {
        api.exports().then((r) => {
          const item = r.exports.find((e) => e.draftId === d.id)
          if (item) setOutputs(item.files)
        }).catch(() => {})
      }
    })
    api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing))).catch(() => {})
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [id])

  const meta = useMemo(
    (): DraftMeta => ({
      caption,
      hashtags: hashtags.split(/\s+/).filter(Boolean),
      songSuggestion: song,
      ...(gate ? { gateKeyword: gate } : {}),
    }),
    [caption, hashtags, song, gate],
  )

  specRef.current = spec
  metaRef.current = meta
  draftIdRef.current = draft?.id

  const persist = useCallback(async () => {
    const id = draftIdRef.current
    const nextSpec = specRef.current
    const nextMeta = metaRef.current
    if (!id || !nextSpec || !nextMeta) return false
    const parsed = DraftMetaSchema.safeParse(nextMeta)
    if (!parsed.success) {
      setSaveLabel('Fix caption or hashtags to save')
      return false
    }
    const payload = JSON.stringify({ spec: nextSpec, meta: parsed.data })
    if (payload === lastSaved.current) return true
    setSaveLabel('Saving…')
    try {
      // Do not write the response back into spec/draft state — zod defaults
      // would look like a new edit and retrigger this save forever.
      await api.patchDraft(id, { spec: nextSpec, meta: parsed.data })
      lastSaved.current = payload
      dirty.current = false
      setSaveLabel('Saved')
      window.setTimeout(() => {
        setSaveLabel((current) => (current === 'Saved' ? null : current))
      }, 1600)
      return true
    } catch (e) {
      setSaveLabel((e as Error).message)
      return false
    }
  }, [])

  useEffect(() => {
    if (!draft?.id || !spec) return
    const parsed = DraftMetaSchema.safeParse(meta)
    const payload = JSON.stringify({ spec, meta: parsed.success ? parsed.data : meta })
    if (skipSave.current) {
      skipSave.current = false
      lastSaved.current = payload
      return
    }
    if (payload === lastSaved.current) return
    dirty.current = true
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void persist()
    }, 500)
  }, [spec, meta, draft?.id, persist])

  const isCuts =
    draft?.format === 'clip' && ((spec as ClipSpec | null)?.structure ?? 'overlay') === 'cuts'
  const isOverlay =
    draft?.format === 'clip' && ((spec as ClipSpec | null)?.structure ?? 'overlay') === 'overlay'
  const clipSpec = draft?.format === 'clip' ? (spec as ClipSpec) : null

  const brollPaths = useMemo(() => {
    if (!clipSpec) return [] as string[]
    if (clipSpec.brollPaths?.length) return clipSpec.brollPaths
    return assets
      .filter((a) => a.kind === 'broll' && a.tag === clipSpec.brollTag)
      .map((a) => a.path)
      .sort()
  }, [clipSpec, assets])

  const segments = useMemo(() => {
    if (!clipSpec || !isCuts) return [] as EditedSegment[]
    return resolveClipSegments(clipSpec, brollPaths)
  }, [clipSpec, brollPaths, isCuts])

  const custom = Boolean(clipSpec?.segments?.length)
  const totalS = segmentsDurationS(segments)
  const durations = useMemo(() => segments.map((s) => s.durS), [segments])
  const [looped] = useLoop(durations, playing && isCuts)
  const playIndex = Math.min(playing ? looped : selected, Math.max(0, segments.length - 1))
  const segment = segments[playIndex]

  const overlayTimeline = useMemo(() => {
    if (!clipSpec || !isOverlay) return null
    return buildClipTimeline(clipSpec.chat)
  }, [clipSpec, isOverlay])

  const overlayState =
    overlayTimeline && overlayTimeline.states[Math.min(overlayIndex, overlayTimeline.states.length - 1)]

  const slideCount = useMemo(() => {
    if (!draft || !spec) return 0
    if (draft.format === 'carousel') return carouselSlideCount(spec as CarouselSpec)
    if (draft.format === 'slideshow') return (spec as SlideshowSpec).slides.length
    return 0
  }, [draft, spec])

  const setClip = (next: ClipSpec) => setSpec(next)

  const editSegments = (next: EditedSegment[], keepIndex = selected) => {
    if (!clipSpec) return
    setClip({ ...clipSpec, segments: next })
    setPlaying(false)
    setSelected(Math.max(0, Math.min(keepIndex, next.length - 1)))
    setDockTab('clip')
  }

  const replaceAt = (at: number, patch: Partial<EditedSegment>) =>
    editSegments(
      segments.map((s, i) => (i === at ? ({ ...s, ...patch } as EditedSegment) : s)),
      at,
    )

  const setChat = (chat: ChatSpec) => {
    if (!clipSpec) return
    setClip({
      ...clipSpec,
      chat,
      segments: clipSpec.segments?.length ? reconcileSegments(clipSpec.segments, chat) : undefined,
    })
  }

  const setDuration = (at: number, seconds: number | null) => {
    if (!clipSpec) return
    if (custom) {
      if (seconds !== null) replaceAt(at, { durS: seconds })
      return
    }
    const { field, key } = timingKeyFor(segments, at)
    const timing = { ...(clipSpec.timing ?? {}) }
    if (key) {
      const map = { ...((timing[field] as Record<string, number> | undefined) ?? {}) }
      if (seconds === null) delete map[key]
      else map[key] = seconds
      ;(timing as Record<string, unknown>)[field] = Object.keys(map).length ? map : undefined
    } else if (seconds === null) {
      delete (timing as Record<string, unknown>)[field]
    } else {
      ;(timing as Record<string, unknown>)[field] = seconds
    }
    setClip({
      ...clipSpec,
      timing: Object.values(timing).some(Boolean) ? timing : undefined,
    })
  }

  const isPinned = (at: number): boolean => {
    if (!clipSpec || custom) return false
    const { field, key } = timingKeyFor(segments, at)
    const value = clipSpec.timing?.[field as keyof typeof clipSpec.timing]
    return key ? Boolean((value as Record<string, number> | undefined)?.[key]) : value !== undefined
  }

  const setBeatClip = (at: number, assetPath: string | null) => {
    if (!clipSpec) return
    if (custom) {
      if (assetPath) replaceAt(at, { path: assetPath })
      return
    }
    const ordinal = brollOrdinal(segments, at)
    if (ordinal < 0) return
    const slots = { ...(clipSpec.brollSlots ?? {}) }
    if (assetPath === null) delete slots[String(ordinal)]
    else slots[String(ordinal)] = assetPath
    setClip({ ...clipSpec, brollSlots: Object.keys(slots).length ? slots : undefined })
  }

  const mediaUrl = (s: EditedSegment) =>
    (s.type === 'broll' || s.type === 'image') && s.path ? `/files/${s.path}` : ''

  const runExport = async () => {
    if (!draft || !spec) return
    setExportBusy(true)
    setExportError(null)
    setOutputs([])
    setExportUi('rendering')
    try {
      if (dirty.current || saveTimer.current) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        const saved = await persist()
        if (!saved) {
          setExportBusy(false)
          setExportError('Fix caption or hashtags before export')
          setExportUi('error')
          return
        }
      }
      await api.patchDraft(draft.id, { spec: specRef.current, meta: metaRef.current, status: 'approved' })
      const { jobId } = await api.render(draft.id)
      if (pollTimer.current) window.clearInterval(pollTimer.current)
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
              setExportUi('ready')
              const { draft: updated } = await api.draft(draft.id)
              setDraft(updated)
            } else {
              setExportError(r.job.message ?? 'Render failed')
              setExportUi('error')
            }
            setExportBusy(false)
          }
        } catch {
          // keep polling
        }
      }, 1500)
    } catch (e) {
      setExportError((e as Error).message)
      setExportBusy(false)
      setExportUi('error')
    }
  }

  const copyCaption = async () => {
    if (!draft) return
    const text = await fetch(`/files/out/exports/${draft.id}/caption.txt`).then((r) => r.text())
    await navigator.clipboard.writeText(text)
    showToast('Caption copied')
  }

  if (!draft || !spec) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-500">
        Loading…
      </div>
    )
  }

  const title = caption || (clipSpec?.hook ?? 'Untitled')

  const visibleTabs: DockTab[] = isCuts
    ? ['clip', 'media', 'chat', 'audio', 'caption']
    : draft.format === 'clip'
      ? ['media', 'chat', 'audio', 'caption']
      : ['chat', 'caption']

  const renderPreview = (height: number) => {
    if (isCuts && clipSpec) {
      return (
        <ClipPlayer
          segments={segments}
          chat={clipSpec.chat}
          hook={clipSpec.hook}
          mediaUrls={segments.map(mediaUrl)}
          storyUrl={clipSpec.storyImagePath ? `/files/${clipSpec.storyImagePath}` : undefined}
          height={height}
          playing={playing}
          activeIndex={playing ? undefined : selected}
        />
      )
    }
    return (
      <DraftPreview
        draft={{ format: draft.format, spec }}
        height={height}
        slideIndex={slideIndex}
        visibleCount={overlayState?.visibleCount}
        showTyping={overlayState?.typing ?? false}
      />
    )
  }

  const timeline = (() => {
    if (isCuts && clipSpec) {
      return (
        <div>
          <CutsTimeline
            spec={clipSpec}
            segments={segments}
            selected={selected}
            playing={playing}
            totalS={totalS}
            insertAt={insertAt}
            onInsertAt={(i) => {
              setInsertAt(i)
              if (i !== null) setDockTab('clip')
            }}
            onSelect={(i) => {
              setPlaying(false)
              setSelected(i)
              setInsertAt(null)
              setDockTab('clip')
            }}
            onTogglePlay={() => {
              if (playing) setSelected(playIndex)
              setPlaying(!playing)
            }}
          />
          {Math.abs(totalS - CUTS_TARGET_S) > 0.6 && (
            <div className="flex items-center gap-2 border-t border-neutral-900 px-5 py-2 text-xs sm:px-8">
              <span className="text-amber-400">
                {totalS.toFixed(1)}s (target {CUTS_TARGET_S}s)
              </span>
              <button
                onClick={() => editSegments(fitToTarget(segments))}
                className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500"
              >
                Fit to {CUTS_TARGET_S}s
              </button>
            </div>
          )}
        </div>
      )
    }
    if (isOverlay && overlayTimeline) {
      return (
        <ScrubTimeline
          label="State"
          index={overlayIndex}
          count={overlayTimeline.states.length}
          onChange={setOverlayIndex}
          durationLabel={`${overlayTimeline.durationS}s`}
        />
      )
    }
    if (slideCount > 0) {
      return (
        <ScrubTimeline
          label={draft.format === 'carousel' ? 'Screen' : 'Slide'}
          index={slideIndex}
          count={slideCount}
          onChange={setSlideIndex}
        />
      )
    }
    return null
  })()

  const dockBody = (() => {
    if (insertAt !== null && clipSpec) {
      return (
        <InsertPanel
          assets={assets}
          spec={clipSpec}
          onCancel={() => setInsertAt(null)}
          onInsert={(frame) => {
            const next = [...segments]
            next.splice(insertAt, 0, frame)
            editSegments(next, insertAt)
            setInsertAt(null)
          }}
        />
      )
    }

    if (dockTab === 'caption') {
      return (
        <CaptionPanel
          caption={caption}
          hashtags={hashtags}
          song={song}
          gate={gate}
          hook={clipSpec?.hook}
          onChange={(next) => {
            if (next.caption !== undefined) setCaption(next.caption)
            if (next.hashtags !== undefined) setHashtags(next.hashtags)
            if (next.song !== undefined) setSong(next.song)
            if (next.gate !== undefined) setGate(next.gate)
            if (next.hook !== undefined && clipSpec) {
              setClip({ ...clipSpec, hook: next.hook })
            }
          }}
        />
      )
    }

    if (dockTab === 'audio' && clipSpec) {
      return (
        <AudioPanel
          withMusic={clipSpec.withMusic}
          onChange={(v) => setClip({ ...clipSpec, withMusic: v })}
        />
      )
    }

    if (dockTab === 'media') {
      return (
        <MediaPanel
          clipSpec={clipSpec ?? undefined}
          onClipChange={clipSpec ? setClip : undefined}
          onLibraryChange={() => {
            api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing))).catch(() => {})
          }}
        />
      )
    }

    if (dockTab === 'clip' && isCuts && clipSpec) {
      const inspect = segments[Math.min(selected, Math.max(0, segments.length - 1))]
      if (!inspect) {
        return <p className="text-sm text-neutral-500">Tap a frame on the timeline to edit it.</p>
      }
      return (
        <ClipInspector
          spec={clipSpec}
          segment={inspect}
          selected={selected}
          segments={segments}
          assets={assets}
          custom={custom}
          isPinned={isPinned(selected)}
          onClearPin={() => setDuration(selected, null)}
          onMove={(by) => {
            const to = selected + by
            if (to < 0 || to >= segments.length) return
            const next = [...segments]
            ;[next[selected], next[to]] = [next[to], next[selected]]
            editSegments(next, to)
          }}
          onRemove={() => {
            if (segments.length <= 2) return
            editSegments(
              segments.filter((_, i) => i !== selected),
              Math.max(0, selected - 1),
            )
          }}
          onSetDuration={(s) => setDuration(selected, s)}
          onSetClip={(path) => setBeatClip(selected, path)}
          onTrim={(trimStartS, trimEndS) =>
            editSegments(
              segments.map((s, i) =>
                i === selected && s.type === 'broll'
                  ? {
                      ...s,
                      trimStartS,
                      trimEndS,
                      durS: Math.round((trimEndS - trimStartS) * 10) / 10,
                    }
                  : s,
              ),
              selected,
            )
          }
          onEditMessage={(text) => {
            if (inspect.type !== 'chat') return
            setChat({
              ...clipSpec.chat,
              messages: clipSpec.chat.messages.map((m, i) =>
                i === inspect.visibleCount - 1 ? { ...m, text } : m,
              ),
            })
          }}
          onResetStructure={() => {
            setClip({ ...clipSpec, segments: undefined })
            setSelected(0)
          }}
        />
      )
    }

    if (dockTab === 'chat') {
      if (draft.format === 'clip' && clipSpec) {
        const instagram = (clipSpec.chat.skin ?? 'imessage') === 'instagram'
        return (
          <div className="space-y-4">
            {instagram && (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={Boolean(clipSpec.chat.storyReply)}
                  onChange={(e) =>
                    setChat({ ...clipSpec.chat, storyReply: e.target.checked })
                  }
                />
                First message replies to a story
              </label>
            )}
            <ConversationEditor
              messages={clipSpec.chat.messages}
              onChange={(messages) => setChat({ ...clipSpec.chat, messages })}
              highlight={
                isCuts && !playing && segment?.type === 'chat' ? segment.visibleCount : undefined
              }
              onFocusMessage={(i) => {
                if (!isCuts) return
                setPlaying(false)
                const at = segments.findIndex((s) => s.type === 'chat' && s.visibleCount === i + 1)
                if (at >= 0) setSelected(at)
              }}
            />
          </div>
        )
      }
      if (draft.format === 'carousel') {
        const c = spec as CarouselSpec
        if (c.chat) {
          return (
            <ConversationEditor
              messages={c.chat.messages}
              onChange={(messages) => setSpec({ ...c, chat: { ...c.chat!, messages } })}
            />
          )
        }
        const slides = c.slides ?? []
        const slide = slides[Math.min(slideIndex, slides.length - 1)]
        if (!slide) return <p className="text-sm text-neutral-500">No slide selected.</p>
        return (
          <ConversationEditor
            messages={slide.messages}
            onChange={(messages) =>
              setSpec({
                ...c,
                slides: slides.map((s, i) => (i === slideIndex ? { ...s, messages } : s)),
              })
            }
          />
        )
      }
      if (draft.format === 'slideshow') {
        const s = spec as SlideshowSpec
        const slide = s.slides[Math.min(slideIndex, s.slides.length - 1)]
        if (!slide) return null
        return (
          <div className="space-y-2">
            <input
              value={slide.title}
              onChange={(e) =>
                setSpec({
                  ...s,
                  slides: s.slides.map((sl, i) =>
                    i === slideIndex ? { ...sl, title: e.target.value } : sl,
                  ),
                })
              }
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-medium"
            />
            {(slide.lines ?? []).map((line, li) => (
              <input
                key={li}
                value={line}
                onChange={(e) =>
                  setSpec({
                    ...s,
                    slides: s.slides.map((sl, i) =>
                      i === slideIndex
                        ? {
                            ...sl,
                            lines: (sl.lines ?? []).map((l, index) =>
                              index === li ? e.target.value : l,
                            ),
                          }
                        : sl,
                    ),
                  })
                }
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm"
              />
            ))}
          </div>
        )
      }
    }

    return <p className="text-sm text-neutral-500">Select a tab to edit.</p>
  })()

  const fileBase = exported
    ? `/files/out/exports/${draft.id}`
    : job
      ? `/files/out/render/${job.id}`
      : null

  return (
    <>
      <EditorShell
        title={title}
        saveLabel={saveLabel}
        onExport={() => {
          if (exported && fileBase && !exportBusy) {
            setExportUi('ready')
            return
          }
          void runExport()
        }}
        exportBusy={exportBusy}
        exportLabel={exported && !exportBusy ? 'Share' : 'Export'}
      >
        {{
          preview: (
            <PreviewStage>
              {(height) => renderPreview(height)}
            </PreviewStage>
          ),
          timeline,
          dock: (
            <EditorDock
              tab={dockTab}
              onTab={(t) => {
                if (t === 'clip' && isCuts && playing) {
                  setSelected(playIndex)
                  setPlaying(false)
                }
                setDockTab(t)
              }}
              visibleTabs={visibleTabs}
            >
              {dockBody}
            </EditorDock>
          ),
        }}
      </EditorShell>
      {exportUi && (
        <ExportReady
          mode={exportUi}
          progress={job?.progress ?? 0}
          statusMessage={job?.message ?? null}
          error={exportError}
          format={draft.format}
          fileBase={fileBase ?? `/files/out/exports/${draft.id}`}
          files={outputs}
          caption={caption}
          hashtags={hashtags.split(/\s+/).filter(Boolean)}
          song={song}
          posted={draft.status === 'posted'}
          onClose={() => setExportUi(null)}
          onCopy={copyCaption}
          onPosted={() => {
            api.markPosted(draft.id).then(({ draft: updated }) => {
              setDraft(updated)
              showToast('Marked as posted')
            })
          }}
          onRetry={() => {
            setExportUi(null)
            void runExport()
          }}
        />
      )}
      <Toast message={toast} />
    </>
  )
}
