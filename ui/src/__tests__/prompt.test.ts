import { Settings } from '../types'
import {
  adjustWeight,
  documentFromPrompt,
  formatDocument,
  modelReferenceState,
  serializeDocument,
  splitPrompt
} from '../utils/prompt'

const settings: Settings = {
  schema_version: 1,
  language: 'en',
  translate_provider: 'myMemory_free',
  source_language: 'zh_CN',
  target_language: 'en_US',
  auto_remove_space: true,
  trailing_comma: false,
  separator: ', ',
  blacklist: [],
  group_tags_translate: true,
  group_tag_colors: {},
  active_group: {},
  hotkeys: {}
}

describe('prompt parsing', () => {
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
    expect(splitPrompt('女孩，微笑\n夜景')).toEqual([
      '女孩',
      '微笑',
      'BREAK',
      '夜景'
    ])
  })

  it('serializes enabled tags and applies the blacklist', () => {
    const document = documentFromPrompt('masterpiece, blurry, smile')
    document.tags[2].enabled = false
    expect(
      serializeDocument(document, { ...settings, blacklist: ['blurry'] })
    ).toBe('masterpiece')
  })

  it('formats whitespace and removes duplicate tags', () => {
    const document = documentFromPrompt('  red   dress, RED DRESS, smile ')
    expect(formatDocument(document).tags.map((tag) => tag.text)).toEqual([
      'red dress',
      'smile'
    ])
  })

  it('adjusts existing and new weights', () => {
    expect(adjustWeight('portrait', 0.1)).toBe('(portrait:1.1)')
    expect(adjustWeight('(portrait:1.2)', -0.1)).toBe('(portrait:1.1)')
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
