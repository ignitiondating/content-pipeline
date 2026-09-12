import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

/**
 * Where the clip starts and stops, picked by eye: the film itself behind two
 * handles. Dragging either one sets the beat's duration to what's between
 * them, which is what "trim from the start or the end" means on screen.
 */
export default function TrimBar({
  assetPath,
  trimStartS,
  trimEndS,
  onChange,
}: {
  assetPath: string
  trimStartS?: number
  trimEndS?: number
  onChange: (trim: { trimStartS: number; trimEndS: number }) => void
}) {
  const [strip, setStrip] = useState<{ url: string; durationS: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    setStrip(null)
    setError(null)
    api
      .filmstrip(assetPath)
      .then((r) => live && setStrip({ url: r.url, durationS: r.durationS }))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [assetPath])

  const total = strip?.durationS ?? 0
  const start = Math.max(0, trimStartS ?? 0)
  const end = Math.min(trimEndS ?? total, total, start + 20)

  // Nothing to drag against until we know how long the clip is.
  if (error) return <p className="text-xs text-amber-400">Preview strip unavailable: {error}</p>
  if (!strip) return <div className="h-16 animate-pulse rounded-lg bg-neutral-900" />

  const secondsAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.round(ratio * total * 10) / 10
  }

  const move = (clientX: number, handle: 'start' | 'end') => {
    const at = secondsAt(clientX)
    // Handles can't cross, and never leave less than a third of a second.
    if (handle === 'start') onChange({ trimStartS: Math.max(0, end - 20, Math.min(at, end - 0.3)), trimEndS: end })
    else onChange({ trimStartS: start, trimEndS: Math.min(total, start + 20, Math.max(at, start + 0.3)) })
  }

  const pct = (s: number) => `${total ? (s / total) * 100 : 0}%`

  return (
    <div>
      <div
        ref={trackRef}
        className="relative h-16 touch-none select-none overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
        style={{
          backgroundImage: `url(${strip.url})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
        onPointerMove={(e) => dragging && move(e.clientX, dragging)}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* Everything outside the handles is what gets left on the floor. */}
        <div className="absolute inset-y-0 left-0 bg-neutral-950/70" style={{ width: pct(start) }} />
        <div className="absolute inset-y-0 right-0 bg-neutral-950/70" style={{ width: pct(total - end) }} />
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-wing-500"
          style={{ left: pct(start), width: pct(end - start) }}
        />
        {(['start', 'end'] as const).map((handle) => (
          <button
            key={handle}
            aria-label={handle === 'start' ? 'Trim from the start' : 'Trim from the end'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDragging(handle)
            }}
            className="absolute inset-y-0 flex w-7 cursor-ew-resize items-center justify-center"
            style={{
              left: pct(handle === 'start' ? start : end),
              transform: handle === 'start' ? 'translateX(-2px)' : 'translateX(calc(-100% + 2px))',
            }}
          >
            <span className="h-10 w-1.5 rounded-full bg-wing-500 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />
          </button>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-neutral-500">
        <span>{start.toFixed(1)}s</span>
        <span className="text-neutral-300">{(end - start).toFixed(1)}s kept</span>
        <span>
          {end.toFixed(1)}s of {total.toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
