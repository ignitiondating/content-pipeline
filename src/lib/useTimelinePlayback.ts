import { useEffect, useRef, useState } from 'react'
import { timelinePosition } from '@shared/playback'

/** One continuous clock keeps the playhead and preview on the same beat. */
export function useTimelinePlayback(durations: number[], playing: boolean) {
  const clock = useRef(0)
  const [time, setTime] = useState(0)
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  useEffect(() => {
    if (!playing || total <= 0) return
    let frame: number
    let previous = performance.now()
    const tick = (now: number) => {
      clock.current = (clock.current + (now - previous) / 1000) % total
      previous = now
      setTime(clock.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, total])
  const seek = (index: number, offset = 0) => {
    clock.current = durations.slice(0, index).reduce((sum, duration) => sum + duration, 0) + offset
    setTime(clock.current)
  }
  return { ...timelinePosition(durations, time), seek }
}
