import { useState } from 'react'
import AppScreenshotTool from '../components/tools/AppScreenshotTool'
import ChatScreenshotTool from '../components/tools/ChatScreenshotTool'

const TABS = [
  { key: 'chat', label: 'Chat screenshot', blurb: 'A fake iMessage or Instagram conversation as an image.' },
  { key: 'app', label: 'App screenshot', blurb: 'The WingAI screen showing a suggested reply.' },
] as const

/**
 * Standalone image makers. Separate from the video pipeline on purpose:
 * these produce one-off assets for posts and ads, nothing else.
 */
export default function Tools() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('chat')

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Tools</h1>
      <p className="mb-5 text-sm text-neutral-500">
        One-off screenshots you can download and use anywhere. Videos are made in Create.
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.blurb}
            className={`rounded-lg border px-4 py-2 text-sm ${
              tab === t.key ? 'border-wing-500 bg-wing-950/40' : 'border-neutral-800 text-neutral-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'chat' ? <ChatScreenshotTool /> : <AppScreenshotTool />}
    </div>
  )
}
