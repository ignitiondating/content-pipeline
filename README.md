# content-pipeline

Local web studio that generates, reviews, renders and exports WingAI's short-form content (TikTok / IG Reels). From a creative brief to upload-ready files — no video editor, no cloud rendering, everything runs on your machine. The only external call is the Claude API for writing the content.

## What it produces

| Format | Output | Why it exists |
|---|---|---|
| **Chat carousel** | 2–3 pixel-perfect fake iMessage screenshots (1080×1920 PNG) | TikTok photo posts are a lower-competition surface; competitors pull 100–300K views with these |
| **Slideshow** | 9:16 image series in three styles: shoot-your-shot lessons, comedic, date ideas | Cheapest format in the niche; save-driven ranking |
| **"Take notes" clip** | 15–40s vertical MP4 in two structures — `overlay` (chat card floating over continuous b-roll) or `cuts` (full-screen chat hard-cut with b-roll hype bursts) | Highest-volume competitor format (1.4M views on the reference posts) |
| **Comment-gated serial** | 2–3 linked parts of any format above, cut on a cliffhanger with a comment keyword ("comment JOB for part 2 — link in bio") | Highest-leverage mechanic in the competitive research (2.6M-view posts) |

No auto-posting: TikTok/IG publishing APIs are gated. Every export lands as files plus a `caption.txt` sidecar (caption, hashtags, song suggestion, gate keyword) ready to copy-paste when uploading manually.

## Setup

Requirements: macOS (chat rendering relies on the system SF font), Node 20+, an Anthropic API key.

```bash
npm install
npm run setup          # vendors a full FFmpeg build + downloads Playwright Chromium
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev            # studio at http://localhost:5173 (API on :8787)
```

Then drop assets into `library/` and hit **Rescan** on the Assets page:

- `library/broll/basketball/*.mp4`, `library/broll/3d/*.mp4` — clip backgrounds (free stock: Pexels/Pixabay/Mixkit; or AI-generated vertical loops)
- `library/backgrounds/*.jpg` — slideshow photo backgrounds (falls back to a flat matte look when empty)
- `library/music/*.mp3` — optional muxed tracks (trending sounds are better added in-app at post time)

A fresh clone starts empty: drafts, renders, exports, assets and the local database are all gitignored. Each operator generates their own content with their own API key. **Never commit `.env`.**

## How it works

The flow is a funnel — the steps bar at the top of the studio mirrors it:

**Generate → Review → Render → Export → Post**

1. **Generate** — pick a format (+ slideshow style or clip structure), write a free-text brief, request N variants. One Claude call returns N structured specs (full conversation, caption, hashtags, song, gate keyword), validated against zod schemas with an automatic retry on validation errors. Text only — fast and cheap. Each variant is stored as a *draft*.
2. **Review** — the batch grid shows a live preview of every variant (simulated from the spec, no files yet). Approve, reject, edit (form + JSON with live preview), or regenerate. Nothing becomes a file without passing this human filter.
3. **Render** — a concurrency-1 queue materializes approved specs. Images: headless Chromium screenshots the same React components the preview uses, at 540×960 with 2× density → exact 1080×1920 PNGs. Clips: a deterministic timeline solver turns the conversation into timed states; transparent state captures are composited over b-roll by a single FFmpeg invocation (hardware encoding when available). Every render job writes a reproducible `command.txt`.
4. **Export** — deliverables are copied to `out/exports/<draftId>/` with the `caption.txt` sidecar.
5. **Post** — download from the Library, upload manually, hit **Mark posted**. Posted captions feed an avoid-list injected into every future generation, so the tool never repeats a premise you already published.

### Content generation details

- **Style guide** distilled from the Aug-2026 competitive research: the caption language that ranks ("*take notes*", "huzz", question captions, outcome hashtags `#bagged #folded #clutch #unoreverse`) and the words no viral post in the niche uses ("dating", "relationship", "AI assistant"). Plus realism rules for conversations and content guardrails (playful never explicit, adults only, no invented product features).
- **Dedupe**: hooks from the last ~30 approved/posted drafts are passed to Claude as "do not repeat these premises".
- **Asset rotation**: b-roll, backgrounds and music are picked least-recently-used within their tag so consecutive renders never repeat.
- Model is configurable in Settings (`claude-sonnet-5` default, `claude-fable-5` available).

## Architecture

```
shared/    Single source of truth: zod spec schemas per format, chat visual
           metrics, clip timeline solvers (unit-tested), example content.
           Imported by BOTH the browser and the server.
src/       Vite + React + Tailwind SPA: 8 studio pages plus chrome-less
           /render/* capture pages that Playwright screenshots.
server/    Hono API + SQLite (better-sqlite3): Claude generation, draft
           lifecycle (draft → approved → rendered → exported → posted),
           render queue, asset catalog, exports.
library/   Your asset drop folders (gitignored).
out/       Render workdirs and final exports (gitignored).
vendor/    Vendored FFmpeg — Homebrew's build can't burn text (gitignored).
```

Everything is open-source dependencies and local state; `data/studio.db` is the only database.

## Tests

```bash
npm test          # vitest: spec schemas + deterministic timeline solvers
npm run typecheck
```

## To-dos

- [ ] **Real collaboration.** Today the tool is single-operator: drafts, history and exports live in a local SQLite file and are not shared through git (by design — heavy binaries, constant DB conflicts). To let a team work against the same content pool: move persistence to a shared database (hosted Postgres or Turso) and exports to object storage (S3/R2), with the render queue still running locally per operator. Interim workaround: zip `out/exports/` or copy `data/studio.db` + `out/exports/` to a teammate.
- [ ] Real basketball b-roll in `library/broll/basketball/` (free stock or licensed footage; current file is a synthetic test gradient).
- [ ] Optional ElevenLabs TTS voiceover for slideshows/clips (planned, behind a setting).
- [ ] Auto-posting when TikTok/IG publishing APIs become available to us.
- [ ] Per-format field editors in the Draft Editor (today: meta form + raw JSON spec with live preview).
- [ ] Editable examples UI (the Generate page samples persist in the DB and already have a `PUT /api/examples` endpoint; no UI yet).
