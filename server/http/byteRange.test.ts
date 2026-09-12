import { expect, it } from 'vitest'
import { byteRange } from './byteRange'

it('supports browser metadata probes and subsequent seek requests', () => {
  expect(byteRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1 })
  expect(byteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  expect(byteRange('bytes=500-2000', 1000)).toEqual({ start: 500, end: 999 })
})
it('supports suffix reads and files shorter than the requested suffix', () => {
  expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  expect(byteRange('bytes=-2000', 1000)).toEqual({ start: 0, end: 999 })
})
it('rejects unsatisfiable, empty, and unsafe ranges', () => {
  for (const header of ['bytes=1000-', 'bytes=100-50', 'bytes=-0', 'bytes=-', 'bytes=0-9007199254740992']) expect(byteRange(header, 1000)).toBeNull()
  expect(byteRange('bytes=0-', 0)).toBeNull()
})
