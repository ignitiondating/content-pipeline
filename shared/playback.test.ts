import { expect, test } from 'vitest'
import { timelinePosition } from './playback'

test('scrubbing follows unequal beats and switches at the exact cut', () => {
  expect(timelinePosition([2, 3.5, 1], 1.25)).toEqual({ index: 0, offset: 1.25, time: 1.25 })
  expect(timelinePosition([2, 3.5, 1], 2)).toEqual({ index: 1, offset: 0, time: 2 })
  expect(timelinePosition([2, 3.5, 1], 6)).toEqual({ index: 2, offset: 0.5, time: 6 })
})
test('scrubbing clamps both ends, including empty timelines', () => {
  expect(timelinePosition([2, 3.5], -1)).toEqual({ index: 0, offset: 0, time: 0 })
  expect(timelinePosition([2, 3.5], 10)).toEqual({ index: 1, offset: 3.5, time: 5.5 })
  expect(timelinePosition([], 10)).toEqual({ index: 0, offset: 0, time: 0 })
})
