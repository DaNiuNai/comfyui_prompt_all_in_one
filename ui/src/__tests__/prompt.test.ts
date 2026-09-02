import { Settings } from '../types'
import {
  adjustWeight,
  containsChineseText,
  documentFromPrompt,
  filterTagsPreservingLineBreaks,
  formatDocument,
  isPromptDocument,
  modelReferenceState,
  reconcilePromptDocument,
  replaceTranslatedTags,
  serializeDocument,
  splitPrompt
} from '../utils/prompt'

const settings: Settings = {
  schema_version: 1,
  language: 'en',
  translate_provider: 'myMemory_free',
  source_language: 'zh_CN',
  target_language: 'en_US',
  preserve_translation_case: false,
  auto_translate_on_add: true,
  auto_remove_space: true,
  trailing_comma: false,
  separator: ', ',
  blacklist: [],
  group_tags_translate: true,
  group_tag_colors: {},
  active_group: {},
  hotkeys: {
    click: 'edit',
    double_click: 'disable',
    right_click: 'extend',
    hover: 'extend'
  }
}

describe('prompt parsing', () => {
  it('detects Chinese text for automatic translation', () => {
    expect(containsChineseText('女孩')).toBe(true)
    expect(containsChineseText('1男孩')).toBe(true)
    expect(containsChineseText('suit')).toBe(false)
  })

  it('preserves nested commas and LoRA syntax', () => {
    expect(
      splitPrompt(
        'masterpiece, (red dress, detailed fabric:1.2), <lora:style:0.8>, smile'
      )
    ).toEqual([
      'masterpiece',
      '(red dress, detailed fabric:1.2)',
      '<lora:style:0.8>',
      'smile'
    ])
  })

  it('normalizes localized punctuation and line breaks', () => {
    const input = '\n女孩，微笑\n\n夜景\n'
    const document = documentFromPrompt(input)

    expect(splitPrompt(input)).toEqual(['女孩', '微笑', '夜景'])
    expect(
      document.tags.map((tag) => [tag.text, tag.lineBreakBefore ?? false])
    ).toEqual([
      ['女孩', false],
      ['微笑', false],
      ['夜景', true]
    ])
    expect(serializeDocument(document, settings)).toBe('女孩, 微笑\n夜景')
  })

  it('keeps explicit BREAK text as an ordinary tag', () => {
    const document = documentFromPrompt('first, BREAK, second')

    expect(document.tags.map((tag) => tag.text)).toEqual([
      'first',
      'BREAK',
      'second'
    ])
    expect(serializeDocument(document, settings)).toBe('first, BREAK, second')
  })

  it('serializes enabled tags and applies the blacklist', () => {
    const document = documentFromPrompt('masterpiece, blurry, smile')
    document.tags[2].enabled = false
    expect(
      serializeDocument(document, { ...settings, blacklist: ['blurry'] })
    ).toBe('masterpiece')
  })

  it('keeps disabled tags when reconciling the serialized widget prompt', () => {
    const document = documentFromPrompt('first, second')
    document.tags[1].enabled = false

    const reconciled = reconcilePromptDocument(
      document,
      serializeDocument(document, settings),
      settings
    )

    expect(reconciled).toBe(document)
    expect(reconciled.tags).toHaveLength(2)
    expect(reconciled.tags[1].enabled).toBe(false)
  })

  it('rebuilds the document after an external widget prompt edit', () => {
    const document = documentFromPrompt('first, second')
    document.tags[1].enabled = false

    const reconciled = reconcilePromptDocument(document, 'third', settings)

    expect(reconciled).not.toBe(document)
    expect(reconciled.tags.map((tag) => tag.text)).toEqual(['third'])
    expect(reconciled.tags[0].enabled).toBe(true)
  })

  it('carries a filtered line boundary to the next enabled tag', () => {
    const document = documentFromPrompt('masterpiece\nblurry, smile')

    expect(
      serializeDocument(document, { ...settings, blacklist: ['blurry'] })
    ).toBe('masterpiece\nsmile')

    document.tags[1].enabled = false

    expect(serializeDocument(document, settings)).toBe('masterpiece\nsmile')
    expect(
      serializeDocument(document, { ...settings, blacklist: ['smile'] })
    ).toBe('masterpiece')
  })

  it('preserves a line boundary when its first tag is removed', () => {
    const document = documentFromPrompt('first\nsecond, third')
    const tags = filterTagsPreservingLineBreaks(
      document.tags,
      (tag) => tag.text !== 'second'
    )

    expect(serializeDocument({ version: 1, tags }, settings)).toBe(
      'first\nthird'
    )
  })

  it('formats whitespace and removes duplicate tags', () => {
    const document = documentFromPrompt('  red   dress, RED DRESS, smile ')
    expect(formatDocument(document).tags.map((tag) => tag.text)).toEqual([
      'red dress',
      'smile'
    ])

    const multiline = formatDocument(
      documentFromPrompt('portrait\n portrait, smile')
    )
    expect(serializeDocument(multiline, settings)).toBe('portrait\nsmile')
  })

  it('adjusts existing and new weights', () => {
    expect(adjustWeight('portrait', 0.1)).toBe('(portrait:1.1)')
    expect(adjustWeight('(portrait:1.2)', -0.1)).toBe('(portrait:1.1)')
  })

  it('accepts old documents and validates optional line metadata', () => {
    const legacy = {
      version: 1 as const,
      tags: [{ id: 'legacy', text: 'portrait', enabled: true }]
    }

    expect(isPromptDocument(legacy)).toBe(true)
    expect(serializeDocument(legacy, settings)).toBe('portrait')
    expect(
      isPromptDocument({
        ...legacy,
        tags: [{ ...legacy.tags[0], lineBreakBefore: 'invalid' }]
      })
    ).toBe(false)
  })

  it('replaces translated tag text and keeps the original as secondary text', () => {
    const document = documentFromPrompt('测试, second')

    const translated = replaceTranslatedTags(
      document,
      new Map([[document.tags[0].id, 'TEST Result']])
    )

    expect(serializeDocument(translated, settings)).toBe('test result, second')
    expect(translated.tags[0].translation).toBe('测试')
    expect(translated.tags[1]).toBe(document.tags[1])
  })

  it('preserves translated tag casing when requested', () => {
    const document = documentFromPrompt('测试')

    const translated = replaceTranslatedTags(
      document,
      new Map([[document.tags[0].id, 'TEST Result']]),
      true
    )

    expect(serializeDocument(translated, settings)).toBe('TEST Result')
    expect(translated.tags[0].translation).toBe('测试')
  })
})

describe('model reference detection', () => {
  const models = {
    checkpoints: ['sdxl/base.safetensors'],
    loras: ['styles/Cinematic.safetensors'],
    embeddings: ['EasyNegative.pt']
  }

  it('finds installed LoRAs by basename without extension', () => {
    expect(modelReferenceState('<lora:Cinematic:0.8>', models)).toBe('found')
  })

  it('marks missing resources without claiming to load them', () => {
    expect(modelReferenceState('<lora:unknown:1>', models)).toBe('missing')
    expect(modelReferenceState('ordinary tag', models)).toBeNull()
  })
})
