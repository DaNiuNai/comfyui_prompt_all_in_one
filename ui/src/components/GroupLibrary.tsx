import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupTagCategory } from '../types'

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
  const group = category?.groups[groupIndex]
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
              setCategoryIndex(index)
              setGroupIndex(0)
              onActiveChange(index, 0)
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="paio-chip-row secondary">
        {category?.groups.map((item, index) => (
          <button
            className={index === groupIndex ? 'active' : ''}
            key={`${item.name}-${index}`}
            onClick={() => {
              setGroupIndex(index)
              onActiveChange(categoryIndex, index)
            }}
          >
            {item.name}
          </button>
        ))}
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
