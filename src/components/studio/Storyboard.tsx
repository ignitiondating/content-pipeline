import { useEffect, useMemo, useState } from 'react'
import type { ChatSpec } from '@shared/formats/chat'
import type { ClipSpec } from '@shared/formats/clip'
import {
  buildCutsTimeline,
  burstOrdinalAt,
  promoContentFor,
  resolveBrollForBursts,
  type CutSegment,
} from '@shared/timeline'
import ClipPlayer, { ClipFrame } from './ClipPlayer'
import ConversationEditor from './ConversationEditor'
import AssetPicker from './AssetPicker'
import Scaled from './Scaled'
import { useLoop } from '../../lib/useLoop'
import { api, type AssetItem } from '../../lib/api'

/** Which timing key a segment writes to, so pins survive text edits. */
function timingKeyFor(
  segments: CutSegment[],
  index: number,
): { field: 'introS' | 'outroS' | 'promoS' | 'chatHoldsS' | 'brollBeatsS'; key?: string } {
  const segment = segments[index]
  if (segment.type === 'promo') return { field: 'promoS' }
  if (segment.type === 'chat') return { field: 'chatHoldsS', key: String(segment.visibleCount) }
  if (index === 0) return { field: 'introS' }
  if (index === segments.length - 1) return { field: 'outroS' }
  return { field: 'brollBeatsS', key: String(burstOrdinalAt(segments, index) - 1) }
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

  useEffect(() => {
    api.assets().then((r) => setAssets(r.assets.filter((a) => !a.missing))).catch(() => {})
  }, [])

  const timeline = useMemo(() => buildCutsTimeline(spec.chat, spec.timing), [spec])
  const durations = useMemo(() => timeline.segments.map((s) => s.durS), [timeline])
  const [looped] = useLoop(durations, playing)
  const index = Math.min(playing ? looped : selected, timeline.segments.length - 1)
  const segment = timeline.segments[index]

  // The clips this video will actually use, in burst order.
  const brollPaths = useMemo(() => {
    if (spec.brollPaths?.length) return spec.brollPaths
    return assets
      .filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)
      .map((a) => a.path)
      .sort()
  }, [spec.brollPaths, spec.brollTag, assets])

  const storyUrl = spec.storyImagePath ? `/files/${spec.storyImagePath}` : undefined

  const setChat = (chat: ChatSpec) => onChange({ ...spec, chat })

  const setDuration = (segIndex: number, seconds: number | null) => {
    const { field, key } = timingKeyFor(timeline.segments, segIndex)
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

  const isPinned = (segIndex: number): boolean => {
    const { field, key } = timingKeyFor(timeline.segments, segIndex)
    const value = spec.timing?.[field as keyof typeof spec.timing]
    return key ? Boolean((value as Record<string, number> | undefined)?.[key]) : value !== undefined
  }

  // Which clip each burst will actually play — the renderer's own resolver.
  const burstPaths = useMemo(
    () =>
      resolveBrollForBursts(
        timeline.segments.filter((s) => s.type === 'broll').length,
        brollPaths,
        spec.brollSlots,
      ),
    [timeline, brollPaths, spec.brollSlots],
  )
  const pathForSegment = (segIndex: number): string | undefined => {
    const ordinal = burstOrdinalAt(timeline.segments, segIndex)
    return ordinal >= 0 ? burstPaths[ordinal] : undefined
  }
  const setSlot = (segIndex: number, assetPath: string | null) => {
    const ordinal = burstOrdinalAt(timeline.segments, segIndex)
    if (ordinal < 0) return
    const slots = { ...(spec.brollSlots ?? {}) }
    if (assetPath === null) delete slots[String(ordinal)]
    else slots[String(ordinal)] = assetPath
    onChange({ ...spec, brollSlots: Object.keys(slots).length ? slots : undefined })
  }

  const label = (s: CutSegment, i: number) =>
    s.type === 'chat'
      ? `Message ${s.visibleCount}`
      : s.type === 'promo'
        ? 'WingAI app'
        : i === 0
          ? 'Intro clip'
          : i === timeline.segments.length - 1
            ? 'Closing clip'
            : `Clip ${burstOrdinalAt(timeline.segments, i)}`

  const offTarget = Math.abs(timeline.durationS - 33) > 0.6

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div>
        <div className="flex justify-center lg:block">
          <ClipPlayer
            chat={spec.chat}
            timing={spec.timing}
            hook={spec.hook}
            burstUrls={burstPaths.map((p) => (p ? `/files/${p}` : ''))}
            storyUrl={storyUrl}
            height={440}
            playing={playing}
            activeIndex={playing ? undefined : selected}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
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
            {timeline.durationS.toFixed(1)}s total{offTarget ? ' (target 33s)' : ''}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Structure — tap a frame to edit it
        </div>
        <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
          {timeline.segments.map((s, i) => (
            <button
              key={i}
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
                  brollUrl={pathForSegment(i) ? `/files/${pathForSegment(i)}` : undefined}
                  storyUrl={storyUrl}
                  isIntro={i === 0}
                />
              </Scaled>
              <div className="mt-1 w-[54px] truncate text-[10px] text-neutral-400">{label(s, i)}</div>
              <div className="text-[10px] tabular-nums text-neutral-600">
                {s.durS.toFixed(1)}s{isPinned(i) ? ' 📌' : ''}
              </div>
            </button>
          ))}
        </div>

        {!playing && segment && (
          <div className="mb-6 rounded-xl border border-neutral-800 p-4">
            <div className="mb-3 text-sm font-semibold">{label(segment, selected)}</div>

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
                  Tap a clip to play it here. Only this beat changes — the rest of the edit stays.
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {assets
                    .filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)
                    .map((asset) => {
                      const active = pathForSegment(selected) === asset.path
                      return (
                        <button
                          key={asset.id}
                          onClick={() => setSlot(selected, asset.path)}
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
                {spec.brollSlots?.[String(burstOrdinalAt(timeline.segments, selected))] && (
                  <button
                    onClick={() => setSlot(selected, null)}
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
            const at = timeline.segments.findIndex((s) => s.type === 'chat' && s.visibleCount === i + 1)
            if (at >= 0) setSelected(at)
          }}
        />
      </div>
    </div>
  )
}
