import type { Draft } from '@shared/formats/draft'
import type { TimelineState } from '@shared/timeline'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok || data.error) throw new Error(data.error ?? `${response.status} on ${url}`)
  return data
}

export interface Job {
  id: string
  draft_id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  message: string | null
  created_at: string
  finished_at: string | null
}

export interface ExportItem {
  id: string
  draftId: string
  dir: string
  files: string[]
  createdAt: string
  caption: string
  format: string
  status: string
}

export interface AssetItem {
  id: string
  kind: string
  path: string
  tag: string | null
  durationS: number | null
  useCount: number
  missing: boolean
}

export interface SpecResponse {
  format: string
  spec: unknown
  meta: Draft['meta']
  clipTimeline: { states: TimelineState[]; durationS: number } | null
}

export const api = {
  generate: (body: { format: string; brief: string; count: number; style?: string; serial: boolean }) =>
    request<{ drafts: Draft[] }>('/api/generate', { method: 'POST', body: JSON.stringify(body) }),
  drafts: (query: Record<string, string> = {}) =>
    request<{ drafts: Draft[] }>(`/api/drafts?${new URLSearchParams(query)}`),
  draft: (id: string) => request<{ draft: Draft }>(`/api/drafts/${id}`),
  patchDraft: (id: string, body: { spec?: unknown; meta?: unknown; status?: string }) =>
    request<{ draft: Draft }>(`/api/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  regenerate: (id: string) =>
    request<{ draft: Draft }>(`/api/drafts/${id}/regenerate`, { method: 'POST' }),
  spec: (id: string) => request<SpecResponse>(`/api/specs/${id}`),
  render: (draftId: string) =>
    request<{ jobId: string }>('/api/render', { method: 'POST', body: JSON.stringify({ draftId }) }),
  jobs: () => request<{ jobs: Job[] }>('/api/render'),
  job: (id: string) => request<{ job: Job; outputs: string[] }>(`/api/render/${id}`),
  exportJob: (jobId: string) =>
    request<{ export: ExportItem }>(`/api/render/${jobId}/export`, { method: 'POST' }),
  exports: () => request<{ exports: ExportItem[] }>('/api/exports'),
  markPosted: (draftId: string) =>
    request<{ draft: Draft }>(`/api/exports/${draftId}/posted`, { method: 'POST' }),
  assets: () => request<{ assets: AssetItem[] }>('/api/assets'),
  rescanAssets: () =>
    request<{ added: number; missing: number; total: number }>('/api/assets/rescan', { method: 'POST' }),
  settings: () =>
    request<{ settings: Record<string, string>; models: string[]; apiKeySet: boolean }>('/api/settings'),
  saveSettings: (settings: Record<string, string>) =>
    request<{ settings: Record<string, string> }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  health: () =>
    request<{
      ffmpeg: { ok: boolean; version?: string; error?: string }
      chromium: boolean
      apiKeySet: boolean
      counts: Record<string, number>
    }>('/api/health'),
}
