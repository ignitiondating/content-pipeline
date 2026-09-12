import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipSpec } from '@shared/formats/clip'
import { buildClipTimeline } from '@shared/timeline'
import ChatScreen from '../chat/ChatScreen'
import Scaled from './Scaled'
import BrollPlaceholder from './BrollPlaceholder'
import { HookText } from './ClipPlayer'
import { api, type AssetItem } from '../../lib/api'

export default function OverlayPreview({ spec, height = 440 }: { spec: ClipSpec; height?: number }) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const timeline = useMemo(() => buildClipTimeline(spec.chat), [spec.chat])
  const at = Math.min(time, timeline.durationS)
  const state = timeline.states.find((s) => at >= s.tStartS && at < s.tEndS) ?? timeline.states[timeline.states.length - 1]
  const path = spec.brollPaths?.[0] ?? assets.find((a) => a.kind === 'broll' && a.tag === spec.brollTag && !a.missing)?.path
  useEffect(() => { api.assets().then((r) => setAssets(r.assets)).catch(() => {}) }, [])
  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) / 1000
      previous = now
      setTime((t) => (t + delta) % timeline.durationS)
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing, timeline.durationS])
  useEffect(() => {
    const element = video.current
    if (!element) return
    const sync = () => {
      if (element.duration > 0 && Math.abs(element.currentTime - at % element.duration) > 0.3) element.currentTime = at % element.duration
      if (playing) void element.play().catch(() => {})
      else element.pause()
    }
    sync()
    element.addEventListener('loadedmetadata', sync)
    return () => element.removeEventListener('loadedmetadata', sync)
  }, [at, playing, path])
  return <div className="lg:sticky lg:top-6">
    <p className="mb-3 text-xs text-neutral-400">Video preview · 9:16</p>
    <Scaled height={height}><div style={{ width: 540, height: 960, position: 'relative', overflow: 'hidden', background: '#212121' }}>
      {path ? <video ref={video} src={`/files/${path}`} muted loop playsInline style={{ width: 540, height: 960, maxWidth: 'none', objectFit: 'cover' }} /> : <BrollPlaceholder />}
      <div style={{ position: 'absolute', inset: 0 }}><ChatScreen spec={spec.chat} mode="card" visibleCount={state?.visibleCount ?? 0} showTyping={state?.typing ?? false} /></div>
      {(spec.hookPersists || at < 3) && <HookText hook={spec.hook} />}
    </div></Scaled>
    <div className="mt-3 flex items-center justify-between gap-3"><button onClick={() => setPlaying(!playing)} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm">{playing ? 'Pause preview' : 'Play preview'}</button><span className="text-xs text-neutral-400">{at.toFixed(1)} / {timeline.durationS.toFixed(1)}s</span></div>
    <input aria-label="Preview position" type="range" min={0} max={timeline.durationS} step={0.1} value={at} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)) }} className="mt-3 w-full" />
    {!path && <p className="mt-2 text-xs text-neutral-400">Choose or upload footage to fill the background.</p>}
  </div>
}
