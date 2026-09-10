import type { Draft } from '@shared/formats/draft'
import type { TimelineState } from '@shared/timeline'
import type { Examples } from '@shared/examples'
import type { ChatSpec } from '@shared/formats/chat'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    // FormData bodies must set their own multipart boundary.
    headers: typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
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
  caption: string
  format: string
  draftStatus: string
  outputs: string[]
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
  generate: (body: {
    format: string
    brief: string
    count: number
    style?: string
    structure?: string
    brollTag?: string
    carouselStyle?: string
    skin?: string
    serial: boolean
  }) =>
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
  uploadAsset: (file: File, kind: 'background' | 'music' | 'broll', tag?: 'basketball' | '3d') => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    if (tag) form.append('tag', tag)
    return request<{ asset: AssetItem }>('/api/assets/upload', { method: 'POST', body: form })
  },
  createPromoShot: (body: { imagePath?: string; bubbleMe: string; bubbleThem: string; suggestion: string }) =>
    request<{ asset: AssetItem }>('/api/promo-shots', { method: 'POST', body: JSON.stringify(body) }),
  createChatShot: (body: {
    chat: unknown
    mode: 'full' | 'zoom'
    storyImagePath?: string
  }) => request<{ asset: AssetItem }>('/api/chat-shots', { method: 'POST', body: JSON.stringify(body) }),
  chatShot: (id: string) =>
    request<{
      spec: { chat: ChatSpec; mode: 'full' | 'zoom'; storyImagePath?: string }
    }>(`/api/chat-shots/${id}`),
  promoShot: (id: string) =>
    request<{ spec: { imagePath?: string; bubbleMe: string; bubbleThem: string; suggestion: string } }>(
      `/api/promo-shots/${id}`,
    ),
  rescanAssets: () =>
    request<{ added: number; missing: number; total: number }>('/api/assets/rescan', { method: 'POST' }),
  counts: () => request<{ drafts: Record<string, number>; activeJobs: number }>('/api/counts'),
  examples: () => request<{ examples: Examples }>('/api/examples'),
  saveExamples: (examples: Examples) =>
    request<{ examples: Examples }>('/api/examples', { method: 'PUT', body: JSON.stringify(examples) }),
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
