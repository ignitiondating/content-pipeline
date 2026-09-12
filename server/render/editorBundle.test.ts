import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { buildEditorBundle } from './editorBundle'
import { writeMediaZip } from './zip'

const temporary: string[] = []
const directory = () => { const dir = mkdtempSync(path.join(tmpdir(), 'studio-zip-')); temporary.push(dir); return dir }
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

it('writes a portable ZIP readable by an independent ZIP implementation', () => {
  const dir = directory()
  const bytes = Buffer.from(Array.from({ length: 600000 }, (_, i) => i % 256))
  writeFileSync(path.join(dir, 'source'), bytes)
  const target = path.join(dir, 'test.zip')
  writeMediaZip(target, [{ name: 'media/clip.bin', file: path.join(dir, 'source') }])
  expect(execFileSync('unzip', ['-p', target, 'media/clip.bin'], { maxBuffer: 1000000 })).toEqual(bytes)
  expect(() => writeMediaZip(target, [{ name: '../escape', file: path.join(dir, 'source') }])).toThrow('Invalid archive')
})

it('exports original timing with portable paths and deduplicates repeated media', () => {
  const dir = directory()
  writeFileSync(path.join(dir, 'chat.png'), 'fake screenshot')
  writeFileSync(path.join(dir, 'hook.png'), 'fake hook')
  writeFileSync(path.join(dir, 'editor-manifest.json'), JSON.stringify({
    caption: 'Reviewed caption', script: ['me: human wording'], hook: 'Hook', hookEndS: 3,
    beats: [{ file: 'chat.png', source: 'render', startS: 0, durS: 2 }, { file: 'chat.png', source: 'render', startS: 2, durS: 4 }],
  }))
  const name = buildEditorBundle(dir)!
  const timeline = JSON.parse(execFileSync('unzip', ['-p', path.join(dir, name), 'timeline.json'], { encoding: 'utf8' }))
  expect(timeline.beats[0].file).toBe(timeline.beats[1].file)
  expect(timeline.beats[1].startS).toBe(2)
  expect(timeline.beats[1].durS).toBe(4)
  expect(JSON.stringify(timeline)).not.toContain(dir)
  expect(readFileSync(path.join(dir, 'CAPCUT-README.txt'), 'utf8')).toContain('not a native CapCut project')
})
