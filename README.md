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
  - Two folders deep sets what a clip is *for*: `basketball/intro/` opens the video, `basketball/beats/` plays between the messages, `basketball/outro/` closes it. A clip dropped straight into the tag folder counts as a between-messages beat, so an existing library keeps working untouched. Uploads from the editor land in the role picked next to the drop zone.
- `library/backgrounds/*.jpg` — slideshow photo backgrounds (falls back to a flat matte look when empty)
- `library/music/*.mp3` — optional muxed tracks (trending sounds are better added in-app at post time)

A fresh clone starts empty: drafts, renders, exports, assets and the local database are all gitignored. Each operator generates their own content with their own API key. **Never commit `.env`.**

## How it works

### Template-first video creation

The **Create** page starts with a video template gallery. Choose **Shoot your shot** (hard cuts) or **Floating conversation** (continuous footage), or reuse a template saved from an earlier edit. Both open the same timeline editor. Selecting a video format immediately opens a saved, populated editor with a preview and editable script—there is no idea/setup screen. Customize the hook and conversation directly, or expand **Draft a new script with AI** in the editor. AI suggestions are reviewed before applying and preserve the hook, speakers, and footage. Hard-cut timing stays fixed; floating chat pacing follows the new message lengths. Create hook batches from the editor when ready. All versions remain in Your content for review.

Cuts are hard by default. Any single beat can **fade to black** instead: select it and tick the box in the beat panel, which suggests a length from the clip's own duration and lets you change it. It is a per-clip decision, never video-wide — a screenshot landing between two clips usually wants one, a run of footage usually does not. The timeline draws each fade as a dark edge on the block. The story reply keeps its own fade without being asked, and can be overridden like any other.

**Floating conversation** edits on two lanes sharing one ruler and playhead: the footage underneath and the card reveals on top. The conversation owns the runtime — retiming a message stretches the footage to cover it — while cutting, trimming or retiming the footage never moves the script; a clip takes the time from its neighbour. Drag a clip onto the footage lane to cut between several backgrounds instead of looping one. A background clip shorter than its slot loops rather than slowing down.

The hard-cut editor combines the timeline, video preview, hook/script, and footage library in one view. A readiness bar links directly to missing hooks, empty messages, or unavailable media; rendering stays disabled until these are resolved. The timeline supports: drag beats to reorder, resize their right edges to change duration, and drag the white playhead to scrub. The play/pause control below the timeline resumes from the selected time, with a live timecode and playhead that follows playback. Edit the hook and conversation, search your existing B-roll library, drag footage onto the timeline, or upload MP4/MOV/WebM files directly in the editor. Multiple uploaded clips fill available B-roll slots without changing their timing. The trim handles select up to 20 seconds of source footage per beat. Story replies start with a bundled AI-generated photo. Use **Replace story** under the hook to upload, drop in, or select another image from the library; the rendered video uses that same story. Custom screenshots can be made with the existing Tools page and inserted through the frame controls.

**Apply AI edit** uses the configured Anthropic model to adjust footage and pacing from your direction, while retaining the script. **Shuffle B-roll & pacing** works locally. Both can be undone. **Turn this into a batch** accepts one hook per line, or a version count. It preserves the script and timing by default and optionally changes B-roll pacing. Footage variations use the clips already selected for the video. **Save format** preserves the script, media choices, and structure in the local database for reuse. Review each version before rendering. Select reviewed versions in the batch grid to queue them together. The render queue prepares all finished downloads, and Downloads can package up to 50 selected videos and their captions into one ZIP.

Video renders also produce **capcut-media.zip**, available from the completed Create flow and exported Library. It includes source footage, captured chat/product screens, the hook overlay, script, and CSV/JSON timing information. Unzip it and use the guide to assemble the media in CapCut. This is a media handoff, **not a native editable CapCut project**: CapCut does not document third-party project imports, and text inside exported screenshots remains baked in. The ZIP uses uncompressed media with a 4 GB archive limit. B-roll sourcing currently means the uploaded local library; there is no external stock-search or AI video-generation provider connected.

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
- **Asset rotation**: b-roll, backgrounds and music are picked least-recently-used within their tag so consecutive renders never repeat. Within a video, clips are picked by role: the opening beat from `intro/`, the closer from `outro/`, and the beats between messages rotate through `beats/`.
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

## Deploy (Railway)

The repo ships a `Dockerfile` (Playwright base image + vendored Linux FFmpeg + built SPA served by the API) and a `railway.json`. To deploy:

1. Railway → New Service → Deploy from GitHub repo (`ignitiondating/content-pipeline`). The Dockerfile is picked up automatically.
2. Attach a **volume** mounted at `/data` — the database, uploaded assets and exports live there (`STATE_DIR=/data` is set in the image).
3. Set the `ANTHROPIC_API_KEY` variable. Nothing else is required; Railway's `PORT` is honored automatically.
4. Generate a public domain and share it with the team.

Cloud differences vs. running on a Mac: assets are uploaded through the Assets page instead of dropped into folders, chat screenshots render with Inter instead of the Apple system font (close, but check a carousel before shipping), and encoding uses libx264 (slower). ⚠️ **There is no authentication yet** — anyone with the URL can use the studio and spend API credits; keep the URL private until auth lands.

## Tests

```bash
npm test          # vitest: spec schemas + deterministic timeline solvers
npm run typecheck
```

## To-dos

- [ ] **Real collaboration.** Today the tool is single-operator: drafts, history and exports live in a local SQLite file and are not shared through git (by design — heavy binaries, constant DB conflicts). To let a team work against the same content pool: move persistence to a shared database (hosted Postgres or Turso) and exports to object storage (S3/R2), with the render queue still running locally per operator. Interim workaround: zip `out/exports/` or copy `data/studio.db` + `out/exports/` to a teammate.
- [ ] More basketball b-roll, filed by role in `library/broll/basketball/intro|beats|outro/` — the variety between messages is what keeps a video from feeling repetitive, and there is no stock-footage provider wired in, so this is a sourcing job.
- [ ] Optional ElevenLabs TTS voiceover for slideshows/clips (planned, behind a setting).
- [ ] Auto-posting when TikTok/IG publishing APIs become available to us.
- [ ] Per-format field editors in the Draft Editor (today: meta form + raw JSON spec with live preview).
- [ ] Editable examples UI (the Generate page samples persist in the DB and already have a `PUT /api/examples` endpoint; no UI yet).
