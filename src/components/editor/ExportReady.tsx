export type ExportOverlayMode = 'rendering' | 'ready' | 'error'

export default function ExportReady({
  mode,
  progress,
  statusMessage,
  error,
  format,
  fileBase,
  files,
  caption,
  hashtags,
  song,
  posted,
  onClose,
  onCopy,
  onPosted,
  onRetry,
}: {
  mode: ExportOverlayMode
  progress: number
  statusMessage: string | null
  error: string | null
  format: string
  fileBase: string
  files: string[]
  caption: string
  hashtags: string[]
  song: string
  posted: boolean
  onClose: () => void
  onCopy: () => void
  onPosted: () => void
  onRetry: () => void
}) {
  const media = files.filter((f) => f !== 'caption.txt')
  const video = media.find((f) => f.endsWith('.mp4'))
  const images = media.filter((f) => f.endsWith('.png'))
  const pct = Math.max(4, Math.round((progress || 0) * 100))

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm sm:p-10">
      <div className="flex max-h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-800 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {mode === 'ready' ? 'Ready to post' : mode === 'error' ? 'Export failed' : 'Exporting'}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold">
              {mode === 'ready'
                ? 'Your file is ready'
                : mode === 'error'
                  ? 'Could not finish the render'
                  : format === 'clip'
                    ? 'Rendering your video'
                    : 'Capturing your slides'}
            </h2>
          </div>
          {mode !== 'rendering' && (
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              Close
            </button>
          )}
        </header>

        {mode === 'rendering' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-16">
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-wing-500 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-sm tabular-nums text-neutral-300">{pct}%</div>
            <p className="max-w-md text-center text-sm text-neutral-500">
              {statusMessage ?? 'Starting render…'}
              <span className="mt-2 block text-xs">Usually 1–2 minutes. Keep this tab open.</span>
            </p>
          </div>
        )}

        {mode === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-16">
            <p className="max-w-md text-center text-sm text-red-300">
              {error ?? 'Something went wrong while rendering.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onRetry}
                className="rounded-lg bg-wing-500 px-4 py-2 text-sm font-semibold hover:bg-wing-400"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
              >
                Back to editor
              </button>
            </div>
          </div>
        )}

        {mode === 'ready' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
            <div className="flex items-center justify-center bg-black p-6">
              {video ? (
                <video
                  src={`${fileBase}/${video}`}
                  controls
                  playsInline
                  autoPlay
                  className="max-h-[70vh] w-full rounded-xl bg-black"
                />
              ) : (
                <div className="flex max-h-[70vh] gap-3 overflow-x-auto">
                  {images.map((file) => (
                    <img
                      key={file}
                      src={`${fileBase}/${file}`}
                      alt=""
                      className="h-[min(70vh,560px)] rounded-xl"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-5 p-6 sm:p-8">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Caption
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm leading-relaxed">
                  {caption}
                  {hashtags.length > 0 && (
                    <div className="mt-3 text-neutral-400">{hashtags.join(' ')}</div>
                  )}
                </div>
                {song && (
                  <p className="mt-2 text-xs text-neutral-500">Suggested sound: {song}</p>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2">
                {video ? (
                  <a
                    href={`${fileBase}/${video}`}
                    download
                    className="rounded-xl bg-wing-500 px-4 py-3 text-center text-sm font-semibold hover:bg-wing-400"
                  >
                    Download video
                  </a>
                ) : (
                  <div className="flex flex-col gap-2">
                    {images.map((file) => (
                      <a
                        key={file}
                        href={`${fileBase}/${file}`}
                        download
                        className="rounded-xl bg-wing-500 px-4 py-3 text-center text-sm font-semibold hover:bg-wing-400"
                      >
                        Download {file}
                      </a>
                    ))}
                  </div>
                )}
                <button
                  onClick={onCopy}
                  className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-medium hover:border-neutral-500"
                >
                  Copy caption
                </button>
                {posted ? (
                  <p className="py-2 text-center text-xs text-neutral-500">Marked as posted</p>
                ) : (
                  <button
                    onClick={onPosted}
                    className="rounded-xl px-4 py-2 text-sm text-neutral-400 hover:text-white"
                  >
                    Mark as posted
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="pt-1 text-sm text-neutral-500 hover:text-neutral-300"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
