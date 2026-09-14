import { useEffect, useRef, useState } from 'react'
import { timelinePosition } from '@shared/playback'
import type { Fade } from '@shared/transitions'
import { api } from '../../lib/api'

/** Matches the `h-14` blocks below and the frames the server tiles (90×160). */
const BLOCK_H = 56
const FRAME_RATIO = 90 / 160
const FILMSTRIP_FRAMES = 12

/** One block on a lane. The timeline draws these; it knows nothing of specs. */
export interface TimelineBlock {
  key: string
  label: string
  durS: number
  tone: 'chat' | 'broll' | 'promo' | 'image' | 'typing'
  fade?: Fade
  /** The clip behind the block and where in it this block starts. */
  film?: { path: string; fromS: number; keptS: number }
}

/**
 * A row of the timeline. 'cuts' is one lane; 'overlay' is two — the footage
 * underneath and the card reveals on top — sharing one ruler and playhead.
 */
export interface TimelineLane {
  id: string
  label: string
  blocks: TimelineBlock[]
  /** The lane the playhead maps onto. Exactly one lane sets this. */
  clock?: boolean
  reorder?: boolean
  resize?: boolean
  /** Left-edge handle: moves the in-point instead of the length. */
  trim?: boolean
  acceptsAsset?: boolean
}

export default function EditTimeline({
  lanes, selected, currentTime, playing, onTogglePlay,
  onSelect, onScrub, onReorder, onResize, onTrim, onDropAsset, onEditStart, onEditEnd,
}: {
  lanes: TimelineLane[]
  selected: { laneId: string; index: number }
  currentTime: number; playing: boolean; onTogglePlay: () => void
  onSelect: (laneId: string, index: number, offset?: number) => void
  /** Moving the playhead, which unlike picking a block doesn't stop playback. */
  onScrub: (index: number, offset: number) => void
  onReorder: (laneId: string, from: number, to: number) => void
  onResize: (laneId: string, index: number, durS: number) => void
  onTrim: (laneId: string, index: number, fromS: number, durS: number) => void
  onDropAsset: (laneId: string, path: string, index: number) => void
  onEditStart: () => void; onEditEnd: () => void
}) {
  const [zoom, setZoom] = useState(36)
  const drag = useRef<{ laneId: string; index: number; x: number; durS: number; fromS?: number } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  // The film behind each clip, so a beat reads as footage instead of a colour.
  const [strips, setStrips] = useState<Record<string, { url: string; durationS: number }>>({})
  const asked = useRef(new Set<string>())
  useEffect(() => {
    // `asked` is what keeps this to one request per clip, so there is no
    // cancel flag: dropping a late result would lose the only fetch we make.
    for (const path of new Set(lanes.flatMap((lane) => lane.blocks.flatMap((b) => (b.film?.path ? [b.film.path] : []))))) {
      if (asked.current.has(path)) continue
      asked.current.add(path)
      api.filmstrip(path)
        .then((r) => setStrips((current) => ({ ...current, [path]: { url: r.url, durationS: r.durationS } })))
        .catch(() => asked.current.delete(path))
    }
  }, [lanes])

  const clockLane = lanes.find((lane) => lane.clock) ?? lanes[0]
  const total = Math.max(...lanes.map((lane) => lane.blocks.reduce((t, b) => t + b.durS, 0)), 0)
  const seekTime = (time: number) => {
    const { index, offset } = timelinePosition(clockLane.blocks.map((b) => b.durS), time)
    if (clockLane.blocks.length) onScrub(index, offset)
  }
  const scrub = (event: React.PointerEvent<HTMLElement>) => {
    if (!track.current) return
    const viewport = scroll.current
    if (viewport) {
      const bounds = viewport.getBoundingClientRect()
      if (event.clientX > bounds.right - 24) viewport.scrollLeft += 16
      else if (event.clientX < bounds.left + 24) viewport.scrollLeft -= 16
    }
    seekTime((event.clientX - track.current.getBoundingClientRect().left) / zoom)
  }
  const pointer = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); scrub(event)
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event)
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    },
  }
  useEffect(() => {
    const viewport = scroll.current
    if (!playing || !viewport) return
    const x = currentTime * zoom
    if (x < viewport.scrollLeft || x > viewport.scrollLeft + viewport.clientWidth - 24) {
      viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 3)
    }
  }, [playing, currentTime, zoom])
  const timecode = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
  const colors: Record<TimelineBlock['tone'], string> = {
    chat: 'bg-sky-950 border-sky-700', broll: 'bg-emerald-950 border-emerald-700',
    promo: 'bg-violet-950 border-violet-700', image: 'bg-amber-950 border-amber-700',
    typing: 'bg-sky-950/40 border-sky-800',
  }
  const drop = (e: React.DragEvent, lane: TimelineLane, to: number) => {
    e.preventDefault()
    const asset = e.dataTransfer.getData('application/x-studio-asset')
    if (asset) { if (lane.acceptsAsset) onDropAsset(lane.id, asset, to); return }
    const value = e.dataTransfer.getData('application/x-studio-segment')
    if (!value || !lane.reorder) return
    // Lane-scoped, so a block can't be dropped into the wrong row.
    const [laneId, at] = value.split(':')
    const from = Number(at)
    if (laneId !== lane.id || !Number.isInteger(from) || from < 0 || from >= lane.blocks.length) return
    onReorder(lane.id, from, to)
  }
  return <section className="mb-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Timeline <span className="ml-2 font-normal text-neutral-500">{total.toFixed(1)}s</span></h3>
      <label className="flex items-center gap-2 text-xs text-neutral-400">Zoom<input aria-label="Timeline zoom" type="range" min="20" max="100" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
    </div>
    <div ref={scroll} className="overflow-x-auto px-2 pb-2">
      <div ref={track} className="relative" style={{ width: Math.max(400, total * zoom + 44) }}>
        <div className="relative h-5 cursor-ew-resize touch-none border-b border-neutral-700" title="Drag to scrub" {...pointer}>
          {Array.from({ length: Math.ceil(total / 5) + 1 }, (_, i) => <span key={i} style={{ left: i * 5 * zoom }} className="absolute top-0 border-l border-neutral-700 pl-1 text-[10px] text-neutral-500">{i * 5}s</span>)}
        </div>
        {lanes.map((lane) => <div key={lane.id} className="pt-2">
          {lanes.length > 1 && <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">{lane.label}</div>}
          <div className="relative flex">
            {lane.blocks.map((block, i) => {
            const width = block.durS * zoom
            const strip = block.film ? strips[block.film.path] : undefined
            // Frames keep their shape rather than being squeezed into the beat —
            // a 2s clip in a 90px block would otherwise be twelve slivers of mush.
            // The strip still starts where the clip does, so a trim is visible.
            const filmWidth = FILMSTRIP_FRAMES * BLOCK_H * FRAME_RATIO
            // A beat longer than the footage it has gets played back slowly.
            const stretched = Boolean(strip && block.film && block.film.keptS + 0.05 < block.durS)
            const isSelected = selected.laneId === lane.id && selected.index === i
            return <div key={block.key} draggable={lane.reorder}
              onDragStart={(e) => { e.dataTransfer.setData('application/x-studio-segment', `${lane.id}:${i}`); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, lane, i)}
              className={`relative h-14 shrink-0 overflow-hidden rounded border ${colors[block.tone]} ${isSelected ? 'ring-2 ring-white ring-inset' : ''}`}
              style={{ width, ...(strip && block.film ? {
                backgroundImage: `url(${strip.url})`,
                backgroundSize: `${filmWidth}px 100%`,
                backgroundPosition: `${-filmWidth * (block.film.fromS / Math.max(strip.durationS, 0.1))}px 0`,
                backgroundRepeat: 'repeat-x',
              } : {}) }}>
              <button onClick={() => onSelect(lane.id, i)} aria-label={`Select ${lane.label} beat ${i + 1}: ${block.label}`} className="h-full w-full overflow-hidden px-2 text-left text-xs">
                <span className={`block truncate ${strip ? 'bg-black/60' : ''}`}>{block.label}</span>
                <span className={`mt-1 block truncate text-[10px] text-neutral-300 ${strip ? 'bg-black/60' : ''}`}>{block.durS.toFixed(1)}s{stretched ? ' · slow-mo' : ''}</span>
              </button>
              {block.fade?.inS ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0" style={{ width: block.fade.inS * zoom, background: 'linear-gradient(to right, rgba(0,0,0,0.85), transparent)' }} /> : null}
              {block.fade?.outS ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0" style={{ width: block.fade.outS * zoom, background: 'linear-gradient(to left, rgba(0,0,0,0.85), transparent)' }} /> : null}
              {lane.trim && block.film && strip && <button aria-label={`Trim the start of ${lane.label} beat ${i + 1}`} title="Drag to start the clip later" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none bg-white/20"
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onEditStart(); drag.current = { laneId: lane.id, index: i, x: e.clientX, durS: block.durS, fromS: block.film!.fromS } }}
                onPointerMove={(e) => {
                  const gesture = drag.current
                  if (!gesture || gesture.index !== i || gesture.laneId !== lane.id || gesture.fromS === undefined) return
                  // Dragging the left edge moves the in-point and shortens the
                  // block by the same amount, so the rest of the edit holds.
                  const by = (e.clientX - gesture.x) / zoom
                  const shift = Math.round(Math.max(-gesture.fromS, Math.min(gesture.durS - 0.4, by)) * 10) / 10
                  onTrim(lane.id, i, Math.round((gesture.fromS + shift) * 10) / 10, Math.round((gesture.durS - shift) * 10) / 10)
                }} onPointerUp={() => { drag.current = null; onEditEnd() }} onPointerCancel={() => { drag.current = null; onEditEnd() }} />}
              {lane.resize && <button aria-label={`Resize ${lane.label} beat ${i + 1}`} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-white/20"
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onEditStart(); drag.current = { laneId: lane.id, index: i, x: e.clientX, durS: block.durS } }}
                onPointerMove={(e) => {
                  const gesture = drag.current
                  if (!gesture || gesture.index !== i || gesture.laneId !== lane.id || gesture.fromS !== undefined) return
                  onResize(lane.id, i, Math.round(Math.max(0.4, Math.min(20, gesture.durS + (e.clientX - gesture.x) / zoom)) * 10) / 10)
                }} onPointerUp={() => { drag.current = null; onEditEnd() }} onPointerCancel={() => { drag.current = null; onEditEnd() }} />}
            </div>})}
            {lane.acceptsAsset && <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, lane, lane.blocks.length)} className="flex w-10 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-neutral-500">+</div>}
          </div>
        </div>)}
        <div role="slider" aria-label="Timeline playhead" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Number(currentTime.toFixed(2))} aria-valuetext={`${timecode(currentTime)} of ${timecode(total)}`} tabIndex={0}
          {...pointer}
          onKeyDown={(event) => {
            const delta = event.shiftKey ? 1 : 0.1
            const time = event.key === 'Home' ? 0 : event.key === 'End' ? total : event.key === 'ArrowLeft' ? currentTime - delta : event.key === 'ArrowRight' ? currentTime + delta : null
            if (time !== null) { event.preventDefault(); seekTime(time) }
            if (event.key === ' ') { event.preventDefault(); onTogglePlay() }
          }}
          style={{ left: Math.min(total, Math.max(0, currentTime)) * zoom }}
          className="absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize touch-none outline-none focus-visible:bg-white/20">
          <span className="absolute bottom-0 left-1/2 top-1 w-px bg-white shadow-[0_0_3px_#000]" />
          <span className="absolute left-1/2 top-0 h-3 w-2.5 -translate-x-1/2 rounded-b-sm border-2 border-white bg-neutral-900" />
        </div>
      </div>
    </div>
    <div className="relative mt-2 flex min-h-10 items-center justify-center border-t border-neutral-800 pt-2">
      <output aria-label="Playback time" className="absolute left-0 text-xs tabular-nums text-neutral-400"><span className="text-white">{timecode(currentTime)}</span> / {timecode(total)}</output>
      <button aria-label={playing ? 'Pause video' : 'Play video'} title={playing ? 'Pause' : 'Play from playhead'} onClick={onTogglePlay} disabled={!total} className="flex h-9 w-10 items-center justify-center rounded-lg border border-neutral-700 text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40">
        {playing ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4v12H3zm6 0h4v12H9z" /></svg> : <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2v12l10-6z" /></svg>}
      </button>
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">Drag beats to reorder · drag their edges to retime and trim · drag the white playhead to scrub, even while it plays · the dark edges are the fades to black</p>
  </section>
}
