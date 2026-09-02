import { PromptDocument, PromptTag, Settings } from '../types'

const NORMALIZED_SEPARATORS = /[，。、；．]/g
const BRACKETS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>'
}

let nextTagId = 0

const CHINESE_CHARACTER_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u

export function containsChineseText(text: string): boolean {
  return CHINESE_CHARACTER_PATTERN.test(text)
}

interface PromptPart {
  text: string
  lineBreakBefore: boolean
}

export function createTag(text: string, lineBreakBefore = false): PromptTag {
  nextTagId += 1
  const tag: PromptTag = {
    id: `tag-${Date.now()}-${nextTagId}`,
    text: text.trim(),
    enabled: true
  }
  if (lineBreakBefore) tag.lineBreakBefore = true
  return tag
}

function promptParts(input: string): PromptPart[] {
  const source = input
    .replace(NORMALIZED_SEPARATORS, ',')
    .replace(/\t|\r/g, '\n')
    .replace(/\n+/g, '\n')
  const result: PromptPart[] = []
  const stack: string[] = []
  let buffer = ''
  let escaped = false
  let lineBreakBeforeNext = false

  const flush = () => {
    const value = buffer.trim()
    if (value) {
      result.push({
        text: value,
        lineBreakBefore: result.length > 0 && lineBreakBeforeNext
      })
      lineBreakBeforeNext = false
    }
    buffer = ''
  }

  for (const character of source) {
    if (escaped) {
      buffer += character
      escaped = false
      continue
    }
    if (character === '\\') {
      buffer += character
      escaped = true
      continue
    }
    if (BRACKETS[character]) {
      stack.push(BRACKETS[character])
      buffer += character
      continue
    }
    if (stack[stack.length - 1] === character) {
      stack.pop()
      buffer += character
      continue
    }
    if ((character === ',' || character === '\n') && stack.length === 0) {
      flush()
      if (character === '\n' && result.length > 0) lineBreakBeforeNext = true
      continue
    }
    buffer += character
  }
  flush()
  return result
}

export function splitPrompt(input: string): string[] {
  return promptParts(input).map((part) => part.text)
}

export function documentFromPrompt(prompt: string): PromptDocument {
  return {
    version: 1,
    tags: promptParts(prompt).map((part) =>
      createTag(part.text, part.lineBreakBefore)
    )
  }
}

export function isPromptDocument(value: unknown): value is PromptDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PromptDocument>
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every(
      (tag) =>
        tag &&
        typeof tag.id === 'string' &&
        typeof tag.text === 'string' &&
        typeof tag.enabled === 'boolean' &&
        (tag.lineBreakBefore === undefined ||
          typeof tag.lineBreakBefore === 'boolean')
    )
  )
}

export function serializeDocument(
  document: PromptDocument,
  settings: Settings
): string {
  const blacklist = new Set(
    settings.blacklist.map((item) => item.trim().toLowerCase())
  )
  const separator = settings.auto_remove_space
    ? settings.separator.trimEnd() + ' '
    : settings.separator
  let prompt = ''
  let pendingLineBreak = false

  document.tags.forEach((tag) => {
    if (tag.lineBreakBefore) pendingLineBreak = true
    const value = tag.text.trim()
    if (
      !tag.enabled ||
      !value ||
      blacklist.has(unwrapWeight(value).toLowerCase())
    )
      return
    if (prompt) prompt += pendingLineBreak ? '\n' : separator
    prompt += value
    pendingLineBreak = false
  })

  return prompt && settings.trailing_comma ? `${prompt.trimEnd()},` : prompt
}

export function replaceTranslatedTags(
  document: PromptDocument,
  translations: ReadonlyMap<string, string>,
  preserveCase = false
): PromptDocument {
  return {
    version: 1,
    tags: document.tags.map((tag) => {
      const translated = translations.get(tag.id)
      if (translated === undefined || !translated.trim()) return tag
      const translatedText = preserveCase
        ? translated
        : translated.toLowerCase()
      return {
        ...tag,
        text: translatedText,
        translation: translatedText === tag.text ? undefined : tag.text
      }
    })
  }
}

export function reconcilePromptDocument(
  stored: unknown,
  prompt: string,
  settings: Settings
): PromptDocument {
  if (
    isPromptDocument(stored) &&
    serializeDocument(stored, settings) === prompt
  )
    return stored
  return documentFromPrompt(prompt)
}

export function filterTagsPreservingLineBreaks(
  tags: PromptTag[],
  keep: (tag: PromptTag, index: number) => boolean
): PromptTag[] {
  const result: PromptTag[] = []
  let pendingLineBreak = false

  tags.forEach((tag, index) => {
    if (tag.lineBreakBefore) pendingLineBreak = true
    if (!keep(tag, index)) return

    const next = { ...tag }
    if (result.length > 0 && pendingLineBreak) next.lineBreakBefore = true
    else delete next.lineBreakBefore
    result.push(next)
    pendingLineBreak = false
  })

  return result
}

export function formatDocument(document: PromptDocument): PromptDocument {
  const seen = new Set<string>()
  const formatted = document.tags.map((tag) => ({
    ...tag,
    text: tag.text.trim().replace(/\s+/g, ' ')
  }))
  return {
    version: 1,
    tags: filterTagsPreservingLineBreaks(formatted, (tag) => {
      const key = tag.text.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}

export function adjustWeight(text: string, delta: number): string {
  const match = /^\((.*):(-?\d+(?:\.\d+)?)\)$/.exec(text.trim())
  if (match) {
    const weight = Math.max(0, Number.parseFloat(match[2]) + delta)
    return `(${match[1]}:${weight.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')})`
  }
  return `(${text.trim()}:${(1 + delta).toFixed(1)})`
}

export function wrapTag(text: string, wrapper: '()' | '[]' | '{}'): string {
  const [start, end] = wrapper
  return `${start}${text.trim()}${end}`
}

export function unwrapWeight(text: string): string {
  const trimmed = text.trim()
  const weighted = /^\((.*):(-?\d+(?:\.\d+)?)\)$/.exec(trimmed)
  if (weighted) return weighted[1].trim()
  if (
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function normalizedModelNames(names: string[]): Set<string> {
  return new Set(
    names.flatMap((name) => {
      const normalized = name.replace(/\\/g, '/').toLowerCase()
      const parts = normalized.split('/')
      const basename = parts[parts.length - 1] ?? normalized
      const withoutExtension = basename.replace(
        /\.(safetensors|ckpt|pt|bin)$/i,
        ''
      )
      const pathWithoutExtension = normalized.replace(
        /\.(safetensors|ckpt|pt|bin)$/i,
        ''
      )
      return [normalized, basename, withoutExtension, pathWithoutExtension]
    })
  )
}

export function modelReferenceState(
  text: string,
  models: Record<'checkpoints' | 'loras' | 'embeddings', string[]>
): 'found' | 'missing' | null {
  const lora = /<lora:([^:>]+)/i.exec(text)
  if (lora)
    return normalizedModelNames(models.loras).has(lora[1].toLowerCase())
      ? 'found'
      : 'missing'
  const embedding = /(?:embedding:)?([\w./\\-]+)/i.exec(text)
  if (text.toLowerCase().startsWith('embedding:') && embedding) {
    return normalizedModelNames(models.embeddings).has(
      embedding[1].toLowerCase()
    )
      ? 'found'
      : 'missing'
  }
  const checkpoint = /^checkpoint:([\w./\\-]+)/i.exec(text)
  if (checkpoint) {
    return normalizedModelNames(models.checkpoints).has(
      checkpoint[1].toLowerCase()
    )
      ? 'found'
      : 'missing'
  }
  return null
}
