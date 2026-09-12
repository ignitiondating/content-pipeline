/** Resolve an absolute play time, including the exact end, into a beat offset. */
export function timelinePosition(durations: number[], time: number) {
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  const clamped = Math.min(total, Math.max(0, time))
  let start = 0
  for (let index = 0; index < durations.length; index++) {
    if (clamped < start + durations[index] || index === durations.length - 1) {
      return { index, offset: clamped - start, time: clamped }
    }
    start += durations[index]
  }
  return { index: 0, offset: 0, time: 0 }
}
