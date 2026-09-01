# content-pipeline

Estudio web **100% local** para generar, revisar, renderizar y exportar contenido corto de WingAI (TikTok / IG Reels). Sin software comercial: FFmpeg vendorizado, Chromium de Playwright, SQLite. Las únicas llamadas externas son a la Claude API para generar guiones/conversaciones/captions.

## Formatos

| Formato | Salida |
|---|---|
| **Chat carousel** | 2–3 PNGs 1080×1920 de conversaciones estilo iMessage, para foto-post con canción trending |
| **Slideshow** | Serie de imágenes 9:16 (shoot your shot / comedia / date ideas) sobre fondos rotados |
| **"Take notes" clip** | MP4 9:16 de 15–40s: b-roll + hook en frame 1 + chat que aparece mensaje a mensaje |
| **Comment-gated serial** | Mecánica sobre los anteriores: partes enlazadas con cliffhanger + keyword ("comment JOB for part 2") |

No hay auto-posting (las APIs de TikTok/IG están gated): cada export deja los archivos + `caption.txt` listos para copiar y subir a mano.

## Setup

```bash
npm install
npm run setup          # vendoriza FFmpeg y descarga Chromium
cp .env.example .env   # añade tu ANTHROPIC_API_KEY
npm run dev            # UI en http://localhost:5173, API en :8787
```

Suelta assets en `library/` y pulsa **Rescan** en la página Assets:

- `library/broll/basketball/*.mp4`, `library/broll/3d/*.mp4` — b-roll para los clips
- `library/backgrounds/*.jpg` — fondos de slideshows
- `library/music/*.mp3` — música opcional para muxear

## Flujo

Generate (formato + brief + N variantes) → Batch review (aprobar / editar / regenerar) → Render queue → Library (descargar + copiar caption + "Mark posted").

Los hooks de drafts aprobados/posteados se inyectan como avoid-list en la siguiente generación para no repetir premisas.

## Arquitectura

- `shared/` — única fuente de verdad: schemas zod por formato, métricas del chat, solver de timeline del clip. Lo importan el preview del navegador **y** el renderer del servidor.
- `src/` — SPA (Vite + React + Tailwind). Las rutas `/render/*` son páginas de captura sin chrome que Playwright fotografía a 540×960 con deviceScaleFactor 2 → 1080×1920 exactos.
- `server/` — API Hono: generación con Claude (tool-use forzado + validación zod + 1 retry), SQLite (`data/studio.db`), catálogo de assets con rotación LRU, cola de render (concurrencia 1) y FFmpeg para el clip (`overlay` con `enable=between(t,a,b)` por estado; el argv exacto queda en `command.txt` de cada job).
- La fidelidad del chat usa la tipografía del sistema (SF en macOS); no se bundlean fuentes de Apple.

## Tests

```bash
npm test         # vitest: schemas + timeline determinista
npm run typecheck
```
