import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [models, setModels] = useState<string[]>([])
  const [apiKeySet, setApiKeySet] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    api.settings().then((r) => {
      setSettings(r.settings)
      setModels(r.models)
      setApiKeySet(r.apiKeySet)
    })
  }, [])

  const save = async () => {
    await api.saveSettings(settings)
    setStatus('saved')
    setTimeout(() => setStatus(null), 1200)
  }

  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }))

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-8 text-2xl font-bold">Settings</h1>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        <div className="mb-6 text-sm">
          Claude API key:{' '}
          {apiKeySet ? (
            <span className="text-emerald-400">configured via .env</span>
          ) : (
            <span className="text-red-400">missing — set ANTHROPIC_API_KEY in .env</span>
          )}
        </div>
        <label className="mb-5 block text-sm">
          Generation model
          <select
            value={settings.model ?? 'claude-sonnet-5'}
            onChange={(e) => set('model', e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5"
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-6 block text-sm">
          WingAI handle to tag in captions
          <input
            value={settings.handle ?? ''}
            onChange={(e) => set('handle', e.target.value)}
            placeholder="@wingai…"
            className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5"
          />
        </label>
        <button onClick={save} className="rounded-lg bg-wing-500 px-4 py-2.5 hover:bg-wing-400">
          Save
        </button>
        {status && <span className="ml-3 text-sm text-neutral-400">{status}</span>}
      </div>
    </div>
  )
}
