import { useEffect, useState } from 'react'

/**
 * Walks a list of step durations (seconds) in real time, returning the
 * active index. Used by every animated clip preview so what you watch in
 * the studio matches the rendered pacing.
 */
export function useLoop(durationsS: number[], playing = true): [number, (index: number) => void] {
  const [index, setIndex] = useState(0)
  const step = Math.min(index, Math.max(durationsS.length - 1, 0))

  useEffect(() => {
    if (!playing || durationsS.length === 0) return
    const timer = setTimeout(
      () => setIndex((step + 1) % durationsS.length),
      Math.max(durationsS[step] ?? 1, 0.2) * 1000,
    )
    return () => clearTimeout(timer)
  }, [step, durationsS, playing])

  return [step, setIndex]
}
