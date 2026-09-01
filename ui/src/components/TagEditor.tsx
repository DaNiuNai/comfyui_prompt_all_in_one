import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check,
  ClipboardCopy,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Heart,
  Languages,
  Minus,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'

import { HotkeyAction, PromptDocument, PromptTag, Settings } from '../types'
import {
  adjustWeight,
  documentFromPrompt,
  modelReferenceState,
  serializeDocument,
  wrapTag
} from '../utils/prompt'
import { rectanglesIntersect, reorderTags } from '../utils/tagInteraction'

interface Props {
  document: PromptDocument
  settings: Settings
  models: Record<'checkpoints' | 'loras' | 'embeddings', string[]>
  tagColors?: Record<string, string>
  busy: boolean
  rawExpanded: boolean
  onRawExpandedChange: (expanded: boolean) => void
  onChange: (document: PromptDocument) => void
  onCommit: () => void
  onTranslate: (ids: string[]) => Promise<void>
  onFavorite: (ids: string[]) => Promise<void>
}

interface ContextMenuState {
  id: string
  x: number
  y: number
}

interface SelectionStart {
  x: number
  y: number
  pointerId: number
  base: Set<string>
  moved: boolean
}

interface SelectionRectangle {
  left: number
  top: number
  width: number
  height: number
}

interface SortableTagProps {
  tag: PromptTag
  selected: boolean
  groupDragging: boolean
  modelState: 'found' | 'missing' | null
  color?: string
  settings: Settings
  editing: boolean
  onEditingChange: (editing: boolean) => void
  shouldSuppressClick: () => boolean
  onSelect: (event: ReactPointerEvent | React.MouseEvent) => void
  onGesture: (
    action: HotkeyAction,
    event: React.MouseEvent,
    immediate?: boolean
  ) => void
  onUpdate: (updates: Partial<PromptTag>) => void
  onAction: (
    action:
      | 'weight-down'
      | 'weight-up'
      | 'wrap-round'
      | 'wrap-square'
      | 'wrap-curly'
      | 'translate'
      | 'copy'
      | 'favorite'
      | 'toggle'
      | 'delete'
  ) => void
  onCommit: () => void
}

function SortableTag({
  tag,
  selected,
  groupDragging,
  modelState,
  color,
  settings,
  editing,
  onEditingChange,
  shouldSuppressClick,
  onSelect,
  onGesture,
  onUpdate,
  onAction,
  onCommit
}: SortableTagProps) {
  const { t } = useTranslation()
  const clickTimer = useRef<number | null>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: tag.id, disabled: editing })

  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
    },
    []
  )

  const runAction = (
    action: Parameters<SortableTagProps['onAction']>[0],
    event: React.MouseEvent
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onAction(action)
  }

  const classes = [
    'paio-tag',
    selected ? 'selected' : '',
    !tag.enabled ? 'disabled' : '',
    modelState ?? '',
    isDragging ? 'dragging' : '',
    groupDragging ? 'group-dragging' : '',
    settings.hotkeys.hover === 'extend' ? 'hover-actions' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      ref={setNodeRef}
      data-tag-id={tag.id}
      className={classes}
      style={
        {
          transform: CSS.Transform.toString(transform),
          transition,
          '--paio-tag-color': color
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="paio-tag-select"
        aria-label={t('common.select')}
        aria-pressed={selected}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onSelect}
      >
        {selected ? <Check /> : null}
      </button>
      <div className="paio-tag-main">
        {editing ? (
          <input
            className="paio-tag-input"
            value={tag.text}
            autoFocus
            onChange={(event) => onUpdate({ text: event.target.value })}
            onBlur={() => {
              onEditingChange(false)
              onCommit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onEditingChange(false)
                onCommit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onEditingChange(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="paio-tag-value"
            {...attributes}
            {...listeners}
            onClick={(event) => {
              if (shouldSuppressClick()) return
              if (event.ctrlKey || event.metaKey || event.shiftKey) {
                onSelect(event)
                return
              }
              if (clickTimer.current !== null)
                window.clearTimeout(clickTimer.current)
              clickTimer.current = window.setTimeout(() => {
                onGesture(settings.hotkeys.click, event)
                clickTimer.current = null
              }, 220)
            }}
            onDoubleClick={(event) => {
              if (clickTimer.current !== null) {
                window.clearTimeout(clickTimer.current)
                clickTimer.current = null
              }
              onGesture(settings.hotkeys.double_click, event, true)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              if (clickTimer.current !== null) {
                window.clearTimeout(clickTimer.current)
                clickTimer.current = null
              }
              onGesture(settings.hotkeys.right_click, event, true)
            }}
          >
            <GripVertical className="paio-grip" />
            <span>{tag.text}</span>
          </button>
        )}
        {tag.translation && !editing && (
          <button
            type="button"
            className="paio-translation"
            title={t('editor.useTranslation')}
            onClick={(event) => {
              event.stopPropagation()
              onUpdate({ text: tag.translation ?? tag.text })
            }}
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
      <div className="paio-tag-actions" aria-label={t('editor.tagTools')}>
        <button
          type="button"
          title={t('editor.weightDown')}
          aria-label={t('editor.weightDown')}
          onClick={(event) => runAction('weight-down', event)}
        >
          <Minus />
        </button>
        <button
          type="button"
          title={t('editor.weightUp')}
          aria-label={t('editor.weightUp')}
          onClick={(event) => runAction('weight-up', event)}
        >
          <Plus />
        </button>
        {(
          [
            ['wrap-round', '()'],
            ['wrap-square', '[]'],
            ['wrap-curly', '{}']
          ] as const
        ).map(([action, label]) => (
          <button
            type="button"
            key={action}
            title={t('editor.wrap', { wrapper: label })}
            aria-label={t('editor.wrap', { wrapper: label })}
            onClick={(event) => runAction(action, event)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          title={t('common.translate')}
          aria-label={t('common.translate')}
          onClick={(event) => runAction('translate', event)}
        >
          <Languages />
        </button>
        <button
          type="button"
          title={t('common.copy')}
          aria-label={t('common.copy')}
          onClick={(event) => runAction('copy', event)}
        >
          <ClipboardCopy />
        </button>
        <button
          type="button"
          title={t('common.favorite')}
          aria-label={t('common.favorite')}
          onClick={(event) => runAction('favorite', event)}
        >
          <Heart />
        </button>
        <button
          type="button"
          title={tag.enabled ? t('common.disable') : t('common.enable')}
          aria-label={tag.enabled ? t('common.disable') : t('common.enable')}
          onClick={(event) => runAction('toggle', event)}
        >
          {tag.enabled ? <EyeOff /> : <Eye />}
        </button>
        <button
          type="button"
          className="danger"
          title={t('common.delete')}
          aria-label={t('common.delete')}
          onClick={(event) => runAction('delete', event)}
        >
          <Trash2 />
        </button>
      </div>
    </article>
  )
}

export function TagEditor({
  document,
  settings,
  models,
  tagColors = {},
  busy,
  rawExpanded,
  onRawExpandedChange,
  onChange,
  onCommit,
  onTranslate,
  onFavorite
}: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [selectionRectangle, setSelectionRectangle] =
    useState<SelectionRectangle | null>(null)
  const selectionStart = useRef<SelectionStart | null>(null)
  const suppressClicksUntil = useRef(0)
  const tagAreaRef = useRef<HTMLDivElement | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const prompt = useMemo(
    () => serializeDocument(document, settings),
    [document, settings]
  )

  useEffect(() => {
    const ids = new Set(document.tags.map((tag) => tag.id))
    setSelected((current) => new Set([...current].filter((id) => ids.has(id))))
    if (editingId && !ids.has(editingId)) setEditingId(null)
  }, [document.tags, editingId])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [contextMenu])

  const changeTags = (tags: PromptTag[]) => onChange({ version: 1, tags })

  const updateTag = (id: string, updates: Partial<PromptTag>) =>
    changeTags(
      document.tags.map((tag) => (tag.id === id ? { ...tag, ...updates } : tag))
    )

  const updateSelected = (updates: Partial<PromptTag>) =>
    changeTags(
      document.tags.map((tag) =>
        selected.has(tag.id) ? { ...tag, ...updates } : tag
      )
    )

  const addTag = () => {
    const additions = documentFromPrompt(newTag).tags
    if (!additions.length) return
    changeTags([...document.tags, ...additions])
    setNewTag('')
  }

  const removeIds = (ids: ReadonlySet<string>) => {
    if (!ids.size) return
    changeTags(document.tags.filter((tag) => !ids.has(tag.id)))
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))))
  }

  const toggleSelected = (id: string, range: boolean, additive: boolean) => {
    setSelected((current) => {
      if (range && lastSelected) {
        const from = document.tags.findIndex((tag) => tag.id === lastSelected)
        const to = document.tags.findIndex((tag) => tag.id === id)
        if (from >= 0 && to >= 0) {
          const next = additive ? new Set(current) : new Set<string>()
          document.tags
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .forEach((tag) => next.add(tag.id))
          return next
        }
      }
      const next = additive ? new Set(current) : new Set<string>()
      if (current.has(id) && additive) next.delete(id)
      else next.add(id)
      return next
    })
    setLastSelected(id)
  }

  const copyTags = (ids: ReadonlySet<string>) => {
    const value = document.tags
      .filter((tag) => ids.has(tag.id))
      .map((tag) => tag.text)
      .join(settings.separator)
    if (value) void navigator.clipboard.writeText(value)
  }

  const performTagAction = (
    id: string,
    action: Parameters<SortableTagProps['onAction']>[0]
  ) => {
    const tag = document.tags.find((item) => item.id === id)
    if (!tag) return
    if (action === 'weight-down')
      updateTag(id, { text: adjustWeight(tag.text, -0.1) })
    if (action === 'weight-up')
      updateTag(id, { text: adjustWeight(tag.text, 0.1) })
    if (action === 'wrap-round')
      updateTag(id, { text: wrapTag(tag.text, '()') })
    if (action === 'wrap-square')
      updateTag(id, { text: wrapTag(tag.text, '[]') })
    if (action === 'wrap-curly')
      updateTag(id, { text: wrapTag(tag.text, '{}') })
    if (action === 'translate') void onTranslate([id])
    if (action === 'copy') copyTags(new Set([id]))
    if (action === 'favorite') void onFavorite([id])
    if (action === 'toggle') updateTag(id, { enabled: !tag.enabled })
    if (action === 'delete') removeIds(new Set([id]))
  }

  const runGesture = (
    action: HotkeyAction,
    id: string,
    event: React.MouseEvent
  ) => {
    if (action === 'edit') setEditingId(id)
    if (action === 'disable') performTagAction(id, 'toggle')
    if (action === 'extend')
      setContextMenu({
        id,
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 160)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 190))
      })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    suppressClicksUntil.current = Date.now() + 200
    setDraggingId(null)
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return
    const tags = reorderTags(document.tags, activeId, overId, selected)
    if (tags !== document.tags) changeTags(tags)
  }

  const handleEditorKey = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      onCommit()
      return
    }
    if (isInput) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelected(new Set(document.tags.map((tag) => tag.id)))
    }
    if (event.key === 'Escape') {
      setSelected(new Set())
      setContextMenu(null)
    }
    if (event.key === 'Delete' && selected.size) {
      event.preventDefault()
      removeIds(selected)
    }
  }

  const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-tag-id], button, input, textarea')) return
    const base =
      event.ctrlKey || event.metaKey ? new Set(selected) : new Set<string>()
    if (!event.ctrlKey && !event.metaKey) setSelected(new Set())
    selectionStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      base,
      moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
  }

  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = selectionStart.current
    const container = tagAreaRef.current
    if (!start || !container || start.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return
    start.moved = true
    const selection = {
      left: Math.min(start.x, event.clientX),
      top: Math.min(start.y, event.clientY),
      right: Math.max(start.x, event.clientX),
      bottom: Math.max(start.y, event.clientY)
    }
    const containerRect = container.getBoundingClientRect()
    setSelectionRectangle({
      left: selection.left - containerRect.left + container.scrollLeft,
      top: selection.top - containerRect.top + container.scrollTop,
      width: selection.right - selection.left,
      height: selection.bottom - selection.top
    })
    const next = new Set(start.base)
    container
      .querySelectorAll<HTMLElement>('[data-tag-id]')
      .forEach((element) => {
        const rect = element.getBoundingClientRect()
        if (rectanglesIntersect(selection, rect)) {
          const id = element.dataset.tagId
          if (id) next.add(id)
        }
      })
    setSelected(next)
  }

  const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = selectionStart.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    selectionStart.current = null
    setSelectionRectangle(null)
  }

  const selectionIds = [...selected]

  return (
    <section className="paio-editor" onKeyDown={handleEditorKey}>
      <button
        type="button"
        className="paio-section-heading"
        onClick={() => onRawExpandedChange(!rawExpanded)}
        aria-expanded={rawExpanded}
      >
        <FileText />
        <span>{t('editor.rawPrompt')}</span>
      </button>
      {rawExpanded && (
        <textarea
          className="paio-raw-prompt"
          value={prompt}
          rows={4}
          onChange={(event) => onChange(documentFromPrompt(event.target.value))}
          onBlur={onCommit}
          placeholder={t('editor.placeholder')}
        />
      )}

      <div className="paio-add-row">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              addTag()
            }
          }}
          placeholder={t('editor.addPlaceholder')}
        />
        <button type="button" onClick={addTag}>
          <Plus />
          <span>{t('common.add')}</span>
        </button>
      </div>

      {selected.size > 0 && (
        <div
          className="paio-selection-toolbar"
          aria-label={t('editor.batchTools')}
        >
          <strong>{t('editor.selectedCount', { count: selected.size })}</strong>
          <button type="button" onClick={() => copyTags(selected)}>
            <ClipboardCopy />
            <span>{t('common.copy')}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onTranslate(selectionIds)}
          >
            <Languages />
            <span>{t('common.translate')}</span>
          </button>
          <button type="button" onClick={() => void onFavorite(selectionIds)}>
            <Heart />
            <span>{t('common.favorite')}</span>
          </button>
          <button
            type="button"
            onClick={() => updateSelected({ enabled: false })}
          >
            <EyeOff />
            <span>{t('common.disable')}</span>
          </button>
          <button
            type="button"
            onClick={() => updateSelected({ enabled: true })}
          >
            <Eye />
            <span>{t('common.enable')}</span>
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => removeIds(selected)}
          >
            <Trash2 />
            <span>{t('common.delete')}</span>
          </button>
          <button
            type="button"
            aria-label={t('common.clearSelection')}
            title={t('common.clearSelection')}
            onClick={() => setSelected(new Set())}
          >
            <X />
          </button>
        </div>
      )}

      <div
        ref={tagAreaRef}
        className={`paio-tag-area ${selectionRectangle ? 'selecting' : ''}`}
        tabIndex={0}
        onPointerDown={beginMarquee}
        onPointerMove={moveMarquee}
        onPointerUp={endMarquee}
        onPointerCancel={endMarquee}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setDraggingId(String(event.active.id))}
          onDragCancel={() => {
            suppressClicksUntil.current = Date.now() + 200
            setDraggingId(null)
          }}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={document.tags.map((tag) => tag.id)}
            strategy={rectSortingStrategy}
          >
            <div className="paio-tag-list">
              {document.tags.length ? (
                document.tags.map((tag) => (
                  <SortableTag
                    key={tag.id}
                    tag={tag}
                    selected={selected.has(tag.id)}
                    groupDragging={
                      !!draggingId &&
                      selected.has(draggingId) &&
                      selected.has(tag.id)
                    }
                    modelState={modelReferenceState(tag.text, models)}
                    color={tagColors[tag.text]}
                    settings={settings}
                    editing={editingId === tag.id}
                    onEditingChange={(editing) =>
                      setEditingId(editing ? tag.id : null)
                    }
                    shouldSuppressClick={() =>
                      Date.now() < suppressClicksUntil.current
                    }
                    onSelect={(event) =>
                      toggleSelected(
                        tag.id,
                        event.shiftKey,
                        event.ctrlKey || event.metaKey
                      )
                    }
                    onGesture={(action, event) =>
                      runGesture(action, tag.id, event)
                    }
                    onUpdate={(updates) => updateTag(tag.id, updates)}
                    onAction={(action) => performTagAction(tag.id, action)}
                    onCommit={onCommit}
                  />
                ))
              ) : (
                <div className="paio-empty">{t('editor.empty')}</div>
              )}
            </div>
          </SortableContext>
        </DndContext>
        {selectionRectangle && (
          <div
            className="paio-marquee"
            style={selectionRectangle}
            aria-hidden="true"
          />
        )}
      </div>

      {contextMenu && (
        <div
          className="paio-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setEditingId(contextMenu.id)
              setContextMenu(null)
            }}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              performTagAction(contextMenu.id, 'toggle')
              setContextMenu(null)
            }}
          >
            {t('common.enableDisable')}
          </button>
          <button
            type="button"
            onClick={() => {
              performTagAction(contextMenu.id, 'translate')
              setContextMenu(null)
            }}
          >
            {t('common.translate')}
          </button>
          <button
            type="button"
            onClick={() => {
              performTagAction(contextMenu.id, 'favorite')
              setContextMenu(null)
            }}
          >
            {t('common.favorite')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              performTagAction(contextMenu.id, 'delete')
              setContextMenu(null)
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      )}

      <footer className="paio-counts">
        {t('editor.counts', {
          tags: document.tags.length,
          characters: prompt.length
        })}
      </footer>
    </section>
  )
}
