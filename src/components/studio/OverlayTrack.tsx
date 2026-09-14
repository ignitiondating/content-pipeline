import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSpec } from '@shared/formats/chat'
import type { ClipSpec } from '@shared/formats/clip'
import { timelinePosition } from '@shared/playback'
import {
  fitBackground,
  reconcileReveals,
  resolveOverlayEdit,
  retimeBackground,
  type BackgroundSegment,
  type OverlayEdit,
} from '@shared/timeline'
import { fadesForSegments, suggestedFadeS } from '@shared/transitions'
import { CLIP_LIMITS } from '@shared/formats/clip'
import AiScript from './AiScript'
import ConversationEditor from './ConversationEditor'
import EditTimeline, { type TimelineLane } from './EditTimeline'
import MediaLibrary from './MediaLibrary'
import OverlayPreview from './OverlayPreview'
import StoryPicker from './StoryPicker'
import TrimBar from './TrimBar'
import { useTimelinePlayback } from '../../lib/useTimelinePlayback'
import { api, type AssetItem } from '../../lib/api'

const BG_LANE = 'bg'
const REVEALS_LANE = 'reveals'

/**
 * The floating-conversation editor. Same timeline as the hard-cut one, but on
 * two lanes: the footage runs underneath and the card reveals on top. The
 * conversation owns the runtime; the footage is always fitted to cover it.
 */
export default function OverlayTrack({
  spec,
  onChange: updateSpec,
  onReadyChange,
  onRender,
  renderBusy = false,
}: {
  spec: ClipSpec
  onChange: (spec: ClipSpec) => void
  onReadyChange?: (ready: boolean) => void
  onRender?: () => void
  renderBusy?: boolean
}) {
  const history = useRef<ClipSpec[]>([])
  const editingGesture = useRef(false)
  const [editError, setEditError] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [playing, setPlaying] = useState(false)
  /** Where the playhead sits when it isn't running. */
  const [atS, setAtS] = useState(0)
  const [selected, setSelected] = useState<{ laneId: string; index: number }>({ laneId: BG_LANE, index: 0 })
  const hookInput = useRef<HTMLInputElement>(null)
  const scriptSection = useRef<HTMLDivElement>(null)

  const onChange = (next: ClipSpec) => {
    if (!editingGesture.current) history.current = [...history.current.slice(-39), spec]
    updateSpec(next)
  }

  useEffect(() => {
    api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing)))
      .catch(() => setEditError('Could not load the footage library. Refresh to try again.'))
      .finally(() => setAssetsLoaded(true))
  }, [])

  const brollPaths = useMemo(() => {
    if (spec.brollPaths?.length) return spec.brollPaths
    return assets.filter((a) => a.kind === 'broll' && a.tag === spec.brollTag).map((a) => a.path).sort()
  }, [spec.brollPaths, spec.brollTag, assets])

  // The one door: the frozen edit, or the structure derived from the chat.
  const edit = useMemo(() => resolveOverlayEdit(spec, brollPaths), [spec, brollPaths])
  const custom = Boolean(spec.overlay?.reveals.length)
  const fades = useMemo(() => fadesForSegments(edit.bg), [edit.bg])

  const revealDurations = useMemo(() => edit.reveals.map((r) => r.durS), [edit.reveals])
  const { time: clockTime, seek } = useTimelinePlayback(revealDurations, playing)
  const playheadTime = playing ? clockTime : atS
  const at = (durations: number[], time: number) => timelinePosition(durations, time)
  const revealAt = at(revealDurations, playheadTime)
  const bgAt = at(edit.bg.map((b) => b.durS), playheadTime)
  const startOf = (durations: number[], index: number) => durations.slice(0, index).reduce((sum, d) => sum + d, 0)

  const missingHook = !spec.hook.trim()
  const emptyMessage = spec.chat.messages.findIndex((message) => !message.text.trim())
  const missingMediaAt = edit.bg.findIndex((cut) => !cut.path || !assets.some((a) => a.path === cut.path))
  const missingReveals = spec.chat.messages.some((_, i) => !edit.reveals.some((r) => !r.typing && r.visibleCount === i + 1))
  const ready = assetsLoaded && !missingHook && emptyMessage === -1 && spec.chat.messages.length > 0
    && missingMediaAt === -1 && !missingReveals
  useEffect(() => { onReadyChange?.(ready) }, [ready, onReadyChange])

  const offTarget = edit.durationS < CLIP_LIMITS.minDurationS || edit.durationS > CLIP_LIMITS.maxDurationS

  /** Any structural edit freezes the two tracks — from here they are the truth. */
  const editOverlay = (next: OverlayEdit, keep = selected) => {
    onChange({ ...spec, overlay: { bg: next.bg, reveals: next.reveals } })
    setPlaying(false)
    setSelected({ laneId: keep.laneId, index: Math.max(0, keep.index) })
  }
  const editBackground = (bg: BackgroundSegment[], index = selected.index) =>
    editOverlay({ bg, reveals: edit.reveals }, { laneId: BG_LANE, index })

  const setChat = (chat: ChatSpec) =>
    onChange({
      ...spec,
      chat,
      overlay: spec.overlay ? { ...spec.overlay, reveals: reconcileReveals(spec.overlay.reveals, chat) } : undefined,
    })

  const clips = assets.filter((a) => a.kind === 'broll')
  const selectedCut = selected.laneId === BG_LANE ? edit.bg[selected.index] : undefined
  const selectedReveal = selected.laneId === REVEALS_LANE ? edit.reveals[selected.index] : undefined

  const lanes: TimelineLane[] = [
    {
      id: BG_LANE, label: 'Footage',
      reorder: edit.bg.length > 1, resize: edit.bg.length > 1, trim: true, acceptsAsset: true,
      blocks: edit.bg.map((cut, i) => ({
        key: `${i}-${cut.path}`,
        label: cut.path.split('/').pop() || 'Choose footage',
        durS: cut.durS,
        tone: cut.type,
        fade: fades[i],
        film: cut.path
          ? { path: cut.path, fromS: cut.type === 'broll' ? cut.trimStartS ?? 0 : 0,
              keptS: cut.type === 'broll' && cut.trimStartS !== undefined && cut.trimEndS !== undefined
                ? Math.max(0.1, cut.trimEndS - cut.trimStartS) : cut.durS }
          : undefined,
      })),
    },
    {
      id: REVEALS_LANE, label: 'Conversation', clock: true, resize: true,
      blocks: edit.reveals.map((reveal, i) => ({
        key: `${i}-${reveal.visibleCount}-${reveal.typing}`,
        label: reveal.typing ? 'Typing…' : reveal.visibleCount === 0 ? 'Empty thread' : `Message ${reveal.visibleCount}`,
        durS: reveal.durS,
        tone: reveal.typing ? 'typing' : 'chat',
      })),
    },
  ]

  const togglePlayback = () => {
    if (playing) setAtS(clockTime)
    else seek(revealAt.index, revealAt.offset)
    setPlaying(!playing)
  }

  const pickCut = (assetPath: string, index: number) => {
    const existing = edit.bg[index]
    if (existing) {
      editBackground(edit.bg.map((cut, i) => i === index
        ? { type: 'broll', path: assetPath, durS: cut.durS } : cut), index)
      return
    }
    // Appending splits the runtime with the clip before it.
    const last = edit.bg[edit.bg.length - 1]
    const half = Math.max(0.4, Math.round((last.durS / 2) * 10) / 10)
    editBackground([
      ...edit.bg.slice(0, -1),
      { ...last, durS: half },
      { type: 'broll', path: assetPath, durS: Math.max(0.4, Math.round((last.durS - half) * 10) / 10) },
    ], edit.bg.length)
  }

  return (
    <fieldset className="min-w-0">
      <section aria-label="Video readiness" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-900/40 p-3">
        <div>
          <p className="text-sm font-semibold">{!assetsLoaded ? 'Checking your video…' : ready ? 'Ready to preview and render' : 'Finish these details'}</p>
          <p className="mt-1 text-xs text-neutral-400">{ready ? 'Hook, script, and footage are in place. Review the video, then render below.' : 'Fix the missing items here. Your edit stays on this page.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {missingHook && <button onClick={() => hookInput.current?.focus()} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Add a hook</button>}
          {emptyMessage >= 0 && <button onClick={() => (scriptSection.current?.querySelectorAll('textarea[aria-label^="Message "]')[Math.max(0, emptyMessage)] as HTMLTextAreaElement | undefined)?.focus()} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Finish message {emptyMessage + 1}</button>}
          {assetsLoaded && missingMediaAt >= 0 && <button onClick={() => setSelected({ laneId: BG_LANE, index: missingMediaAt })} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Choose or upload footage</button>}
          {missingReveals && <button onClick={() => editOverlay({ bg: edit.bg, reveals: reconcileReveals(edit.reveals, spec.chat) })} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Restore missing messages</button>}
          {ready && onRender && <button disabled={renderBusy} onClick={onRender} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">{renderBusy ? 'Preparing…' : 'Render video'}</button>}
        </div>
      </section>
      {editError && <p role="alert" className="mb-3 text-sm text-red-400">{editError}</p>}

      <EditTimeline lanes={lanes} selected={selected} currentTime={playheadTime} playing={playing} onTogglePlay={togglePlayback}
        onSelect={(laneId, index) => {
          setPlaying(false)
          setSelected({ laneId, index })
          const durations = laneId === BG_LANE ? edit.bg.map((b) => b.durS) : revealDurations
          setAtS(startOf(durations, index))
        }}
        onScrub={(index, offset) => {
          const time = startOf(revealDurations, index) + offset
          setAtS(time)
          if (playing) seek(index, offset)
        }}
        onReorder={(laneId, from, to) => {
          if (laneId !== BG_LANE) return
          const bg = [...edit.bg]
          const [moved] = bg.splice(from, 1)
          const index = Math.min(to, bg.length)
          bg.splice(index, 0, moved)
          editBackground(bg, index)
        }}
        onResize={(laneId, index, durS) => {
          if (laneId === BG_LANE) { editBackground(retimeBackground(edit.bg, index, durS), index); return }
          // Retiming a reveal changes the runtime; the footage re-fits to it.
          editOverlay({ bg: edit.bg, reveals: edit.reveals.map((r, i) => i === index ? { ...r, durS } : r) },
            { laneId: REVEALS_LANE, index })
        }}
        onTrim={(laneId, index, fromS, durS) => {
          if (laneId !== BG_LANE) return
          const retimed = retimeBackground(edit.bg, index, durS)
          editBackground(retimed.map((cut, i) => i === index && cut.type === 'broll'
            ? { ...cut, trimStartS: fromS, trimEndS: fromS + cut.durS } : cut), index)
        }}
        onDropAsset={(laneId, path, index) => { if (laneId === BG_LANE) pickCut(path, index) }}
        onEditStart={() => { history.current = [...history.current.slice(-39), spec]; editingGesture.current = true }}
        onEditEnd={() => { editingGesture.current = false }} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button disabled={!history.current.length} onClick={() => { const previous = history.current.pop(); if (previous) updateSpec(previous); setPlaying(false) }} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs disabled:opacity-30">Undo edit</button>
        {custom && <button onClick={() => { onChange({ ...spec, overlay: undefined }); setPlaying(false); setAtS(0) }} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs">Back to automatic</button>}
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1.15fr)_minmax(260px,1fr)]">
        <div className="min-w-0">
          <div className="mb-2 text-xs text-neutral-500">Video preview · 9:16</div>
          <div className="flex justify-center lg:block">
            <OverlayPreview spec={spec} bg={edit.bg[bgAt.index]} bgOffsetS={bgAt.offset}
              fade={fades[bgAt.index]} state={edit.states[revealAt.index]} playing={playing} height={340} />
          </div>
          <p className={`mt-3 text-sm tabular-nums ${offTarget ? 'text-amber-400' : 'text-neutral-400'}`}>
            {edit.durationS.toFixed(1)}s total{offTarget ? ` (aim for ${CLIP_LIMITS.minDurationS}–${CLIP_LIMITS.maxDurationS}s)` : ''}
          </p>
          {offTarget && custom && <button onClick={() => {
            const target = Math.min(CLIP_LIMITS.maxDurationS, Math.max(CLIP_LIMITS.minDurationS, edit.durationS))
            const scale = target / edit.durationS
            const reveals = edit.reveals.map((r) => ({ ...r, durS: Math.round(Math.max(0.4, r.durS * scale) * 10) / 10 }))
            editOverlay({ bg: fitBackground(edit.bg, reveals.reduce((sum, r) => sum + r.durS, 0)), reveals })
          }} className="mt-2 rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500">Fit to {CLIP_LIMITS.minDurationS}–{CLIP_LIMITS.maxDurationS}s</button>}
        </div>

        <div ref={scriptSection} className="min-w-0 rounded-xl border border-neutral-800 p-4 xl:max-h-[650px] xl:overflow-y-auto">
          <h3 className="mb-4 text-sm font-semibold">Hook & script</h3>
          <label className="mb-4 block text-xs text-neutral-400">On-screen hook
            <input ref={hookInput} value={spec.hook} maxLength={80} onChange={(e) => onChange({ ...spec, hook: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" />
          </label>
          <p className="mb-4 text-xs text-neutral-500">This is the first line viewers see. Give them a reason to keep watching.</p>
          {spec.chat.skin === 'instagram' && spec.chat.storyReply && (
            <StoryPicker path={spec.storyImagePath} assets={assets} onAssets={setAssets}
              onChange={(storyImagePath) => onChange({ ...spec, storyImagePath })} onPreview={() => { setPlaying(false); setAtS(0) }} />
          )}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Conversation · edit every line</div>
          <ConversationEditor messages={spec.chat.messages} onChange={(messages) => setChat({ ...spec.chat, messages })}
            highlight={!playing && !edit.reveals[revealAt.index]?.typing ? edit.reveals[revealAt.index]?.visibleCount : undefined}
            onFocusMessage={(i) => {
              setPlaying(false)
              const target = edit.reveals.findIndex((r) => !r.typing && r.visibleCount === i + 1)
              if (target >= 0) { setSelected({ laneId: REVEALS_LANE, index: target }); setAtS(startOf(revealDurations, target)) }
            }} />
          <AiScript hook={spec.hook} chat={spec.chat} onChange={setChat} />
        </div>

        <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:max-h-[650px] xl:overflow-y-auto">
          <h3 className="mb-1 font-semibold">Footage</h3>
          <p className="mb-3 text-sm text-neutral-400">The conversation floats over this. Cut between clips, or drag one onto the timeline.</p>
          <MediaLibrary compact tag={spec.brollTag} onAssets={setAssets}
            onPick={(asset) => pickCut(asset.path, selected.laneId === BG_LANE ? selected.index : 0)}
            onUploadComplete={(uploaded) => pickCut(uploaded[0].path, selected.laneId === BG_LANE ? selected.index : 0)} />

          {selectedCut && (
            <div className="mb-6 rounded-xl border border-neutral-800 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{selectedCut.path.split('/').pop() || 'Footage'}</span>
                <button disabled={edit.bg.length <= 1}
                  onClick={() => editBackground(fitBackground(edit.bg.filter((_, i) => i !== selected.index), edit.durationS), Math.max(0, selected.index - 1))}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-400 disabled:opacity-30 hover:border-red-500 hover:text-red-400">Remove</button>
              </div>
              {selectedCut.type === 'broll' && selectedCut.path && (
                <div className="mb-4">
                  <p className="mb-2 text-xs text-neutral-400">Drag the handles to pick where this clip starts and stops.</p>
                  <TrimBar assetPath={selectedCut.path} trimStartS={selectedCut.trimStartS} trimEndS={selectedCut.trimEndS}
                    onChange={({ trimStartS, trimEndS }) => {
                      const durS = Math.min(20, Math.max(0.4, Math.round((trimEndS - trimStartS) * 10) / 10))
                      const retimed = retimeBackground(edit.bg, selected.index, durS)
                      editBackground(retimed.map((cut, i) => i === selected.index && cut.type === 'broll'
                        ? { ...cut, trimStartS, trimEndS: trimStartS + cut.durS } : cut), selected.index)
                    }} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input type="checkbox" aria-label="Fade this clip to black" checked={selectedCut.fadeS !== undefined}
                    onChange={(e) => editBackground(edit.bg.map((cut, i) => i === selected.index
                      ? { ...cut, fadeS: e.target.checked ? suggestedFadeS(cut.durS) : undefined } : cut), selected.index)} />
                  Fade to black
                </label>
                {selectedCut.fadeS !== undefined && <>
                  <input id="cut-fade" aria-label="Fade length in seconds" type="number" step="0.05" min="0.05" max="2"
                    value={selectedCut.fadeS}
                    onChange={(e) => {
                      const seconds = Number(e.target.value)
                      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 2) {
                        editBackground(edit.bg.map((cut, i) => i === selected.index ? { ...cut, fadeS: seconds } : cut), selected.index)
                      }
                    }}
                    className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm tabular-nums" />
                  <span className="text-xs text-neutral-500">seconds</span>
                </>}
              </div>
            </div>
          )}

          {selectedReveal && (
            <div className="mb-6 rounded-xl border border-neutral-800 p-4">
              <div className="mb-3 text-sm font-semibold">{selectedReveal.typing ? 'Typing indicator' : selectedReveal.visibleCount === 0 ? 'Before the first message' : `Message ${selectedReveal.visibleCount}`}</div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="reveal-duration" className="text-xs text-neutral-400">On screen for</label>
                <input id="reveal-duration" type="number" step="0.1" min="0.4" max="20" value={selectedReveal.durS}
                  onChange={(e) => {
                    const seconds = Number(e.target.value)
                    if (!Number.isFinite(seconds) || seconds < 0.4 || seconds > 20) return
                    editOverlay({ bg: edit.bg, reveals: edit.reveals.map((r, i) => i === selected.index ? { ...r, durS: seconds } : r) },
                      { laneId: REVEALS_LANE, index: selected.index })
                  }}
                  className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm tabular-nums" />
                <span className="text-xs text-neutral-500">seconds</span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">Changing this changes how long the video runs; the footage underneath stretches to cover it.</p>
            </div>
          )}
        </div>
      </div>
    </fieldset>
  )
}
