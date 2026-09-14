import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSpec } from '@shared/formats/chat'
import type { ClipSpec, FadeStyle } from '@shared/formats/clip'
import {
  CUTS_TARGET_S,
  fitToTarget,
  promoContentFor,
  reconcileSegments,
  resolveClipSegments,
  segmentsDurationS,
  type EditedSegment,
} from '@shared/timeline'
import ClipPlayer, { ClipFrame } from './ClipPlayer'
import ConversationEditor from './ConversationEditor'
import AiScript from './AiScript'
import StoryPicker from './StoryPicker'
import AssetPicker from './AssetPicker'
import TrimBar from './TrimBar'
import EditTimeline, { type TimelineLane } from './EditTimeline'
import MediaLibrary from './MediaLibrary'
import { DEFAULT_FADE_STYLE, fadesForSegments } from '@shared/transitions'
import { remixClip } from '@shared/templates'
import Scaled from './Scaled'
import { useTimelinePlayback } from '../../lib/useTimelinePlayback'
import { api, type AssetItem } from '../../lib/api'

/** Which timing key a segment writes to, so pins survive text edits. */
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

/** How many b-roll frames come before this one (0 = the intro clip). */
function brollOrdinal(segments: EditedSegment[], index: number): number {
  if (segments[index]?.type !== 'broll') return -1
  return segments.slice(0, index).filter((s) => s.type === 'broll').length
}

/**
 * The video before it's a video: the real structure, every frame editable,
 * every beat retimeable. What renders afterwards is exactly this.
 */
export default function Storyboard({
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
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [direction, setDirection] = useState('Keep it punchy, with short B-roll cutaways and enough time to read each message.')
  const [seekOffset, setSeekOffset] = useState<number | undefined>()
  const onChange = (next: ClipSpec) => {
    if (!editingGesture.current) history.current = [...history.current.slice(-39), spec]
    updateSpec(next)
  }
  const storySection = useRef<HTMLDivElement>(null)
  const hookInput = useRef<HTMLInputElement>(null)
  const scriptSection = useRef<HTMLDivElement>(null)
  const footageSection = useRef<HTMLDivElement>(null)
  const [footageSlot, setFootageSlot] = useState(0)
  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [insertAt, setInsertAt] = useState<number | null>(null)

  useEffect(() => {
    api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing))).catch(() => setEditError('Could not load the footage library. Refresh to try again.')).finally(() => setAssetsLoaded(true))
  }, [])

  // The clips this video will actually use, in burst order.
  const brollPaths = useMemo(() => {
    if (spec.brollPaths?.length) return spec.brollPaths
    return assets
      .filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)
      .map((a) => a.path)
      .sort()
  }, [spec.brollPaths, spec.brollTag, assets])

  // The one door: the operator's frozen edit, or the structure derived from
  // the conversation. Both the player and the render read this same list.
  const segments = useMemo(() => resolveClipSegments(spec, brollPaths), [spec, brollPaths])
  const custom = Boolean(spec.segments?.length)
  const totalS = segmentsDurationS(segments)
  const footage = segments.filter((s) => s.type === 'broll')
  const includedClips = new Set(footage.filter((s) => s.path && assets.some((a) => a.path === s.path)).map((s) => s.path)).size
  const missingFootage = footage.some((s) => !s.path || !assets.some((a) => a.path === s.path))

  const hasStory = spec.chat.skin === 'instagram' && spec.chat.storyReply
  const missingStory = hasStory && Boolean(spec.storyImagePath) && !assets.some((a) => a.path === spec.storyImagePath)
  const previewStory = () => {
    const at = segments.findIndex((s) => s.type === 'chat' && s.visibleCount === 1)
    if (at >= 0) setSelected(at)
    setPlaying(false); setSeekOffset(undefined)
  }
  const missingHook = !spec.hook.trim()
  const emptyMessage = spec.chat.messages.findIndex((message) => !message.text.trim())
  const missingMediaAt = segments.findIndex((s) => (s.type === 'broll' || s.type === 'image') && (!s.path || !assets.some((a) => a.path === s.path)))
  const missingReveals = spec.chat.messages.some((_, i) => !segments.some((s) => s.type === 'chat' && s.visibleCount === i + 1))
  const ready = assetsLoaded && !missingHook && emptyMessage === -1 && spec.chat.messages.length > 0 && missingMediaAt === -1 && !missingReveals && !missingStory
  useEffect(() => { onReadyChange?.(ready) }, [ready, onReadyChange])
  const targetSlot = segments[selected]?.type === 'broll' ? selected : segments[footageSlot]?.type === 'broll' ? footageSlot : segments.findIndex((s) => s.type === 'broll')
  const focusFootage = () => {
    const at = missingMediaAt >= 0 ? missingMediaAt : targetSlot
    if (at >= 0) { setSelected(at); setFootageSlot(at); setPlaying(false); setSeekOffset(undefined) }
    footageSection.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const focusScript = () => {
    const target = scriptSection.current?.querySelectorAll('textarea[aria-label^="Message "]')[Math.max(0, emptyMessage)] as HTMLTextAreaElement | undefined
    target?.focus()
  }

  // The same list the renderer builds its fade filters from.
  const fades = useMemo(
    () =>
      fadesForSegments(segments, {
        style: spec.transitions?.style,
        storyFade: Boolean(spec.chat.storyReply) && spec.chat.messages.length > 1,
      }),
    [segments, spec.transitions?.style, spec.chat.storyReply, spec.chat.messages.length],
  )

  const label = (s: EditedSegment, i: number) =>
    s.type === 'chat'
      ? `Message ${s.visibleCount}`
      : s.type === 'promo'
        ? 'WingAI app'
        : s.type === 'image'
          ? 'Photo'
          : i === 0
            ? 'Intro clip'
            : i === segments.length - 1
              ? 'Closing clip'
              : `Clip ${brollOrdinal(segments, i)}`

  const lanes: TimelineLane[] = useMemo(() => [{
    id: 'main', label: 'Video', clock: true, reorder: true, resize: true, trim: true, acceptsAsset: true,
    blocks: segments.map((s, i) => ({
      key: `${i}-${s.type}`,
      label: label(s, i),
      durS: s.durS,
      tone: s.type,
      fade: fades[i],
      film: s.type === 'broll' && s.path
        ? { path: s.path, fromS: s.trimStartS ?? 0,
            keptS: s.trimStartS !== undefined && s.trimEndS !== undefined ? Math.max(0.1, s.trimEndS - s.trimStartS) : s.durS }
        : undefined,
    })),
  }], [segments, fades])

  const durations = useMemo(() => segments.map((s) => s.durS), [segments])
  const { index: looped, offset: playbackOffset, time: playbackTime, seek: seekLoop } = useTimelinePlayback(durations, playing)
  const index = Math.min(playing ? looped : selected, segments.length - 1)
  const segment = segments[index]
  const playheadTime = playing ? playbackTime : durations.slice(0, index).reduce((sum, duration) => sum + duration, 0) + (seekOffset ?? 0)
  const togglePlayback = () => {
    if (playing) { setSelected(index); setSeekOffset(playbackOffset) }
    else seekLoop(selected, seekOffset ?? 0)
    setPlaying(!playing)
  }

  const storyUrl = spec.storyImagePath ? `/files/${spec.storyImagePath}` : undefined

  /** Any structural edit freezes the timeline — from here it is the truth. */
  const editSegments = (next: EditedSegment[], keepIndex = selected) => {
    onChange({ ...spec, segments: next })
    setPlaying(false)
    setSeekOffset(undefined)
    const at = Math.max(0, Math.min(keepIndex, next.length - 1))
    setSelected(at)
    if (next[at]?.type === 'broll') setFootageSlot(at)
  }
  const replaceAt = (at: number, patch: Partial<EditedSegment>) =>
    editSegments(segments.map((s, i) => (i === at ? ({ ...s, ...patch } as EditedSegment) : s)), at)

  const setChat = (chat: ChatSpec) =>
    onChange({
      ...spec,
      chat,
      // A frozen edit follows the conversation instead of orphaning frames.
      segments: spec.segments?.length ? reconcileSegments(spec.segments, chat) : undefined,
    })

  const move = (at: number, by: -1 | 1) => {
    const to = at + by
    if (to < 0 || to >= segments.length) return
    const next = [...segments]
    ;[next[at], next[to]] = [next[to], next[at]]
    editSegments(next, to)
  }

  const remove = (at: number) => {
    if (segments.length <= 2) return
    editSegments(segments.filter((_, i) => i !== at), Math.max(0, at - 1))
  }

  const insert = (at: number, frame: EditedSegment) => {
    if (segments.length >= 60) { setEditError("A video can contain at most 60 beats."); return }
    const next = [...segments]
    next.splice(at, 0, frame)
    editSegments(next, at)
    setInsertAt(null)
  }

  const setDuration = (at: number, seconds: number | null) => {
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0.4 || seconds > 20)) return
    if (custom) {
      // With a frozen edit the number on the frame is the duration; there is
      // no solver left to hand it back to.
      if (seconds !== null) replaceAt(at, { durS: seconds })
      return
    }
    const { field, key } = timingKeyFor(segments, at)
    const timing = { ...(spec.timing ?? {}) }
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
    onChange({ ...spec, timing: Object.values(timing).some(Boolean) ? timing : undefined })
  }

  const isPinned = (at: number): boolean => {
    if (custom) return false
    const { field, key } = timingKeyFor(segments, at)
    const value = spec.timing?.[field as keyof typeof spec.timing]
    return key ? Boolean((value as Record<string, number> | undefined)?.[key]) : value !== undefined
  }

  const mediaUrl = (s: EditedSegment): string =>
    (s.type === 'broll' || s.type === 'image') && s.path ? `/files/${s.path}` : ''

  /** Swap the clip on one beat: the slot map while automatic, the frame itself once frozen. */
  const setClip = (at: number, assetPath: string | null) => {
    if (custom) {
      if (assetPath) replaceAt(at, { path: assetPath, trimStartS: undefined, trimEndS: undefined })
      return
    }
    const ordinal = brollOrdinal(segments, at)
    if (ordinal < 0) return
    const slots = { ...(spec.brollSlots ?? {}) }
    if (assetPath === null) delete slots[String(ordinal)]
    else slots[String(ordinal)] = assetPath
    onChange({ ...spec, brollSlots: Object.keys(slots).length ? slots : undefined })
  }

  const offTarget = Math.abs(totalS - CUTS_TARGET_S) > 0.6
  const photos = assets.filter((a) => ['background', 'shot', 'promo'].includes(a.kind))
  const clips = assets.filter((a) => a.kind === 'broll')
  const matchingClips = clips.filter((a) => a.tag === spec.brollTag)
  const fillMissingFootage = () => {
    let ordinal = 0
    editSegments(segments.map((s) => s.type === 'broll' && (!s.path || !assets.some((a) => a.path === s.path)) ? { ...s, path: matchingClips[ordinal++ % matchingClips.length].path, trimStartS: undefined, trimEndS: undefined } : s), Math.max(0, missingMediaAt))
  }
  const dropAsset = (assetPath: string, at: number) => {
    if (!clips.some((a) => a.path === assetPath)) return
    if (segments[at]?.type === 'broll') {
      editSegments(segments.map((s, i) => i === at ? { type: 'broll', path: assetPath, durS: s.durS } : s), at)
    } else insert(at, { type: 'broll', path: assetPath, durS: 2.8 })
  }
  const autoEdit = async () => {
    setEditBusy(true); setEditError('')
    try { const result = await api.aiEdit(spec, direction); onChange(result.spec); setPlaying(false); setSelected(0); setSeekOffset(undefined) }
    catch (e) { setEditError((e as Error).message) }
    finally { setEditBusy(false) }
  }

  return (
    <fieldset disabled={editBusy} className="min-w-0">
      <section aria-label="Video readiness" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-900/40 p-3">
        <div><p className="text-sm font-semibold">{!assetsLoaded ? 'Checking your video…' : ready ? 'Ready to preview and render' : 'Finish these details'}</p><p className="mt-1 text-xs text-neutral-400">{ready ? 'Hook, script, and media are in place. Review the video, then render below.' : 'Fix the missing items here. Your edit stays on this page.'}</p></div>
        <div className="flex flex-wrap gap-2">
          {missingHook && <button onClick={() => hookInput.current?.focus()} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Add a hook</button>}
          {emptyMessage >= 0 && <button onClick={focusScript} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Finish message {emptyMessage + 1}</button>}
          {assetsLoaded && missingFootage && matchingClips.length > 0 && <button onClick={fillMissingFootage} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Fill missing B-roll</button>}
          {assetsLoaded && missingMediaAt >= 0 && <button onClick={focusFootage} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">{segments[missingMediaAt]?.type === 'image' ? 'Replace missing image' : 'Choose or upload footage'}</button>}
          {assetsLoaded && missingStory && <button onClick={() => { storySection.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); storySection.current?.querySelector<HTMLButtonElement>('[data-replace-story]')?.click() }} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Replace missing story</button>}
          {missingReveals && <button onClick={() => editSegments(reconcileSegments(segments, spec.chat))} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950">Restore missing messages</button>}
          {ready && onRender && <button disabled={renderBusy} onClick={onRender} className="rounded-lg bg-wing-500 px-3 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">{renderBusy ? 'Preparing…' : 'Render video'}</button>}
        </div>
      </section>
      {editError && <p role="alert" className="mb-3 text-sm text-red-400">{editError}</p>}
      <EditTimeline lanes={lanes} selected={{ laneId: 'main', index }} currentTime={playheadTime} playing={playing} onTogglePlay={togglePlayback}
        onSelect={(_lane, at) => { setPlaying(false); setSelected(at); if (segments[at]?.type === 'broll') setFootageSlot(at); setSeekOffset(undefined) }}
        onScrub={(at, offset) => { setSelected(at); if (segments[at]?.type === 'broll') setFootageSlot(at); setSeekOffset(offset); if (playing) seekLoop(at, offset) }}
        onReorder={(_lane, from, to) => {
          const next = [...segments]
          const [moved] = next.splice(from, 1)
          const at = Math.min(to, next.length)
          next.splice(at, 0, moved)
          editSegments(next, at)
        }}
        onResize={(_lane, at, durS) => editSegments(segments.map((s, i) => i === at ? { ...s, durS } : s), at)}
        onTrim={(_lane, at, fromS, durS) => editSegments(segments.map((s, i) => i === at && s.type === 'broll'
          ? { ...s, trimStartS: fromS, trimEndS: fromS + durS, durS } : s), at)}
        onDropAsset={(_lane, path, at) => dropAsset(path, at)}
        onEditStart={() => { history.current = [...history.current.slice(-39), spec]; editingGesture.current = true }} onEditEnd={() => { editingGesture.current = false }} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button disabled={!history.current.length} onClick={() => { const previous = history.current.pop(); if (previous) updateSpec(previous); setSelected(0); setPlaying(false); setSeekOffset(undefined) }} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs disabled:opacity-30">Undo edit</button>
        <button onClick={() => {
          try { onChange(remixClip(spec, clips)); setPlaying(false); setSelected(0); setSeekOffset(undefined); setEditError('') }
          catch (e) { setEditError((e as Error).message) }
        }} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs">Shuffle B-roll & pacing</button>
        <label className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-400">Transitions
          <select aria-label="Fade between frames" value={spec.transitions?.style ?? DEFAULT_FADE_STYLE}
            onChange={(e) => onChange({ ...spec, transitions: { style: e.target.value as FadeStyle } })}
            className="rounded bg-neutral-900 text-neutral-200">
            <option value="off">Hard cuts</option>
            <option value="soft">Fade to black</option>
            <option value="strong">Long fades</option>
          </select>
        </label>
        <details className="min-w-0 flex-1"><summary className="cursor-pointer text-xs text-wing-400">Ask AI to adjust the edit</summary><div className="mt-2 flex flex-wrap gap-2"><input aria-label="AI edit direction" value={direction} onChange={(e) => setDirection(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" /><button disabled={editBusy || !direction.trim()} onClick={autoEdit} className="rounded-lg bg-wing-500 px-3 py-2 text-sm disabled:opacity-50">{editBusy ? 'AI is editing…' : 'Apply AI edit'}</button></div></details>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1.15fr)_minmax(260px,1fr)]">
      <div className="min-w-0">
        <div className="mb-2 text-xs text-neutral-500">Video preview · 9:16</div>
        <p role="status" className={`mb-3 text-xs ${assetsLoaded && missingFootage ? 'text-amber-300' : 'text-neutral-400'}`}>{!assetsLoaded ? 'Loading your footage…' : missingFootage ? 'Some B-roll is missing. Replace the missing clips below.' : `${includedClips} B-roll clip${includedClips === 1 ? '' : 's'} included · ready to play`}</p>
        <div className="flex justify-center lg:block">
          <ClipPlayer
            segments={segments}
            chat={spec.chat}
            hook={spec.hook}
            mediaUrls={segments.map(mediaUrl)}
            storyUrl={storyUrl}
            height={340}
            seekOffset={playing ? (index === selected ? seekOffset ?? 0 : 0) : seekOffset}
            playing={playing}
            activeIndex={index}
            fades={fades}
            offsetS={playing ? playbackOffset : seekOffset}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className={`text-sm tabular-nums ${offTarget ? 'text-amber-400' : 'text-neutral-400'}`}>
            {totalS.toFixed(1)}s total{offTarget ? ` (target ${CUTS_TARGET_S}s)` : ''}
          </span>
          {offTarget && (
            <button
              onClick={() => editSegments(fitToTarget(segments))}
              className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
            >
              Fit to {CUTS_TARGET_S}s
            </button>
          )}
        </div>
        {custom && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs">
            <span className="text-neutral-400">Custom structure</span>
            <button
              onClick={() => {
                onChange({ ...spec, segments: undefined })
                setSelected(0)
                setPlaying(false)
                setSeekOffset(undefined)
              }}
              className="text-neutral-300 underline underline-offset-2 hover:text-white"
            >
              Back to automatic
            </button>
          </div>
        )}
      </div>


        <div ref={scriptSection} className="min-w-0 rounded-xl border border-neutral-800 p-4 xl:max-h-[650px] xl:overflow-y-auto">
          <h3 className="mb-4 text-sm font-semibold">Hook & script</h3>

        <label className="mb-4 block text-xs text-neutral-400">On-screen hook
          <input ref={hookInput} onFocus={() => { setSelected(0); setPlaying(false); setSeekOffset(undefined); setSeekOffset(undefined) }} value={spec.hook} maxLength={80} onChange={(e) => onChange({ ...spec, hook: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" />
        </label>
        <p className="mb-4 text-xs text-neutral-500">This is the first line viewers see. Give them a reason to keep watching.</p>
        {hasStory && <div ref={storySection}><StoryPicker path={spec.storyImagePath} assets={assets} onAssets={setAssets} onChange={(storyImagePath) => onChange({ ...spec, storyImagePath })} onPreview={previewStory} /></div>}
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Conversation · edit every line
        </div>
        <ConversationEditor
          messages={spec.chat.messages}
          onChange={(messages) => setChat({ ...spec.chat, messages })}
          highlight={!playing && segment?.type === 'chat' ? segment.visibleCount : undefined}
          onFocusMessage={(i) => {
            setPlaying(false)
            setSeekOffset(undefined)
            const at = segments.findIndex((s) => s.type === 'chat' && s.visibleCount === i + 1)
            if (at >= 0) setSelected(at)
          }}
        />

        <AiScript hook={spec.hook} chat={spec.chat} onChange={(chat) => onChange({ ...spec, chat, segments: reconcileSegments(segments, chat) })} />

        </div>
        <div ref={footageSection} className="min-w-0 md:col-span-2 xl:col-span-1 xl:max-h-[650px] xl:overflow-y-auto">

          <h3 className="mb-1 font-semibold">Footage</h3>
          <p className="mb-3 text-sm text-neutral-400">Pick a slot to replace, or drag a clip onto the timeline.</p>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{segments.map((s, i) => s.type === 'broll' && <button key={i} onClick={() => { setSelected(i); setFootageSlot(i); setPlaying(false); setSeekOffset(undefined) }} aria-pressed={targetSlot === i} className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${targetSlot === i ? 'border-wing-500 bg-wing-950/30' : 'border-neutral-700'}`}>
            <span className="block font-medium">{label(s, i)}</span><span className="mt-1 block max-w-32 truncate text-neutral-500">{s.path.split('/').pop() || 'Choose footage'} · {s.durS.toFixed(1)}s</span>
          </button>)}</div>
        <MediaLibrary compact tag={spec.brollTag} onAssets={setAssets} onPick={(asset) => {
          if (targetSlot >= 0) editSegments(segments.map((s, i) => i === targetSlot ? { type: 'broll', path: asset.path, durS: s.durS } : s), targetSlot)
          else insert(Math.max(0, selected), { type: 'broll', path: asset.path, durS: 2.8 })
        }} onUploadComplete={(uploaded) => {
          const slots = segments.flatMap((s, i) => s.type === 'broll' ? [i] : [])
          if (!slots.length) { setEditError('Add a B-roll beat in the timeline to use your footage.'); return }
          const start = Math.max(0, slots.indexOf(targetSlot))
          const assigned = new Map(uploaded.slice(0, slots.length).map((asset, i) => [slots[(start + i) % slots.length], asset.path]))
          editSegments(segments.map((s, i) => assigned.has(i) ? { type: 'broll', path: assigned.get(i)!, durS: s.durS } : s.type === 'broll' && !s.path ? { ...s, path: uploaded[i % uploaded.length].path } : s), slots[start])
        }} />
        {!playing && segment && (
          <div className="mb-6 rounded-xl border border-neutral-800 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{label(segment, selected)}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => move(selected, -1)}
                  disabled={selected === 0}
                  aria-label="Move this frame earlier"
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30 hover:border-neutral-500"
                >
                  ◀
                </button>
                <button
                  onClick={() => move(selected, 1)}
                  disabled={selected === segments.length - 1}
                  aria-label="Move this frame later"
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30 hover:border-neutral-500"
                >
                  ▶
                </button>
                <button
                  onClick={() => remove(selected)}
                  disabled={segments.length <= 2}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-400 disabled:opacity-30 hover:border-red-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>

            {segment.type === 'image' && <div className="mb-4"><p className="mb-2 text-xs text-neutral-400">Choose a replacement image, or remove this beat.</p><div className="flex flex-wrap gap-2">{photos.map((photo) => <button key={photo.id} onClick={() => replaceAt(selected, { path: photo.path })} className="rounded-lg border border-neutral-700 p-1" title={`Use ${photo.path.split('/').pop()}`}><img src={`/files/${photo.path}`} alt={photo.path.split('/').pop()} className="h-16 w-12 object-cover" /></button>)}</div>{!photos.length && <a href="/assets" target="_blank" className="text-xs text-wing-400 underline">Add images in Media library →</a>}</div>}
            {segment.type === 'promo' && (
              <p className="mb-4 text-xs text-neutral-400">
                The app screen is built from this conversation: it shows{' '}
                <span className="text-neutral-200">“{promoContentFor(spec.chat)?.suggestion}”</span>{' '}
                as the suggested reply. Edit that message to change it.
              </p>
            )}

            {segment.type === 'broll' && (
              <div className="mb-4">
                <p className="mb-2 text-xs text-neutral-400">
                  Drag the handles to pick where this clip starts and stops.
                </p>
                {segment.path && (
                  <div className="mb-4">
                    <TrimBar
                      assetPath={segment.path}
                      trimStartS={segment.trimStartS}
                      trimEndS={segment.trimEndS}
                      onChange={({ trimStartS, trimEndS }) =>
                        editSegments(
                          segments.map((s, i) =>
                            i === selected && s.type === 'broll'
                              ? {
                                  ...s,
                                  trimStartS,
                                  trimEndS,
                                  // The beat lasts exactly what was kept.
                                  durS: Math.min(20, Math.max(0.4, Math.round((trimEndS - trimStartS) * 10) / 10)),
                                }
                              : s,
                          ),
                          selected,
                        )
                      }
                    />
                  </div>
                )}
                {!custom && spec.brollSlots?.[String(brollOrdinal(segments, selected))] && (
                  <button
                    onClick={() => setClip(selected, null)}
                    className="mb-3 rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                  >
                    Back to automatic clip
                  </button>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-neutral-500">
                    Set the clips and story photo for the whole video
                  </summary>
                  <div className="mt-3">
                    <AssetPicker
                      tag={spec.brollTag}
                      selected={spec.brollPaths ?? []}
                      onChange={(paths) =>
                        onChange({ ...spec, brollPaths: paths.length ? paths : undefined })
                      }
                      storyPath={spec.storyImagePath}
                      onStoryChange={(path) => onChange({ ...spec, storyImagePath: path })}
                    />
                  </div>
                </details>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="selected-beat-duration" className="text-xs text-neutral-400">Duration</label>
              <input
                id="selected-beat-duration"
                type="number"
                step="0.1"
                min="0.4"
                max="20"
                value={segment.durS}
                onChange={(e) => setDuration(selected, Number(e.target.value))}
                className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-xs text-neutral-500">seconds</span>
              {isPinned(selected) && (
                <button
                  onClick={() => setDuration(selected, null)}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                >
                  Auto
                </button>
              )}
              <label htmlFor="selected-beat-fade" className="ml-2 text-xs text-neutral-400">Fade</label>
              <input
                id="selected-beat-fade"
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={segment.fadeS ?? fades[selected]?.outS ?? 0}
                onChange={(e) => {
                  const seconds = Number(e.target.value)
                  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 2) replaceAt(selected, { fadeS: seconds })
                }}
                className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-xs text-neutral-500">seconds</span>
              {segment.fadeS !== undefined && (
                <button
                  onClick={() => replaceAt(selected, { fadeS: undefined })}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
      <div className="mt-5 min-w-0">
        <details className="mb-4"><summary className="cursor-pointer text-xs text-neutral-500">Frame thumbnails & insertion</summary>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Structure — tap a frame to edit it
        </div>
        <div className="mb-5 flex items-start gap-1 overflow-x-auto pb-2">
          {segments.map((s, i) => (
            <div key={i} className="flex shrink-0 items-start gap-1">
              <InsertSlot at={i} open={insertAt === i} onToggle={setInsertAt} />
              <button
                onClick={() => {
                  setPlaying(false)
                  setSelected(i)
                  setSeekOffset(undefined)
                }}
                className={`shrink-0 rounded-lg border-2 p-1 ${
                  !playing && selected === i ? 'border-wing-500' : 'border-neutral-800'
                }`}
              >
                <Scaled height={96}>
                  <ClipFrame
                    playing={false}
                    segment={s}
                    chat={spec.chat}
                    hook={spec.hook}
                    mediaUrl={mediaUrl(s) || undefined}
                    storyUrl={storyUrl}
                    isIntro={i === 0}
                  />
                </Scaled>
                <div className="mt-1 w-[54px] truncate text-[10px] text-neutral-400">{label(s, i)}</div>
                <div className="text-[10px] tabular-nums text-neutral-600">
                  {s.durS.toFixed(1)}s{isPinned(i) ? ' 📌' : ''}
                </div>
              </button>
            </div>
          ))}
          <InsertSlot at={segments.length} open={insertAt === segments.length} onToggle={setInsertAt} />
        </div>

        </details>

        {insertAt !== null && (
          <div className="mb-5 rounded-xl border border-neutral-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Add a frame</span>
              <button
                onClick={() => setInsertAt(null)}
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                Cancel
              </button>
            </div>
            <div className="mb-2 text-xs text-neutral-400">A clip</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {clips.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => insert(insertAt, { type: 'broll', path: asset.path, durS: 2.8 })}
                  title={asset.path.split('/').pop()}
                  className="overflow-hidden rounded-lg border-2 border-neutral-800 hover:border-neutral-600"
                >
                  <video
                    src={`/files/${asset.path}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-20 w-12 object-cover"
                  />
                </button>
              ))}
            </div>
            {photos.length > 0 && (
              <>
                <div className="mb-2 text-xs text-neutral-400">
                  A photo or a screenshot made in Tools
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {photos.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => insert(insertAt, { type: 'image', path: asset.path, durS: 2.2 })}
                      title={asset.path.split('/').pop()}
                      className="overflow-hidden rounded-lg border-2 border-neutral-800 hover:border-neutral-600"
                    >
                      <img src={`/files/${asset.path}`} alt="" className="h-20 w-12 object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mb-2 text-xs text-neutral-400">Hold a message on screen for longer</div>
            <div className="flex flex-wrap gap-2">
              {spec.chat.messages.map((m, mi) => (
                <button
                  key={mi}
                  onClick={() => insert(insertAt, { type: 'chat', visibleCount: mi + 1, durS: 2.0 })}
                  className="max-w-[220px] truncate rounded-lg border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-600"
                >
                  {mi + 1}. {m.text}
                </button>
              ))}
            </div>
          </div>
        )}


      </div>
    </fieldset>
  )
}

/** The thin gap between two frames where a new one can go. */
function InsertSlot({
  at,
  open,
  onToggle,
}: {
  at: number
  open: boolean
  onToggle: (at: number | null) => void
}) {
  return (
    <button
      onClick={() => onToggle(open ? null : at)}
      aria-label="Add a frame here"
      className={`mt-8 h-16 w-5 shrink-0 rounded text-xs ${
        open ? 'bg-wing-500 text-black' : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300'
      }`}
    >
      +
    </button>
  )
}
