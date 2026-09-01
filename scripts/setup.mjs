#!/usr/bin/env node
/** One-shot setup: vendored FFmpeg + Playwright Chromium. */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT })

console.log('▸ Vendoring FFmpeg…')
run('node', ['scripts/setup-ffmpeg.mjs'])

console.log('▸ Installing Playwright Chromium…')
run('npx', ['playwright', 'install', 'chromium'])

console.log('\nSetup complete. Copy .env.example to .env, add your ANTHROPIC_API_KEY, then: npm run dev')
