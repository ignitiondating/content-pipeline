import { useRef, useState, type ReactNode } from 'react'
import type { ClipSpec } from '@shared/formats/clip'
import type { EditedSegment } from '@shared/timeline'
import { promoContentFor } from '@shared/timeline'
import AssetPicker from '../studio/AssetPicker'
import ConversationEditor from '../studio/ConversationEditor'
import TrimBar from '../studio/TrimBar'
import ChatScreenshotTool from '../tools/ChatScreenshotTool'
import AppScreenshotTool from '../tools/AppScreenshotTool'
import { api, type AssetItem } from '../../lib/api'

export type DockTab = 'media' | 'chat' | 'audio' | 'caption' | 'tools' | 'clip'

const TABS: Array<{ key: DockTab; label: string }> = [
  { key: 'clip', label: 'Clip' },
  { key: 'media', label: 'Media' },
  { key: 'chat', label: 'Chat' },
  { key: 'audio', label: 'Audio' },
  { key: 'caption', label: 'Caption' },
  { key: 'tools', label: 'Tools' },
]

export default function EditorDock({
  tab,
  onTab,
  visibleTabs,
  children,
}: {
  tab: DockTab
  onTab: (t: DockTab) => void
  visibleTabs?: DockTab[]
  children: ReactNode
}) {
  const tabs = TABS.filter((t) => !visibleTabs || visibleTabs.includes(t.key))
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-800 px-5 pt-3 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            className={`shrink-0 rounded-t-lg px-3.5 py-2 text-xs font-medium ${
              tab === t.key
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
    </div>
  )
}

export function CaptionPanel({
  caption,
  hashtags,
  song,
  gate,
  hook,
  onChange,
}: {
  caption: string
  hashtags: string
  song: string
  gate: string
  hook?: string
  onChange: (next: {
    caption?: string
    hashtags?: string
    song?: string
    gate?: string
    hook?: string
  }) => void
}) {
  return (
    <div className="grid max-w-2xl gap-3">
      {hook !== undefined && (
        <label className="text-xs text-neutral-400">
          On-screen hook
          <input
            value={hook}
            onChange={(e) => onChange({ hook: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </label>
      )}
      <label className="text-xs text-neutral-400">
        Caption
        <input
          value={caption}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs text-neutral-400">
        Hashtags
        <input
          value={hashtags}
          onChange={(e) => onChange({ hashtags: e.target.value })}
          className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-[11px] text-neutral-600">
          Space-separated, each starting with # (e.g. #bagged #fyp)
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-400">
          Song
          <input
            value={song}
            onChange={(e) => onChange({ song: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-400">
          Gate keyword
          <input
            value={gate}
            onChange={(e) => onChange({ gate: e.target.value.toUpperCase() })}
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  )
}

export function MediaPanel({
  clipSpec,
  onClipChange,
  onLibraryChange,
}: {
  clipSpec?: ClipSpec
  onClipChange?: (spec: ClipSpec) => void
  onLibraryChange?: () => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const storyReply = Boolean(
    clipSpec?.chat.storyReply && (clipSpec.chat.skin ?? 'imessage') === 'instagram',
  )

  const upload = async (file: File) => {
    setBusy(true)
    setMessage(null)
    try {
      const tag = clipSpec?.brollTag ?? 'basketball'
      const { asset } = await api.uploadAsset(file, 'broll', tag)
      setMessage(`Uploaded ${asset.path.split('/').pop()}`)
      onLibraryChange?.()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!clipSpec || !onClipChange) {
    return <p className="text-sm text-neutral-500">This format has no media library.</p>
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-neutral-500">
        Footage for the whole video — not for the selected chat bubble.
      </p>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          B-roll pack
        </div>
        <select
          value={clipSpec.brollTag}
          onChange={(e) =>
            onClipChange({ ...clipSpec, brollTag: e.target.value as 'basketball' | '3d' })
          }
          className="mb-3 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
        >
          <option value="basketball">Basketball</option>
          <option value="3d">3D</option>
        </select>
        <AssetPicker
          tag={clipSpec.brollTag}
          selected={clipSpec.brollPaths ?? []}
          onChange={(paths) =>
            onClipChange({ ...clipSpec, brollPaths: paths.length ? paths : undefined })
          }
          storyPath={clipSpec.storyImagePath}
          onStoryChange={
            storyReply
              ? (path) => onClipChange({ ...clipSpec, storyImagePath: path })
              : undefined
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-4">
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg bg-wing-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          Upload b-roll
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
      </div>
      {message && <p className="text-xs text-neutral-500">{message}</p>}
    </div>
  )
}

export function AudioPanel({
  withMusic,
  onChange,
}: {
  withMusic: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={withMusic}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      Mix in a track from the music library when exporting
    </label>
  )
}

export function ToolsPanel() {
  const [which, setWhich] = useState<'chat' | 'app'>('chat')
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setWhich('chat')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            which === 'chat' ? 'border-wing-500' : 'border-neutral-800'
          }`}
        >
          Chat screenshot
        </button>
        <button
          onClick={() => setWhich('app')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            which === 'app' ? 'border-wing-500' : 'border-neutral-800'
          }`}
        >
          App screenshot
        </button>
      </div>
      {which === 'chat' ? <ChatScreenshotTool /> : <AppScreenshotTool />}
    </div>
  )
}

export function ClipInspector({
  spec,
  segment,
  selected,
  segments,
  assets,
  custom,
  onMove,
  onRemove,
  onSetDuration,
  onSetClip,
  onTrim,
  onEditMessage,
  onResetStructure,
  isPinned,
  onClearPin,
}: {
  spec: ClipSpec
  segment: EditedSegment
  selected: number
  segments: EditedSegment[]
  assets: AssetItem[]
  custom: boolean
  onMove: (by: -1 | 1) => void
  onRemove: () => void
  onSetDuration: (s: number | null) => void
  onSetClip: (path: string | null) => void
  onTrim: (trimStartS: number, trimEndS: number) => void
  onEditMessage: (text: string) => void
  onResetStructure: () => void
  isPinned: boolean
  onClearPin: () => void
}) {
  const clips = assets.filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)
  const title =
    segment.type === 'chat'
      ? `Message ${segment.visibleCount}`
      : segment.type === 'promo'
        ? 'WingAI app'
        : segment.type === 'image'
          ? 'Photo'
          : selected === 0
            ? 'Intro clip'
            : selected === segments.length - 1
              ? 'Closing clip'
              : 'B-roll beat'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <div className="flex gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={selected === 0}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs disabled:opacity-30"
          >
            ◀
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={selected === segments.length - 1}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs disabled:opacity-30"
          >
            ▶
          </button>
          <button
            onClick={onRemove}
            disabled={segments.length <= 2}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 disabled:opacity-30 hover:border-red-500"
          >
            Remove
          </button>
        </div>
      </div>

      {segment.type === 'chat' && (
        <>
          <input
            value={spec.chat.messages[segment.visibleCount - 1]?.text ?? ''}
            onChange={(e) => onEditMessage(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <p className="text-xs text-neutral-500">
            This frame is a chat screen. Change footage in Media, or the full conversation in Chat.
          </p>
        </>
      )}

      {segment.type === 'promo' && (
        <p className="text-xs text-neutral-400">
          Suggested reply:{' '}
          <span className="text-neutral-200">
            “{promoContentFor(spec.chat)?.suggestion}”
          </span>
        </p>
      )}

      {segment.type === 'broll' && (
        <>
          {segment.path && (
            <TrimBar
              assetPath={segment.path}
              trimStartS={segment.trimStartS}
              trimEndS={segment.trimEndS}
              onChange={({ trimStartS, trimEndS }) => onTrim(trimStartS, trimEndS)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {clips.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onSetClip(asset.path)}
                className={`overflow-hidden rounded-lg border-2 ${
                  segment.path === asset.path ? 'border-wing-500' : 'border-neutral-800'
                }`}
              >
                <video
                  src={`/files/${asset.path}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-16 w-10 object-cover"
                />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-neutral-400">Duration</label>
        <input
          type="number"
          step="0.1"
          min="0.4"
          max="15"
          value={segment.durS}
          onChange={(e) => onSetDuration(Number(e.target.value))}
          className="w-20 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm tabular-nums"
        />
        <span className="text-xs text-neutral-500">s</span>
        {isPinned && (
          <button
            onClick={onClearPin}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs"
          >
            Auto
          </button>
        )}
      </div>

      {custom && (
        <button
          onClick={onResetStructure}
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-white"
        >
          Reset to automatic structure
        </button>
      )}
    </div>
  )
}

export function InsertPanel({
  assets,
  spec,
  onInsert,
  onCancel,
}: {
  assets: AssetItem[]
  spec: ClipSpec
  onInsert: (frame: EditedSegment) => void
  onCancel: () => void
}) {
  const clips = assets.filter((a) => a.kind === 'broll' && a.tag === spec.brollTag)
  const photos = assets.filter((a) => ['background', 'shot', 'promo'].includes(a.kind))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Add a frame</span>
        <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-white">
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {clips.map((asset) => (
          <button
            key={asset.id}
            onClick={() => onInsert({ type: 'broll', path: asset.path, durS: 2.8 })}
            className="overflow-hidden rounded-lg border-2 border-neutral-800"
          >
            <video
              src={`/files/${asset.path}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              className="h-16 w-10 object-cover"
            />
          </button>
        ))}
      </div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onInsert({ type: 'image', path: asset.path, durS: 2.2 })}
              className="overflow-hidden rounded-lg border-2 border-neutral-800"
            >
              <img src={`/files/${asset.path}`} alt="" className="h-16 w-10 object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {spec.chat.messages.map((m, mi) => (
          <button
            key={mi}
            onClick={() => onInsert({ type: 'chat', visibleCount: mi + 1, durS: 2.0 })}
            className="max-w-[200px] truncate rounded-lg border border-neutral-800 px-2 py-1 text-xs"
          >
            {mi + 1}. {m.text}
          </button>
        ))}
      </div>
    </div>
  )
}

export { ConversationEditor }
