import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FILES_ROOT } from '../paths'
import { writeMediaZip } from './zip'

export interface EditorManifest {
  caption: string
  script: string[]
  hook: string
  hookEndS: number
  musicPath?: string
  beats: { file: string; source: 'library' | 'render'; startS: number; durS: number; trimStartS?: number; trimEndS?: number; layer?: string }[]
}

/** Called after rendering, so the handoff uses the same captured screens and resolved media. */
export function buildEditorBundle(workdir: string): string | null {
  const manifestPath = path.join(workdir, 'editor-manifest.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EditorManifest
  const entries: { name: string; file: string }[] = []
  const included = new Map<string, string>()
  const add = (source: 'library' | 'render', file: string) => {
    const root = path.resolve(source === 'library' ? FILES_ROOT : workdir)
    const absolute = path.resolve(root, file)
    if (!absolute.startsWith(root + path.sep)) throw new Error('Invalid media path in editor export')
    const existing = included.get(absolute)
    if (existing) return existing
    const name = `media/${String(entries.length + 1).padStart(3, '0')}-${path.basename(file).replace(/[^\w.-]/g, '-')}`
    entries.push({ name, file: absolute }); included.set(absolute, name)
    return name
  }
  const beats = manifest.beats.map((beat) => ({ ...beat, file: add(beat.source, beat.file) }))
  const musicFile = manifest.musicPath ? add('library', manifest.musicPath) : undefined
  const hookFile = add('render', 'hook.png')
  const portable = { ...manifest, musicPath: undefined, musicFile, hookFile, beats: beats.map(({ source, ...beat }) => beat) }
  writeFileSync(path.join(workdir, 'timeline.json'), JSON.stringify(portable, null, 2))
  writeFileSync(path.join(workdir, 'timeline.csv'), 'file,layer,start_seconds,duration_seconds,source_in,source_out\n' + beats.map((b) => [b.file, b.layer ?? 'main', b.startS, b.durS, b.trimStartS ?? 0, b.trimEndS ?? ''].join(',')).join('\n'))
  writeFileSync(path.join(workdir, 'script.txt'), `HOOK: ${manifest.hook}\n\n${manifest.script.join('\n')}\n\nCAPTION: ${manifest.caption}\n`)
  writeFileSync(path.join(workdir, 'CAPCUT-README.txt'), `CAPCUT MEDIA HANDOFF\n\n1. Unzip this folder. Create a 9:16, 30fps project in CapCut Desktop.\n2. Import the files in media/. Use timeline.csv to arrange the main track in order, set durations, and apply source in/out trims.\n3. Files marked overlay go on an upper track at their listed start time.\n4. Add ${hookFile} above the video from 0 to ${manifest.hookEndS}s.\n${musicFile ? `5. Add ${musicFile} as the music track and fade out over the last second.\n` : '5. Add music in CapCut if desired.\n'}\nChat and product screens are PNGs. Their text is baked into the images; edit wording in Content Pipeline and export again. Source videos are included for retrimming. For short source ranges, adjust speed to fill the listed beat duration. Story reply fades can be recreated in CapCut using the reference video.\n\nThis is a media-and-timing bundle, not a native CapCut project. CapCut does not document third-party project imports. timeline.json is a portable edit description for future integrations, not a CapCut import file.\n`)
  for (const name of ['timeline.json', 'timeline.csv', 'script.txt', 'CAPCUT-README.txt']) entries.push({ name, file: path.join(workdir, name) })
  const filename = 'capcut-media.zip'
  writeMediaZip(path.join(workdir, filename), entries)
  return filename
}
