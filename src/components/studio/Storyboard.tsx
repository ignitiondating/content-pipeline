import { useEffect, useMemo, useState } from 'react'
import type { ChatSpec } from '@shared/formats/chat'
import type { ClipSpec } from '@shared/formats/clip'
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
import AssetPicker from './AssetPicker'
import TrimBar from './TrimBar'
import Scaled from './Scaled'
import { useLoop } from '../../lib/useLoop'
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
  onChange,
}: {
  spec: ClipSpec
  onChange: (spec: ClipSpec) => void
}) {
  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [insertAt, setInsertAt] = useState<number | null>(null)

  useEffect(() => {
    api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing))).catch(() => {})
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

  const durations = useMemo(() => segments.map((s) => s.durS), [segments])
  const [looped] = useLoop(durations, playing)
  const index = Math.min(playing ? looped : selected, segments.length - 1)
  const segment = segments[index]

  const storyUrl = spec.storyImagePath ? `/files/${spec.storyImagePath}` : undefined

  /** Any structural edit freezes the timeline — from here it is the truth. */
  const editSegments = (next: EditedSegment[], keepIndex = selected) => {
    onChange({ ...spec, segments: next })
    setPlaying(false)
    setSelected(Math.max(0, Math.min(keepIndex, next.length - 1)))
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
    const next = [...segments]
    next.splice(at, 0, frame)
    editSegments(next, at)
    setInsertAt(null)
  }

  const setDuration = (at: number, seconds: number | null) => {
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
      if (assetPath) replaceAt(at, { path: assetPath })
      return
    }
    const ordinal = brollOrdinal(segments, at)
    if (ordinal < 0) return
    const slots = { ...(spec.brollSlots ?? {}) }
    if (assetPath === null) delete slots[String(ordinal)]
    else slots[String(ordinal)] = assetPath
    onChange({ ...spec, brollSlots: Object.keys(slots).length ? slots : undefined })
  }

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

  const offTarget = Math.abs(totalS - CUTS_TARGET_S) > 0.6
  const photos = assets.filter((a) => ['background', 'shot', 'promo'].includes(a.kind))
  const clips = assets.filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div>
        <div className="flex justify-center lg:block">
          <ClipPlayer
            segments={segments}
            chat={spec.chat}
            hook={spec.hook}
            mediaUrls={segments.map(mediaUrl)}
            storyUrl={storyUrl}
            height={440}
            playing={playing}
            activeIndex={playing ? undefined : selected}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => {
              if (playing) setSelected(index)
              setPlaying(!playing)
            }}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
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
              }}
              className="text-neutral-300 underline underline-offset-2 hover:text-white"
            >
              Back to automatic
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0">
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
                }}
                className={`shrink-0 rounded-lg border-2 p-1 ${
                  !playing && selected === i ? 'border-wing-500' : 'border-neutral-800'
                }`}
              >
                <Scaled height={96}>
                  <ClipFrame
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

            {segment.type === 'chat' && (
              <div className="mb-4">
                <label className="text-xs text-neutral-400">Message text</label>
                <input
                  value={spec.chat.messages[segment.visibleCount - 1]?.text ?? ''}
                  onChange={(e) =>
                    setChat({
                      ...spec.chat,
                      messages: spec.chat.messages.map((m, i) =>
                        i === segment.visibleCount - 1 ? { ...m, text: e.target.value } : m,
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                />
              </div>
            )}

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
                                  durS: Math.round((trimEndS - trimStartS) * 10) / 10,
                                }
                              : s,
                          ),
                          selected,
                        )
                      }
                    />
                  </div>
                )}
                <p className="mb-2 text-xs text-neutral-400">
                  Tap a clip to play it here. Only this beat changes — the rest of the edit stays.
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {clips.map((asset) => {
                    const active = segment.path === asset.path
                    return (
                      <button
                        key={asset.id}
                        onClick={() => setClip(selected, asset.path)}
                        title={asset.path.split('/').pop()}
                        className={`overflow-hidden rounded-lg border-2 ${
                          active ? 'border-wing-500' : 'border-neutral-800'
                        }`}
                      >
                        <video
                          src={`/files/${asset.path}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-24 w-16 object-cover"
                        />
                      </button>
                    )
                  })}
                </div>
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
              <label className="text-xs text-neutral-400">Duration</label>
              <input
                type="number"
                step="0.1"
                min="0.4"
                max="15"
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
            </div>
          </div>
        )}

        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Conversation
        </div>
        <ConversationEditor
          messages={spec.chat.messages}
          onChange={(messages) => setChat({ ...spec.chat, messages })}
          highlight={!playing && segment?.type === 'chat' ? segment.visibleCount : undefined}
          onFocusMessage={(i) => {
            setPlaying(false)
            const at = segments.findIndex((s) => s.type === 'chat' && s.visibleCount === i + 1)
            if (at >= 0) setSelected(at)
          }}
        />
      </div>
    </div>
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
