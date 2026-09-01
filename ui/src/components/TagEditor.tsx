import { DragEvent, KeyboardEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PromptDocument, PromptTag, Settings } from '../types'
import {
  adjustWeight,
  documentFromPrompt,
  modelReferenceState,
  serializeDocument,
  wrapTag
} from '../utils/prompt'

interface Props {
  document: PromptDocument
  settings: Settings
  models: Record<'checkpoints' | 'loras' | 'embeddings', string[]>
  busy: boolean
  onChange: (document: PromptDocument) => void
  onCommit: () => void
  onTranslate: (ids: string[]) => Promise<void>
  onFavorite: (ids: string[]) => Promise<void>
}

export function TagEditor({
  document,
  settings,
  models,
  busy,
  onChange,
  onCommit,
  onTranslate,
  onFavorite
}: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newTag, setNewTag] = useState('')
  const [dragged, setDragged] = useState<string | null>(null)
  const prompt = useMemo(
    () => serializeDocument(document, settings),
    [document, settings]
  )

  const updateTags = (callback: (tag: PromptTag) => PromptTag) => {
    const ids = selected.size
      ? selected
      : new Set(document.tags.map((tag) => tag.id))
    onChange({
      version: 1,
      tags: document.tags.map((tag) => (ids.has(tag.id) ? callback(tag) : tag))
    })
  }

  const addTag = () => {
    const additions = documentFromPrompt(newTag).tags
    if (!additions.length) return
    onChange({ version: 1, tags: [...document.tags, ...additions] })
    setNewTag('')
  }

  const handleAddKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTag()
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const removeSelected = () => {
    if (!selected.size) return
    onChange({
      version: 1,
      tags: document.tags.filter((tag) => !selected.has(tag.id))
    })
    setSelected(new Set())
  }

  const handleEditorKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      onCommit()
      return
    }
    const target = event.target as HTMLElement
    if (
      event.key === 'Delete' &&
      selected.size &&
      !['INPUT', 'TEXTAREA'].includes(target.tagName)
    ) {
      event.preventDefault()
      removeSelected()
    }
  }

  const moveTag = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    if (!dragged || dragged === targetId) return
    const tags = [...document.tags]
    const sourceIndex = tags.findIndex((tag) => tag.id === dragged)
    const targetIndex = tags.findIndex((tag) => tag.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = tags.splice(sourceIndex, 1)
    tags.splice(targetIndex, 0, source)
    onChange({ version: 1, tags })
    setDragged(null)
  }

  return (
    <section className="paio-editor" onKeyDown={handleEditorKey}>
      <label className="paio-field">
        <span>{t('editor.rawPrompt')}</span>
        <textarea
          value={prompt}
          rows={4}
          onChange={(event) => onChange(documentFromPrompt(event.target.value))}
          onBlur={onCommit}
          placeholder={t('editor.placeholder')}
        />
      </label>

      <div className="paio-add-row">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={handleAddKey}
          placeholder={t('editor.addPlaceholder')}
        />
        <button onClick={addTag}>{t('common.add')}</button>
      </div>

      <div className="paio-toolbar" aria-label={t('editor.batchTools')}>
        <button
          onClick={() =>
            setSelected(
              selected.size === document.tags.length
                ? new Set()
                : new Set(document.tags.map((tag) => tag.id))
            )
          }
        >
          {t('common.selectAll')}
        </button>
        <button
          onClick={() => updateTags((tag) => ({ ...tag, enabled: true }))}
        >
          {t('common.enable')}
        </button>
        <button
          onClick={() => updateTags((tag) => ({ ...tag, enabled: false }))}
        >
          {t('common.disable')}
        </button>
        <button
          onClick={() => void onTranslate([...selected])}
          disabled={busy || !selected.size}
        >
          {t('common.translate')}
        </button>
        <button
          onClick={() => void onFavorite([...selected])}
          disabled={!selected.size}
        >
          {t('common.favorite')}
        </button>
        <button
          className="danger"
          onClick={removeSelected}
          disabled={!selected.size}
        >
          {t('common.delete')}
        </button>
      </div>

      <div className="paio-tag-list">
        {document.tags.length ? (
          document.tags.map((tag) => {
            const modelState = modelReferenceState(tag.text, models)
            return (
              <article
                key={tag.id}
                className={`paio-tag ${selected.has(tag.id) ? 'selected' : ''} ${!tag.enabled ? 'disabled' : ''} ${modelState ?? ''}`}
                draggable
                onDragStart={() => setDragged(tag.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => moveTag(event, tag.id)}
                onDoubleClick={() => {
                  if (settings.hotkeys.double_click !== 'disable') return
                  onChange({
                    version: 1,
                    tags: document.tags.map((item) =>
                      item.id === tag.id
                        ? { ...item, enabled: !item.enabled }
                        : item
                    )
                  })
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(tag.id)}
                  onChange={() => toggleSelected(tag.id)}
                  aria-label={t('common.select')}
                />
                <div className="paio-tag-text">
                  <input
                    value={tag.text}
                    onChange={(event) =>
                      onChange({
                        version: 1,
                        tags: document.tags.map((item) =>
                          item.id === tag.id
                            ? { ...item, text: event.target.value }
                            : item
                        )
                      })
                    }
                    onBlur={onCommit}
                  />
                  {tag.translation && (
                    <button
                      className="paio-translation"
                      title={t('editor.useTranslation')}
                      onClick={() =>
                        onChange({
                          version: 1,
                          tags: document.tags.map((item) =>
                            item.id === tag.id
                              ? { ...item, text: tag.translation ?? item.text }
                              : item
                          )
                        })
                      }
                    >
                      {tag.translation}
                    </button>
                  )}
                  {modelState && (
                    <small className={`model-${modelState}`}>
                      {t(`models.${modelState}`)}
                    </small>
                  )}
                </div>
                <div className="paio-tag-actions">
                  <button
                    title={t('editor.weightDown')}
                    onClick={() =>
                      onChange({
                        version: 1,
                        tags: document.tags.map((item) =>
                          item.id === tag.id
                            ? { ...item, text: adjustWeight(item.text, -0.1) }
                            : item
                        )
                      })
                    }
                  >
                    −
                  </button>
                  <button
                    title={t('editor.weightUp')}
                    onClick={() =>
                      onChange({
                        version: 1,
                        tags: document.tags.map((item) =>
                          item.id === tag.id
                            ? { ...item, text: adjustWeight(item.text, 0.1) }
                            : item
                        )
                      })
                    }
                  >
                    +
                  </button>
                  {(['()', '[]', '{}'] as const).map((wrapper) => (
                    <button
                      key={wrapper}
                      title={t('editor.wrap', { wrapper })}
                      onClick={() =>
                        onChange({
                          version: 1,
                          tags: document.tags.map((item) =>
                            item.id === tag.id
                              ? { ...item, text: wrapTag(item.text, wrapper) }
                              : item
                          )
                        })
                      }
                    >
                      {wrapper}
                    </button>
                  ))}
                  <button
                    title={
                      tag.enabled ? t('common.disable') : t('common.enable')
                    }
                    onClick={() =>
                      onChange({
                        version: 1,
                        tags: document.tags.map((item) =>
                          item.id === tag.id
                            ? { ...item, enabled: !item.enabled }
                            : item
                        )
                      })
                    }
                  >
                    {tag.enabled ? '◉' : '○'}
                  </button>
                </div>
              </article>
            )
          })
        ) : (
          <div className="paio-empty">{t('editor.empty')}</div>
        )}
      </div>
      <footer className="paio-counts">
        {t('editor.counts', {
          tags: document.tags.length,
          characters: prompt.length
        })}
      </footer>
    </section>
  )
}
