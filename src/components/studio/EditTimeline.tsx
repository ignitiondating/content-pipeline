import { useEffect, useRef, useState } from 'react'
import { timelinePosition } from '@shared/playback'
import type { EditedSegment } from '@shared/timeline'

export default function EditTimeline({ segments, selected, onSelect, onChange, onDropAsset, onEditStart, onEditEnd, currentTime, playing, onTogglePlay }: {
  segments: EditedSegment[]; selected: number;
  currentTime: number; playing: boolean; onTogglePlay: () => void;
  onSelect: (index: number, offset?: number) => void;
  onChange: (segments: EditedSegment[], index?: number) => void;
  onDropAsset: (path: string, index: number) => void;
  onEditStart: () => void; onEditEnd: () => void;
}) {
  const [zoom, setZoom] = useState(36)
  const resize = useRef<{ index: number; x: number; duration: number } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const seekTime = (time: number) => {
    const { index, offset } = timelinePosition(segments.map((s) => s.durS), time)
    if (segments.length) onSelect(index, offset)
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
  const total = segments.reduce((t, s) => t + s.durS, 0)
  const colors = { chat: 'bg-sky-950 border-sky-700', broll: 'bg-emerald-950 border-emerald-700', promo: 'bg-violet-950 border-violet-700', image: 'bg-amber-950 border-amber-700' }
  const drop = (e: React.DragEvent, to: number) => {
    e.preventDefault()
    const asset = e.dataTransfer.getData('application/x-studio-asset')
    if (asset) { onDropAsset(asset, to); return }
    const value = e.dataTransfer.getData('application/x-studio-segment')
    if (!value) return
    const from = Number(value)
    if (!Number.isInteger(from) || from < 0 || from >= segments.length) return
    const next = [...segments]
    const [moved] = next.splice(from, 1)
    const index = Math.min(to, next.length)
    next.splice(index, 0, moved)
    onChange(next, index)
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
        <div className="relative flex pt-2">
          {segments.map((segment, i) => <div key={i} draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/x-studio-segment', String(i)); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, i)}
            className={`relative h-14 shrink-0 overflow-hidden rounded border ${colors[segment.type]} ${selected === i ? 'ring-2 ring-white ring-inset' : ''}`}
            style={{ width: segment.durS * zoom }}>
            <button onClick={() => onSelect(i)} aria-label={`Select beat ${i + 1}: ${segment.type}`} className="h-full w-full overflow-hidden px-2 text-left text-xs">
              <span className="block truncate">{segment.type === 'chat' ? `Message ${segment.visibleCount}` : segment.type === 'promo' ? 'Product' : segment.path.split('/').pop() || 'B-roll'}</span>
              <span className="mt-1 block text-[10px] text-neutral-400">{segment.durS.toFixed(1)}s</span>
            </button>
            <button aria-label={`Resize beat ${i + 1}`} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-white/20"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onEditStart(); resize.current = { index: i, x: e.clientX, duration: segment.durS } }}
              onPointerMove={(e) => {
                const drag = resize.current
                if (!drag || drag.index !== i) return
                const durS = Math.round(Math.max(0.4, Math.min(20, drag.duration + (e.clientX - drag.x) / zoom)) * 10) / 10
                onChange(segments.map((s, index) => index === i ? { ...s, durS } : s), i)
              }} onPointerUp={() => { resize.current = null; onEditEnd() }} onPointerCancel={() => { resize.current = null; onEditEnd() }} />
          </div>)}
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, segments.length)} className="flex w-10 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-neutral-500">+</div>
        </div>
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
      <button aria-label={playing ? 'Pause video' : 'Play video'} title={playing ? 'Pause' : 'Play from playhead'} onClick={onTogglePlay} disabled={!segments.length} className="flex h-9 w-10 items-center justify-center rounded-lg border border-neutral-700 text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40">
        {playing ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4v12H3zm6 0h4v12H9z" /></svg> : <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2v12l10-6z" /></svg>}
      </button>
    </div>
    <p className="mt-2 text-[11px] text-neutral-500">Drag beats to reorder · drag right edges to retime · drag the white playhead to scrub</p>
  </section>
}
