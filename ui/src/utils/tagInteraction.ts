import { PromptTag } from '../types'

export function reorderTags(
  tags: PromptTag[],
  activeId: string,
  overId: string,
  selected: ReadonlySet<string>
): PromptTag[] {
  if (activeId === overId) return tags
  const movingIds = selected.has(activeId)
    ? selected
    : new Set<string>([activeId])
  if (movingIds.has(overId)) return tags

  const activeIndex = tags.findIndex((tag) => tag.id === activeId)
  const overIndex = tags.findIndex((tag) => tag.id === overId)
  if (activeIndex < 0 || overIndex < 0) return tags

  const moving = tags.filter((tag) => movingIds.has(tag.id))
  const remaining = tags.filter((tag) => !movingIds.has(tag.id))
  const targetIndex = remaining.findIndex((tag) => tag.id === overId)
  if (targetIndex < 0) return tags
  const insertionIndex = activeIndex < overIndex ? targetIndex + 1 : targetIndex
  const next = [...remaining]
  next.splice(insertionIndex, 0, ...moving)
  return next
}

export interface Rectangle {
  left: number
  top: number
  right: number
  bottom: number
}

export function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return !(
    a.right < b.left ||
    a.bottom < b.top ||
    a.left > b.right ||
    a.top > b.bottom
  )
}
