import type { ClipSpec } from '@shared/formats/clip'
import type { EditedSegment } from '@shared/timeline'
import { ClipFrame } from '../studio/ClipPlayer'
import Scaled from '../studio/Scaled'

function labelFor(s: EditedSegment, i: number, total: number, brollOrdinal: number): string {
  if (s.type === 'chat') return `Msg ${s.visibleCount}`
  if (s.type === 'promo') return 'App'
  if (s.type === 'image') return 'Photo'
  if (i === 0) return 'Intro'
  if (i === total - 1) return 'Outro'
  return `Clip ${brollOrdinal}`
}

function brollOrdinal(segments: EditedSegment[], index: number): number {
  if (segments[index]?.type !== 'broll') return -1
  return segments.slice(0, index).filter((s) => s.type === 'broll').length
}

/** Dense CapCut-style filmstrip for cuts clips. */
export function CutsTimeline({
  spec,
  segments,
  selected,
  playing,
  totalS,
  onSelect,
  onTogglePlay,
  onInsertAt,
  insertAt,
}: {
  spec: ClipSpec
  segments: EditedSegment[]
  selected: number
  playing: boolean
  totalS: number
  onSelect: (i: number) => void
  onTogglePlay: () => void
  onInsertAt: (i: number | null) => void
  insertAt: number | null
}) {
  const storyUrl = spec.storyImagePath ? `/files/${spec.storyImagePath}` : undefined
  const mediaUrl = (s: EditedSegment) =>
    (s.type === 'broll' || s.type === 'image') && s.path ? `/files/${s.path}` : undefined

  return (
    <div className="px-5 py-3 sm:px-8">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:border-neutral-500"
        >
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="text-xs tabular-nums text-neutral-400">{totalS.toFixed(1)}s</span>
        <span className="hidden text-xs text-neutral-600 sm:inline">Tap a frame to edit</span>
      </div>
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {segments.map((s, i) => (
          <div key={i} className="flex shrink-0 items-start gap-0.5">
            <button
              onClick={() => onInsertAt(insertAt === i ? null : i)}
              aria-label="Insert frame"
              className={`mt-6 h-12 w-4 shrink-0 rounded text-[10px] ${
                insertAt === i
                  ? 'bg-wing-500 text-black'
                  : 'text-neutral-700 hover:bg-neutral-800 hover:text-neutral-300'
              }`}
            >
              +
            </button>
            <button
              onClick={() => onSelect(i)}
              className={`shrink-0 rounded-md border-2 p-0.5 ${
                !playing && selected === i ? 'border-wing-500' : 'border-neutral-800'
              }`}
            >
              <Scaled height={72}>
                <ClipFrame
                  segment={s}
                  chat={spec.chat}
                  hook={spec.hook}
                  mediaUrl={mediaUrl(s)}
                  storyUrl={storyUrl}
                  isIntro={i === 0}
                />
              </Scaled>
              <div className="mt-0.5 w-[42px] truncate text-center text-[9px] text-neutral-400">
                {labelFor(s, i, segments.length, brollOrdinal(segments, i))}
              </div>
              <div className="text-center text-[9px] tabular-nums text-neutral-600">
                {s.durS.toFixed(1)}s
              </div>
            </button>
          </div>
        ))}
        <button
          onClick={() => onInsertAt(insertAt === segments.length ? null : segments.length)}
          aria-label="Insert frame at end"
          className={`mt-6 h-12 w-4 shrink-0 rounded text-[10px] ${
            insertAt === segments.length
              ? 'bg-wing-500 text-black'
              : 'text-neutral-700 hover:bg-neutral-800 hover:text-neutral-300'
          }`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** Scrubber for overlay clips / multi-slide formats. */
export function ScrubTimeline({
  label,
  index,
  count,
  onChange,
  playing,
  onTogglePlay,
  durationLabel,
}: {
  label: string
  index: number
  count: number
  onChange: (i: number) => void
  playing?: boolean
  onTogglePlay?: () => void
  durationLabel?: string
}) {
  if (count <= 0) return null
  return (
    <div className="flex items-center gap-4 px-5 py-4 sm:px-8">
      {onTogglePlay && (
        <button
          onClick={onTogglePlay}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500"
        >
          {playing ? '❚❚' : '▶'}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          value={Math.min(index, count - 1)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
          <span>
            {label} {index + 1}/{count}
          </span>
          {durationLabel && <span className="tabular-nums">{durationLabel}</span>}
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: Math.min(count, 12) }, (_, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`h-7 w-7 rounded text-[10px] ${
              i === index ? 'bg-wing-500 text-white' : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
