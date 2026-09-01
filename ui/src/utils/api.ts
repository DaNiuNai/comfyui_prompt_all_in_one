import { api } from '@comfyui/api'

import {
  BootstrapData,
  CollectionKind,
  Polarity,
  PromptRecord,
  Settings
} from '../types'

const PREFIX = '/prompt_all_in_one/v1'

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: { message?: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  const response = await api.fetchApi(`${PREFIX}${path}`, { ...init, headers })
  const payload = (await response.json()) as ApiEnvelope<T>
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.error?.message || `Request failed (${response.status})`
    )
  }
  return payload.data
}

export const promptApi = {
  bootstrap: () => request<BootstrapData>('/bootstrap'),
  saveSettings: (settings: Partial<Settings>) =>
    request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    }),
  saveCredentials: (provider: string, config: Record<string, string>) =>
    request<{ provider: string; values: Record<string, string> }>(
      `/credentials/${encodeURIComponent(provider)}`,
      { method: 'PUT', body: JSON.stringify({ config }) }
    ),
  addRecord: (
    kind: CollectionKind,
    polarity: Polarity,
    prompt: string,
    tags: string[],
    name = ''
  ) =>
    request<PromptRecord>(`/collections/${kind}/${polarity}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, tags, name })
    }),
  deleteRecord: (kind: CollectionKind, polarity: Polarity, id: string) =>
    request<{ deleted: boolean }>(
      `/collections/${kind}/${polarity}/${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      }
    ),
  translate: (
    texts: string[],
    provider: string,
    fromLanguage: string,
    toLanguage: string
  ) =>
    request<{ texts: string[] }>('/translate', {
      method: 'POST',
      body: JSON.stringify({
        texts,
        provider,
        from_lang: fromLanguage,
        to_lang: toLanguage
      })
    }),
  generate: (messages: Array<{ role: string; content: string }>) =>
    request<{ content: string }>('/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ messages })
    }),
  importLegacy: (files: File[], mode: 'preview' | 'commit') => {
    const body = new FormData()
    body.append('mode', mode)
    files.forEach((file) => body.append('files', file, file.name))
    return request<{
      accepted: number
      skipped: number
      invalid: number
      settings: number
    }>('/import', { method: 'POST', body })
  }
}
