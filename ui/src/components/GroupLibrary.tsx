import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupTagCategory } from '../types'
import { isGroupTagGroup } from '../utils/groupTags'

interface Props {
  categories: GroupTagCategory[]
  colors: Record<string, string>
  activeGroup: Record<string, unknown>
  selectedTexts: ReadonlySet<string>
  onToggle: (english: string) => void
  onActiveChange: (categoryIndex: number, groupIndex: number) => void
}

export function GroupLibrary({
  categories,
  colors,
  activeGroup,
  selectedTexts,
  onToggle,
  onActiveChange
}: Props) {
  const { t } = useTranslation()
  const [categoryIndex, setCategoryIndex] = useState(
    typeof activeGroup.categoryIndex === 'number'
      ? activeGroup.categoryIndex
      : 0
  )
  const [groupIndex, setGroupIndex] = useState(
    typeof activeGroup.groupIndex === 'number' ? activeGroup.groupIndex : 0
  )
  const [search, setSearch] = useState('')
  const category = categories[categoryIndex]
  const selectableGroups = useMemo(
    () =>
      (category?.groups ?? []).flatMap((entry, index) =>
        isGroupTagGroup(entry) ? [{ group: entry, index }] : []
      ),
    [category]
  )
  const selectedGroup =
    selectableGroups.find((entry) => entry.index === groupIndex) ??
    selectableGroups[0]
  const group = selectedGroup?.group
  const tags = useMemo(() => {
    if (!group) return []
    const query = search.trim().toLowerCase()
    return Object.entries(group.tags)
      .filter(([english, local]) =>
        query ? `${english} ${local ?? ''}`.toLowerCase().includes(query) : true
      )
      .slice(0, 400)
  }, [group, search])

  return (
    <section className="paio-library">
      <input
        className="paio-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('library.search')}
      />
      <div className="paio-chip-row">
        {categories.map((item, index) => (
          <button
            className={index === categoryIndex ? 'active' : ''}
            key={`${item.name}-${index}`}
            onClick={() => {
              const nextGroupIndex = Math.max(
                0,
                item.groups.findIndex(isGroupTagGroup)
              )
              setCategoryIndex(index)
              setGroupIndex(nextGroupIndex)
              onActiveChange(index, nextGroupIndex)
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="paio-chip-row secondary">
        {category?.groups.map((item, index) => {
          if (!isGroupTagGroup(item)) return null
          return (
            <button
              className={index === selectedGroup?.index ? 'active' : ''}
              key={`${item.name}-${index}`}
              onClick={() => {
                setGroupIndex(index)
                onActiveChange(categoryIndex, index)
              }}
            >
              {item.name}
            </button>
          )
        })}
      </div>
      <div className="paio-word-grid">
        {tags.map(([english, local]) => (
          <button
            key={english}
            className={selectedTexts.has(english) ? 'active' : ''}
            aria-pressed={selectedTexts.has(english)}
            onClick={() => onToggle(english)}
            style={{
              borderColor: group?.color || undefined,
              backgroundColor:
                colors[`${category?.name}||${group?.name}`] || undefined
            }}
          >
            <span>{english}</span>
            {local && <small>{local}</small>}
          </button>
        ))}
      </div>
      {tags.length === 400 && (
        <p className="paio-hint">{t('library.resultLimit')}</p>
      )}
    </section>
  )
}
