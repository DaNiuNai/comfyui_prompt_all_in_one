import { fireEvent, render, screen } from '@testing-library/react'

import { GroupLibrary } from '../components/GroupLibrary'
import { TagEditor } from '../components/TagEditor'
import { Settings } from '../types'
import { documentFromPrompt } from '../utils/prompt'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

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

describe('TagEditor', () => {
  it('applies a batch disable operation to selected tags', () => {
    const document = documentFromPrompt('masterpiece, <lora:Cinematic:0.8>')
    const onChange = jest.fn()
    render(
      <TagEditor
        document={document}
        settings={settings}
        models={{
          checkpoints: [],
          loras: ['Cinematic.safetensors'],
          embeddings: []
        }}
        busy={false}
        onChange={onChange}
        onCommit={jest.fn()}
        onTranslate={jest.fn().mockResolvedValue(undefined)}
        onFavorite={jest.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'common.disable' }))

    const changedDocument =
      onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]
    expect(changedDocument.tags[0].enabled).toBe(false)
    expect(screen.getByText('models.found')).toBeInTheDocument()
  })

  it('translates exactly the selected tags', () => {
    const document = documentFromPrompt('first, second')
    const onTranslate = jest.fn().mockResolvedValue(undefined)
    render(
      <TagEditor
        document={document}
        settings={settings}
        models={{ checkpoints: [], loras: [], embeddings: [] }}
        busy={false}
        onChange={jest.fn()}
        onCommit={jest.fn()}
        onTranslate={onTranslate}
        onFavorite={jest.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: 'common.translate' }))

    expect(onTranslate).toHaveBeenCalledWith([document.tags[1].id])
  })
})

describe('GroupLibrary', () => {
  it('filters bilingual entries and inserts the English prompt word', () => {
    const onAdd = jest.fn()
    render(
      <GroupLibrary
        categories={[
          {
            name: '人物',
            groups: [
              {
                name: '对象',
                tags: { '1girl': '1女孩', '1boy': '1男孩' }
              }
            ]
          }
        ]}
        colors={{ '人物||对象': 'rgba(255, 0, 0, 0.2)' }}
        activeGroup={{}}
        onAdd={onAdd}
        onActiveChange={jest.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('library.search'), {
      target: { value: '女孩' }
    })
    fireEvent.click(screen.getByRole('button', { name: /1girl/ }))

    expect(onAdd).toHaveBeenCalledWith('1girl')
    expect(
      screen.queryByRole('button', { name: /1boy/ })
    ).not.toBeInTheDocument()
  })
})
