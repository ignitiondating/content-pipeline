#!/usr/bin/env node
/**
 * Vendors an FFmpeg build into vendor/ffmpeg/. Homebrew's FFmpeg ships
 * without libass/libfreetype so it cannot burn text; the project brings its
 * own binary and probes the filters it actually needs before every render.
 *
 *   node scripts/setup-ffmpeg.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { arch } from 'node:os'

const ROOT = path.resolve(import.meta.dirname, '..')
const VENDOR = path.join(ROOT, 'vendor', 'ffmpeg')

const REQUIRED = ['overlay', 'scale', 'crop', 'format', 'subtitles']

function probe(binary) {
  const result = spawnSync(binary, ['-hide_banner', '-filters'], {
    encoding: 'utf-8',
    maxBuffer: 1 << 24,
  })
  if (result.status !== 0) return { ok: false, missing: REQUIRED }
  const available = new Set(
    result.stdout.split('\n').map((line) => line.trim().split(/\s+/)[1]).filter(Boolean),
  )
  const missing = REQUIRED.filter((f) => !available.has(f))
  return { ok: missing.length === 0, missing }
}

function download(url, target) {
  execFileSync('curl', ['-sL', '--fail', '--max-time', '300', '-o', target, url], {
    stdio: 'inherit',
  })
}

const platform = process.platform === 'darwin' ? 'macos' : 'linux'
const cpu = arch() === 'arm64' ? 'arm64' : 'amd64'

const SOURCES = [
  {
    name: `martin-riedl.de (${platform}/${cpu})`,
    urls: {
      ffmpeg: `https://ffmpeg.martin-riedl.de/redirect/latest/${platform}/${cpu}/release/ffmpeg.zip`,
      ffprobe: `https://ffmpeg.martin-riedl.de/redirect/latest/${platform}/${cpu}/release/ffprobe.zip`,
    },
  },
  ...(process.platform === 'darwin'
    ? [
        {
          name: 'evermeet.cx (macOS x86_64, via Rosetta)',
          urls: {
            ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/zip',
            ffprobe: 'https://evermeet.cx/ffprobe/getrelease/zip',
          },
        },
      ]
    : []),
]

const vendored = path.join(VENDOR, 'ffmpeg')
if (existsSync(vendored)) {
  const { ok, missing } = probe(vendored)
  if (ok) {
    console.log('FFmpeg already vendored in vendor/ffmpeg/')
    process.exit(0)
  }
  console.log(`Vendored binary unusable (missing: ${missing.join(', ')}). Replacing.`)
}

mkdirSync(VENDOR, { recursive: true })

for (const source of SOURCES) {
  console.log(`Trying ${source.name}…`)
  const staging = path.join(VENDOR, '_staging')
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  try {
    for (const [binary, url] of Object.entries(source.urls)) {
      const zip = path.join(staging, `${binary}.zip`)
      download(url, zip)
      execFileSync('unzip', ['-o', '-q', zip, '-d', staging])
      rmSync(zip, { force: true })
    }

    const candidate = path.join(staging, 'ffmpeg')
    if (!existsSync(candidate)) throw new Error('zip did not contain the binary')
    chmodSync(candidate, 0o755)
    const { ok, missing } = probe(candidate)
    if (!ok) throw new Error(`missing filters: ${missing.join(', ')}`)

    for (const binary of ['ffmpeg', 'ffprobe']) {
      const from = path.join(staging, binary)
      if (!existsSync(from)) continue
      chmodSync(from, 0o755)
      rmSync(path.join(VENDOR, binary), { force: true })
      renameSync(from, path.join(VENDOR, binary))
    }
    rmSync(staging, { recursive: true, force: true })

    // macOS quarantines downloads; Gatekeeper would block the binary.
    if (process.platform === 'darwin') {
      spawnSync('xattr', ['-dr', 'com.apple.quarantine', VENDOR])
    }

    console.log(`FFmpeg vendored from ${source.name}`)
    process.exit(0)
  } catch (error) {
    console.log(`  → failed: ${error.message}`)
    rmSync(staging, { recursive: true, force: true })
  }
}

console.error(
  '\nCould not vendor FFmpeg. Manual alternative: install any full FFmpeg build\n' +
    'and export FFMPEG_PATH / FFPROBE_PATH pointing at the binaries.',
)
process.exit(1)
