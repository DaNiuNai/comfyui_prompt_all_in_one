import { app } from '@comfyui/app'
import {
  BookOpenText,
  BrainCircuit,
  ClipboardCopy,
  Clock3,
  Heart,
  Library,
  Settings as SettingsIcon,
  Sparkles,
  X
} from 'lucide-react'
import {
  ButtonHTMLAttributes,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'

import './App.css'
import { AiPanel } from './components/AiPanel'
import { CollectionPanel } from './components/CollectionPanel'
import { FloatingPanel } from './components/FloatingPanel'
import { GroupLibrary } from './components/GroupLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { TagEditor } from './components/TagEditor'
import './index.css'
import {
  BootstrapData,
  CollectionKind,
  Drawer,
  Polarity,
  PromptDocument,
  PromptNode,
  PromptRecord,
  Settings
} from './types'
import { promptApi } from './utils/api'
import i18n from './utils/i18n'
import { PanelState, loadPanelState, savePanelState } from './utils/panelState'
import {
  createTag,
  documentFromPrompt,
  formatDocument,
  isPromptDocument,
  serializeDocument
} from './utils/prompt'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  children: ReactNode
}

function IconButton({
  label,
  active = false,
  children,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`paio-icon-button ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
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

function App() {
  const { t } = useTranslation()
  const [data, setData] = useState<BootstrapData | null>(null)
  const [node, setNode] = useState<PromptNode | null>(null)
  const [document, setDocument] = useState<PromptDocument>(() =>
    documentForNode(null)
  )
  const [panel, setPanel] = useState<PanelState>(() =>
    loadPanelState(window.innerWidth, window.innerHeight)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const documentRef = useRef(document)
  const nodeRef = useRef(node)
  const dataRef = useRef(data)
  const panelRef = useRef(panel)
  const committed = useRef<Map<string | number, string>>(new Map())

  useEffect(() => {
    documentRef.current = document
    nodeRef.current = node
    dataRef.current = data
    panelRef.current = panel
  }, [data, document, node, panel])

  useEffect(() => {
    const timeout = window.setTimeout(() => savePanelState(panel), 120)
    return () => window.clearTimeout(timeout)
  }, [panel])

  const updatePanel = useCallback((next: PanelState) => {
    panelRef.current = next
    setPanel(next)
  }, [])

  const patchPanel = useCallback((updates: Partial<PanelState>) => {
    setPanel((current) => {
      const next = { ...current, ...updates }
      panelRef.current = next
      return next
    })
  }, [])

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
    const openNode = (event: Event) => {
      const next = (event as CustomEvent<PromptNode>).detail
      if (!next) return
      const current = nodeRef.current
      if (current?.id === next.id) {
        if (panelRef.current.visible) void commitCurrent()
        patchPanel({ visible: !panelRef.current.visible })
        return
      }
      if (current) void commitCurrent()
      setNode(next)
      nodeRef.current = next
      const nextDocument = documentForNode(next)
      setDocument(nextDocument)
      documentRef.current = nextDocument
      patchPanel({ visible: true })
    }
    const updateNode = (event: Event) => {
      const next = (event as CustomEvent<PromptNode | null>).detail
      if (next?.id !== nodeRef.current?.id) return
      const nextDocument = documentForNode(next, true)
      setDocument(nextDocument)
      documentRef.current = nextDocument
    }
    const removeNode = (event: Event) => {
      const removed = (event as CustomEvent<PromptNode | null>).detail
      if (removed?.id !== nodeRef.current?.id) return
      setNode(null)
      nodeRef.current = null
      const empty = documentForNode(null)
      setDocument(empty)
      documentRef.current = empty
    }
    window.addEventListener('paio:open-node', openNode)
    window.addEventListener('paio:node-updated', updateNode)
    window.addEventListener('paio:node-removed', removeNode)
    return () => {
      window.removeEventListener('paio:open-node', openNode)
      window.removeEventListener('paio:node-updated', updateNode)
      window.removeEventListener('paio:node-removed', removeNode)
    }
  }, [commitCurrent, patchPanel])

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
    patchPanel({ drawer: null })
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

  const toggleDrawer = (drawer: Drawer) =>
    patchPanel({ drawer: panel.drawer === drawer ? null : drawer })

  const selectedTexts = useMemo(
    () => new Set(document.tags.map((tag) => tag.text)),
    [document]
  )

  const tagColors = useMemo(() => {
    if (!data) return {}
    const result: Record<string, string> = {}
    data.group_tags.forEach((category) =>
      category.groups.forEach((group) => {
        const color =
          data.settings.group_tag_colors[`${category.name}||${group.name}`] ||
          group.color
        if (!color) return
        Object.keys(group.tags).forEach((tag) => {
          result[tag] = color
        })
      })
    )
    return result
  }, [data])

  const title = (
    <div className="paio-window-title">
      <strong>{t('app.title')}</strong>
      <span>
        {node && polarity
          ? t(`node.${polarity}`, { title: node.title, id: node.id })
          : t('node.none')}
      </span>
    </div>
  )

  const actions = (
    <>
      <IconButton
        label={t('common.format')}
        disabled={!polarity || !data}
        onClick={() => updateDocument(formatDocument(document))}
      >
        <Sparkles />
      </IconButton>
      <IconButton
        label={t('common.copy')}
        disabled={!polarity || !data}
        onClick={() => {
          if (!data) return
          void navigator.clipboard
            .writeText(serializeDocument(document, data.settings))
            .then(() => notify('success', t('messages.copied')))
        }}
      >
        <ClipboardCopy />
      </IconButton>
      <IconButton
        label={t('tabs.history')}
        active={panel.drawer === 'history'}
        onClick={() => toggleDrawer('history')}
      >
        <Clock3 />
      </IconButton>
      <IconButton
        label={t('tabs.favorites')}
        active={panel.drawer === 'favorites'}
        onClick={() => toggleDrawer('favorites')}
      >
        <Heart />
      </IconButton>
      <IconButton
        label={t('tabs.ai')}
        active={panel.drawer === 'ai'}
        onClick={() => toggleDrawer('ai')}
      >
        <BrainCircuit />
      </IconButton>
      <IconButton
        label={t('tabs.settings')}
        active={panel.drawer === 'settings'}
        onClick={() => toggleDrawer('settings')}
      >
        <SettingsIcon />
      </IconButton>
      <IconButton
        label={t('common.close')}
        onClick={() => {
          void commitCurrent()
          patchPanel({ visible: false })
        }}
      >
        <X />
      </IconButton>
    </>
  )

  const drawer = data && panel.drawer && (
    <aside className="paio-drawer" aria-label={t(`tabs.${panel.drawer}`)}>
      <div className="paio-drawer-header">
        <strong>{t(`tabs.${panel.drawer}`)}</strong>
        <IconButton
          label={t('common.close')}
          onClick={() => patchPanel({ drawer: null })}
        >
          <X />
        </IconButton>
      </div>
      <div className="paio-drawer-content">
        {panel.drawer === 'history' && (
          <CollectionPanel
            kind="history"
            records={polarity ? data.collections.history[polarity] : []}
            onUse={useRecord}
            onDelete={(record) => deleteRecord('history', record)}
          />
        )}
        {panel.drawer === 'favorites' && (
          <CollectionPanel
            kind="favorites"
            records={polarity ? data.collections.favorites[polarity] : []}
            onUse={useRecord}
            onDelete={(record) => deleteRecord('favorites', record)}
          />
        )}
        {panel.drawer === 'ai' && (
          <AiPanel
            busy={busy}
            onGenerate={generate}
            onUse={(prompt) => {
              updateDocument({
                version: 1,
                tags: [...document.tags, ...documentFromPrompt(prompt).tags]
              })
              patchPanel({ drawer: null })
            }}
          />
        )}
        {panel.drawer === 'settings' && (
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
    </aside>
  )

  return (
    <FloatingPanel
      state={panel}
      title={title}
      actions={actions}
      onStateChange={updatePanel}
    >
      <div className={`paio-workspace ${panel.drawer ? 'has-drawer' : ''}`}>
        <main className="paio-main-content">
          {!data ? (
            <div className="paio-loading">{error || t('common.loading')}</div>
          ) : polarity ? (
            <>
              <TagEditor
                document={document}
                settings={data.settings}
                models={data.models}
                tagColors={tagColors}
                busy={busy}
                rawExpanded={panel.rawExpanded}
                onRawExpandedChange={(rawExpanded) =>
                  patchPanel({ rawExpanded })
                }
                onChange={updateDocument}
                onCommit={() => void commitCurrent()}
                onTranslate={translateTags}
                onFavorite={favoriteTags}
              />
              <section className="paio-library-shell">
                <button
                  type="button"
                  className="paio-section-heading"
                  onClick={() =>
                    patchPanel({ libraryExpanded: !panel.libraryExpanded })
                  }
                  aria-expanded={panel.libraryExpanded}
                >
                  <Library />
                  <span>{t('tabs.words')}</span>
                </button>
                {panel.libraryExpanded && (
                  <GroupLibrary
                    categories={data.group_tags}
                    colors={data.settings.group_tag_colors}
                    activeGroup={data.settings.active_group}
                    selectedTexts={selectedTexts}
                    onToggle={(text) => {
                      const existing = document.tags.find(
                        (tag) => tag.text === text
                      )
                      updateDocument({
                        version: 1,
                        tags: existing
                          ? document.tags.filter(
                              (tag) => tag.id !== existing.id
                            )
                          : [...document.tags, createTag(text)]
                      })
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
              </section>
            </>
          ) : (
            <div className="paio-empty prominent">
              <BookOpenText />
              <strong>{t('node.selectHint')}</strong>
              <span>{t('node.lockHint')}</span>
            </div>
          )}
        </main>
        {drawer}
      </div>
    </FloatingPanel>
  )
}

export default App
