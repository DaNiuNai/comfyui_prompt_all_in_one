import { app } from '@comfyui/app'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import './App.css'
import { AiPanel } from './components/AiPanel'
import { CollectionPanel } from './components/CollectionPanel'
import { GroupLibrary } from './components/GroupLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { TagEditor } from './components/TagEditor'
import {
  BootstrapData,
  CollectionKind,
  Polarity,
  PromptDocument,
  PromptNode,
  PromptRecord,
  Settings
} from './types'
import { promptApi } from './utils/api'
import i18n from './utils/i18n'
import {
  createTag,
  documentFromPrompt,
  formatDocument,
  isPromptDocument,
  serializeDocument
} from './utils/prompt'

type Tab = 'editor' | 'words' | 'history' | 'favorites' | 'ai' | 'settings'

interface Props {
  initialNode: PromptNode | null
}

function polarityForNode(node: PromptNode | null): Polarity | null {
  if (node?.type === 'PromptAllInOne_Positive') return 'positive'
  if (node?.type === 'PromptAllInOne_Negative') return 'negative'
  return null
}

function promptWidgetValue(node: PromptNode | null): string {
  const value = node?.widgets?.find((widget) => widget.name === 'prompt')?.value
  return typeof value === 'string' ? value : ''
}

function documentForNode(
  node: PromptNode | null,
  forcePrompt = false
): PromptDocument {
  const stored = node?.properties?.promptAllInOneDocument
  if (!forcePrompt && isPromptDocument(stored)) return stored
  return documentFromPrompt(promptWidgetValue(node))
}

function App({ initialNode }: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<BootstrapData | null>(null)
  const [node, setNode] = useState<PromptNode | null>(initialNode)
  const [document, setDocument] = useState<PromptDocument>(() =>
    documentForNode(initialNode)
  )
  const [tab, setTab] = useState<Tab>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const documentRef = useRef(document)
  const nodeRef = useRef(node)
  const dataRef = useRef(data)
  const committed = useRef<Map<string | number, string>>(new Map())

  useEffect(() => {
    documentRef.current = document
    nodeRef.current = node
    dataRef.current = data
  }, [data, document, node])

  const notify = useCallback(
    (severity: 'success' | 'info' | 'warn' | 'error', detail: string) => {
      app.extensionManager.toast.add({
        severity,
        summary: t('app.title'),
        detail,
        life: severity === 'error' ? 6000 : 3000
      })
    },
    [t]
  )

  const reload = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const bootstrap = await promptApi.bootstrap()
      await i18n.changeLanguage(bootstrap.settings.language)
      setData(bootstrap)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const commitCurrent = useCallback(async () => {
    const currentNode = nodeRef.current
    const currentData = dataRef.current
    const polarity = polarityForNode(currentNode)
    if (!currentNode || !currentData || !polarity) return
    const prompt = serializeDocument(documentRef.current, currentData.settings)
    if (!prompt || committed.current.get(currentNode.id) === prompt) return
    committed.current.set(currentNode.id, prompt)
    try {
      const record = await promptApi.addRecord(
        'history',
        polarity,
        prompt,
        documentRef.current.tags.map((tag) => tag.text)
      )
      setData((current) =>
        current
          ? {
              ...current,
              collections: {
                ...current.collections,
                history: {
                  ...current.collections.history,
                  [polarity]: [
                    ...current.collections.history[polarity].filter(
                      (item) =>
                        item.id !== record.id && item.prompt !== record.prompt
                    ),
                    record
                  ].slice(-100)
                }
              }
            }
          : current
      )
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }
  }, [notify])

  useEffect(() => {
    const selectNode = (event: Event) => {
      const next = (event as CustomEvent<PromptNode | null>).detail
      if (nodeRef.current?.id !== next?.id) void commitCurrent()
      setNode(next)
      setDocument(documentForNode(next))
    }
    const updateNode = (event: Event) => {
      const next = (event as CustomEvent<PromptNode | null>).detail
      if (next?.id === nodeRef.current?.id)
        setDocument(documentForNode(next, true))
    }
    window.addEventListener('paio:node-selected', selectNode)
    window.addEventListener('paio:node-updated', updateNode)
    return () => {
      window.removeEventListener('paio:node-selected', selectNode)
      window.removeEventListener('paio:node-updated', updateNode)
    }
  }, [commitCurrent])

  const updateDocument = useCallback(
    (next: PromptDocument) => {
      setDocument(next)
      documentRef.current = next
      if (!node || !data) return
      const graph = app.graph as typeof app.graph & {
        beforeChange?: () => void
        afterChange?: () => void
      }
      graph.beforeChange?.()
      node.properties = {
        ...(node.properties ?? {}),
        promptAllInOneDocument: next
      }
      const widget = node.widgets?.find((item) => item.name === 'prompt')
      if (widget) widget.value = serializeDocument(next, data.settings)
      node.setDirtyCanvas?.(true, true)
      app.graph.setDirtyCanvas(true, true)
      graph.afterChange?.()
    },
    [data, node]
  )

  const polarity = polarityForNode(node)

  const translateTags = async (ids: string[]) => {
    if (!data || !ids.length) return
    const tags = document.tags.filter((tag) => ids.includes(tag.id))
    setBusy(true)
    try {
      const response = await promptApi.translate(
        tags.map((tag) => tag.text),
        data.settings.translate_provider,
        data.settings.source_language,
        data.settings.target_language
      )
      const translated = new Map(
        tags.map((tag, index) => [tag.id, response.texts[index]])
      )
      updateDocument({
        version: 1,
        tags: document.tags.map((tag) => ({
          ...tag,
          translation: translated.get(tag.id) ?? tag.translation
        }))
      })
      notify('success', t('messages.translated'))
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const favoriteTags = async (ids: string[]) => {
    if (!data || !polarity || !ids.length) return
    const tags = document.tags.filter((tag) => ids.includes(tag.id))
    const prompt = tags.map((tag) => tag.text).join(data.settings.separator)
    try {
      const record = await promptApi.addRecord(
        'favorites',
        polarity,
        prompt,
        tags.map((tag) => tag.text)
      )
      setData((current) =>
        current
          ? {
              ...current,
              collections: {
                ...current.collections,
                favorites: {
                  ...current.collections.favorites,
                  [polarity]: [
                    ...current.collections.favorites[polarity],
                    record
                  ]
                }
              }
            }
          : current
      )
      notify('success', t('messages.favorited'))
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }
  }

  const useRecord = (record: PromptRecord) => {
    updateDocument(documentFromPrompt(record.prompt))
    setTab('editor')
  }

  const deleteRecord = async (kind: CollectionKind, record: PromptRecord) => {
    if (!polarity) return
    await promptApi.deleteRecord(kind, polarity, record.id)
    setData((current) =>
      current
        ? {
            ...current,
            collections: {
              ...current.collections,
              [kind]: {
                ...current.collections[kind],
                [polarity]: current.collections[kind][polarity].filter(
                  (item) => item.id !== record.id
                )
              }
            }
          }
        : current
    )
  }

  const saveSettings = async (updates: Partial<Settings>) => {
    const settings = await promptApi.saveSettings(updates)
    if (updates.language) {
      await i18n.changeLanguage(settings.language)
      await reload()
      return
    }
    setData((current) => (current ? { ...current, settings } : current))
    if (node) {
      const widget = node.widgets?.find((item) => item.name === 'prompt')
      if (widget)
        widget.value = serializeDocument(documentRef.current, settings)
      node.setDirtyCanvas?.(true, true)
    }
  }

  const saveCredentials = async (
    provider: string,
    config: Record<string, string>
  ) => {
    setBusy(true)
    try {
      const result = await promptApi.saveCredentials(provider, config)
      setData((current) =>
        current
          ? {
              ...current,
              credentials: {
                ...current.credentials,
                [provider]: { configured: true, values: result.values }
              }
            }
          : current
      )
      notify('success', t('messages.saved'))
    } finally {
      setBusy(false)
    }
  }

  const generate = async (request: string) => {
    setBusy(true)
    try {
      const response = await promptApi.generate([
        {
          role: 'system',
          content:
            'Create concise Stable Diffusion prompt tags. Return only a comma-separated prompt without commentary.'
        },
        { role: 'user', content: request }
      ])
      return response.content
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
      return ''
    } finally {
      setBusy(false)
    }
  }

  const tabs = useMemo<Array<[Tab, string]>>(
    () => [
      ['editor', t('tabs.editor')],
      ['words', t('tabs.words')],
      ['history', t('tabs.history')],
      ['favorites', t('tabs.favorites')],
      ['ai', t('tabs.ai')],
      ['settings', t('tabs.settings')]
    ],
    [t]
  )

  if (!data) {
    return <div className="paio-loading">{error || t('common.loading')}</div>
  }

  return (
    <main className="paio-app">
      <header className="paio-header">
        <div>
          <h2>{t('app.title')}</h2>
          <small>
            {node && polarity
              ? t(`node.${polarity}`, { title: node.title, id: node.id })
              : t('node.none')}
          </small>
        </div>
        <div className="paio-header-actions">
          <button
            title={t('common.format')}
            disabled={!polarity}
            onClick={() => updateDocument(formatDocument(document))}
          >
            ✨
          </button>
          <button
            title={t('common.copy')}
            disabled={!polarity}
            onClick={() => {
              const operation = navigator.clipboard.writeText(
                serializeDocument(document, data.settings)
              )
              void operation.then(() => notify('success', t('messages.copied')))
            }}
          >
            ⧉
          </button>
        </div>
      </header>

      <nav className="paio-tabs">
        {tabs.map(([key, label]) => (
          <button
            className={tab === key ? 'active' : ''}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="paio-content">
        {tab === 'editor' &&
          (polarity ? (
            <TagEditor
              document={document}
              settings={data.settings}
              models={data.models}
              busy={busy}
              onChange={updateDocument}
              onCommit={() => void commitCurrent()}
              onTranslate={translateTags}
              onFavorite={favoriteTags}
            />
          ) : (
            <div className="paio-empty prominent">{t('node.selectHint')}</div>
          ))}
        {tab === 'words' && (
          <GroupLibrary
            categories={data.group_tags}
            colors={data.settings.group_tag_colors}
            activeGroup={data.settings.active_group}
            onAdd={(text) => {
              updateDocument({
                version: 1,
                tags: [...document.tags, createTag(text)]
              })
              setTab('editor')
            }}
            onActiveChange={(categoryIndex, groupIndex) =>
              void saveSettings({
                active_group: {
                  ...data.settings.active_group,
                  categoryIndex,
                  groupIndex
                }
              })
            }
          />
        )}
        {tab === 'history' && (
          <CollectionPanel
            kind="history"
            records={polarity ? data.collections.history[polarity] : []}
            onUse={useRecord}
            onDelete={(record) => deleteRecord('history', record)}
          />
        )}
        {tab === 'favorites' && (
          <CollectionPanel
            kind="favorites"
            records={polarity ? data.collections.favorites[polarity] : []}
            onUse={useRecord}
            onDelete={(record) => deleteRecord('favorites', record)}
          />
        )}
        {tab === 'ai' && (
          <AiPanel
            busy={busy}
            onGenerate={generate}
            onUse={(prompt) => {
              updateDocument({
                version: 1,
                tags: [...document.tags, ...documentFromPrompt(prompt).tags]
              })
              setTab('editor')
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsPanel
            settings={data.settings}
            providers={data.providers}
            credentials={data.credentials}
            busy={busy}
            onSaveSettings={saveSettings}
            onSaveCredentials={saveCredentials}
            onImport={promptApi.importLegacy}
            onReload={reload}
          />
        )}
      </div>
    </main>
  )
}

export default App
