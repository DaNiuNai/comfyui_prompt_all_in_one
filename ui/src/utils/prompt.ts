import { PromptDocument, PromptTag, Settings } from '../types'

const NORMALIZED_SEPARATORS = /[，。、；．]/g
const BRACKETS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>'
}

let nextTagId = 0

export function createTag(text: string): PromptTag {
  nextTagId += 1
  return {
    id: `tag-${Date.now()}-${nextTagId}`,
    text: text.trim(),
    enabled: true
  }
}

export function splitPrompt(input: string): string[] {
  const source = input
    .replace(NORMALIZED_SEPARATORS, ',')
    .replace(/\t|\r/g, '\n')
    .replace(/\n+/g, '\n')
  const result: string[] = []
  const stack: string[] = []
  let buffer = ''
  let escaped = false

  const flush = () => {
    const value = buffer.trim()
    if (value) result.push(value)
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
      if (character === '\n' && result[result.length - 1] !== 'BREAK')
        result.push('BREAK')
      continue
    }
    buffer += character
  }
  flush()
  return result.filter(
    (value, index) => value !== 'BREAK' || result[index - 1] !== 'BREAK'
  )
}

export function documentFromPrompt(prompt: string): PromptDocument {
  return { version: 1, tags: splitPrompt(prompt).map(createTag) }
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
        typeof tag.enabled === 'boolean'
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
  const values = document.tags
    .filter((tag) => tag.enabled && tag.text.trim())
    .map((tag) => tag.text.trim())
    .filter((tag) => !blacklist.has(unwrapWeight(tag).toLowerCase()))
  const separator = settings.auto_remove_space
    ? settings.separator.trimEnd() + ' '
    : settings.separator
  const prompt = values.join(separator)
  return prompt && settings.trailing_comma ? `${prompt.trimEnd()},` : prompt
}

export function formatDocument(document: PromptDocument): PromptDocument {
  const seen = new Set<string>()
  return {
    version: 1,
    tags: document.tags
      .map((tag) => ({ ...tag, text: tag.text.trim().replace(/\s+/g, ' ') }))
      .filter((tag) => {
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
