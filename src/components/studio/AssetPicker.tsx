import { useCallback, useEffect, useState } from 'react'
import { api, type AssetItem } from '../../lib/api'

/** First frame of a clip, no server-side thumbnailing needed. */
function VideoThumb({ path }: { path: string }) {
  return (
    <video
      src={`/files/${path}#t=0.1`}
      muted
      playsInline
      preload="metadata"
      className="h-24 w-16 object-cover"
    />
  )
}

/**
 * Pick exactly which clips go into this video, in order. Defaults to the
 * automatic filename order so the common case stays one click.
 */
export default function AssetPicker({
  tag,
  selected,
  onChange,
  storyPath,
  onStoryChange,
}: {
  tag: 'basketball' | '3d'
  /** Ordered b-roll paths; empty means automatic. */
  selected: string[]
  onChange: (paths: string[]) => void
  /** Optional story photo picker (only shown when the handler is given). */
  storyPath?: string
  onStoryChange?: (path: string | undefined) => void
}) {
  const [broll, setBroll] = useState<AssetItem[]>([])
  const [backgrounds, setBackgrounds] = useState<AssetItem[]>([])
  const manual = selected.length > 0

  const load = useCallback(() => {
    api
      .assets()
      .then((r) => {
        const live = r.assets.filter((a) => !a.missing)
        setBroll(live.filter((a) => a.kind === 'broll'))
        setBackgrounds(live.filter((a) => a.kind === 'background'))
      })
      .catch(() => {})
  }, [])
  useEffect(load, [load])

  const tagged = broll.filter((a) => a.tag === tag)
  const toggle = (path: string) =>
    onChange(selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onChange([])}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            manual ? 'border-neutral-900 bg-neutral-950' : 'border-neutral-500 bg-neutral-800'
          }`}
        >
          Auto — my clips in order
        </button>
        <button
          onClick={() => onChange(tagged.slice(0, 6).map((a) => a.path))}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            manual ? 'border-neutral-500 bg-neutral-800' : 'border-neutral-900 bg-neutral-950'
          }`}
        >
          Choose specific clips
        </button>
      </div>

      {manual && (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            Tap to add or remove. The number is the order they appear; the last one closes the video.
          </p>
          <div className="flex flex-wrap gap-2">
            {tagged.map((asset) => {
              const order = selected.indexOf(asset.path)
              return (
                <button
                  key={asset.id}
                  onClick={() => toggle(asset.path)}
                  title={asset.path.split('/').pop()}
                  className={`relative overflow-hidden rounded-lg border-2 ${
                    order >= 0 ? 'border-wing-500' : 'border-neutral-800'
                  }`}
                >
                  <VideoThumb path={asset.path} />
                  {order >= 0 && (
                    <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-wing-500 text-xs font-bold text-white">
                      {order + 1}
                    </span>
                  )}
                </button>
              )
            })}
            {tagged.length === 0 && (
              <p className="text-sm text-neutral-500">
                No {tag} clips yet — upload a video below.
              </p>
            )}
          </div>
        </>
      )}

      {onStoryChange && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Story photo
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onStoryChange(undefined)}
              className={`flex h-24 w-16 items-center justify-center rounded-lg border-2 text-xs text-neutral-500 ${
                storyPath ? 'border-neutral-800' : 'border-wing-500'
              }`}
            >
              auto
            </button>
            {backgrounds.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onStoryChange(asset.path)}
                className={`overflow-hidden rounded-lg border-2 ${
                  storyPath === asset.path ? 'border-wing-500' : 'border-neutral-800'
                }`}
              >
                <img src={`/files/${asset.path}`} alt="" className="h-24 w-16 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
