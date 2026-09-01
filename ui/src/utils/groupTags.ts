import { GroupTagGroup } from '../types'

export function isGroupTagGroup(value: unknown): value is GroupTagGroup {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<GroupTagGroup>
  return (
    typeof candidate.name === 'string' &&
    Boolean(candidate.tags) &&
    typeof candidate.tags === 'object' &&
    !Array.isArray(candidate.tags)
  )
}
