import { useCallback, useEffect, useRef, useState } from 'react'
import WingPromoShot from '../components/promo/WingPromoShot'
import Scaled from '../components/studio/Scaled'
import { api, type AssetItem } from '../lib/api'

const DEFAULTS = {
  bubbleMe: 'is your dad a pirate?',
  bubbleThem: 'no, why?',
  suggestion: "Because you're a treasure.",
}

export default function PromoShots() {
  const [backgrounds, setBackgrounds] = useState<AssetItem[]>([])
  const [shots, setShots] = useState<AssetItem[]>([])
  const [imagePath, setImagePath] = useState<string | undefined>(undefined)
  const [bubbleMe, setBubbleMe] = useState(DEFAULTS.bubbleMe)
  const [bubbleThem, setBubbleThem] = useState(DEFAULTS.bubbleThem)
  const [suggestion, setSuggestion] = useState(DEFAULTS.suggestion)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    api
      .assets()
      .then((r) => {
        const live = r.assets.filter((a) => !a.missing)
        setBackgrounds(live.filter((a) => a.kind === 'background'))
        setShots(live.filter((a) => a.kind === 'promo'))
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const { asset } = await api.uploadAsset(file, 'background')
      setImagePath(asset.path)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { asset } = await api.createPromoShot({ imagePath, bubbleMe, bubbleThem, suggestion })
      setMessage(`Saved ${asset.path} — cuts clips will pick it up automatically.`)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div>
        <h1 className="mb-2 text-2xl font-bold">Promo shots</h1>
        <p className="mb-6 max-w-xl text-sm text-neutral-400">
          WingAI-branded screenshots: the imported conversation plus the suggested reply. Note:
          cuts clips now auto-generate a matching shot from their own conversation at render time —
          use this section for manual one-off shots (posts, carousels, ads). PNGs land in{' '}
          <code>library/promo/</code>.
        </p>

        <div className="mb-5">
          <div className="mb-2 text-sm font-medium">Conversation photo</div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setImagePath(undefined)}
              className={`flex h-24 w-16 items-center justify-center rounded-lg border text-xs text-neutral-500 ${
                imagePath === undefined ? 'border-wing-500' : 'border-neutral-800'
              }`}
            >
              none
            </button>
            {backgrounds.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setImagePath(asset.path)}
                title={asset.path}
                className={`overflow-hidden rounded-lg border ${
                  imagePath === asset.path ? 'border-wing-500' : 'border-neutral-800'
                }`}
              >
                <img src={`/files/${asset.path}`} alt="" className="h-24 w-16 object-cover" />
              </button>
            ))}
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="flex h-24 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-700 text-2xl text-neutral-500 hover:border-neutral-500 disabled:opacity-50"
            >
              +
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="mb-5 grid gap-3">
          <label className="text-sm">
            Your line (blue bubble)
            <input
              value={bubbleMe}
              onChange={(e) => setBubbleMe(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Her reply (grey bubble)
            <input
              value={bubbleThem}
              onChange={(e) => setBubbleThem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Suggested reply (the WingAI prompt below)
            <input
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            />
          </label>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</div>}
        {message && <div className="mb-4 rounded-lg bg-emerald-950 p-3 text-sm text-emerald-300">{message}</div>}
        <button
          onClick={generate}
          disabled={busy || !bubbleMe || !bubbleThem || !suggestion}
          className="rounded-lg bg-wing-500 px-5 py-2 font-medium hover:bg-wing-400 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate shot'}
        </button>

        {shots.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Generated shots
            </div>
            <div className="flex flex-wrap gap-3">
              {shots.map((shot) => (
                <a key={shot.id} href={`/files/${shot.path}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/files/${shot.path}`}
                    alt=""
                    className="h-40 rounded-lg border border-neutral-800 hover:border-neutral-600"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 lg:mt-0">
        <div className="flex flex-col items-center lg:sticky lg:top-6 lg:items-stretch">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Preview</div>
          <Scaled height={620}>
            <WingPromoShot
              spec={{
                imageUrl: imagePath ? `/files/${imagePath}` : undefined,
                bubbleMe,
                bubbleThem,
                suggestion,
              }}
            />
          </Scaled>
        </div>
      </div>
    </div>
  )
}
