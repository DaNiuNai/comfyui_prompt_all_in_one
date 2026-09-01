import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { GroupLibrary } from '../components/GroupLibrary'
import { TagEditor } from '../components/TagEditor'
import { Settings } from '../types'
import { documentFromPrompt } from '../utils/prompt'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`
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
  hotkeys: {
    click: 'edit',
    double_click: 'disable',
    right_click: 'extend',
    hover: 'extend'
  }
}

function renderEditor(
  overrides: Partial<Parameters<typeof TagEditor>[0]> = {}
) {
  const document = overrides.document ?? documentFromPrompt('first, second')
  const props: Parameters<typeof TagEditor>[0] = {
    document,
    settings,
    models: { checkpoints: [], loras: [], embeddings: [] },
    busy: false,
    rawExpanded: false,
    onRawExpandedChange: jest.fn(),
    onChange: jest.fn(),
    onCommit: jest.fn(),
    onTranslate: jest.fn().mockResolvedValue(undefined),
    onFavorite: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }
  return { ...render(<TagEditor {...props} />), props, document }
}

describe('TagEditor', () => {
  it('applies a batch disable operation to selected tags', () => {
    const document = documentFromPrompt('masterpiece, <lora:Cinematic:0.8>')
    const onChange = jest.fn()
    renderEditor({
      document,
      onChange,
      models: {
        checkpoints: [],
        loras: ['Cinematic.safetensors'],
        embeddings: []
      }
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'common.select' })[0])
    const toolbar = screen.getByLabelText('editor.batchTools')
    fireEvent.click(
      within(toolbar).getByRole('button', { name: 'common.disable' })
    )

    const changedDocument =
      onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]
    expect(changedDocument.tags[0].enabled).toBe(false)
    expect(screen.getByText('models.found')).toBeInTheDocument()
  })

  it('translates exactly the selected tags', () => {
    const document = documentFromPrompt('first, second')
    const onTranslate = jest.fn().mockResolvedValue(undefined)
    renderEditor({ document, onTranslate })

    fireEvent.click(screen.getAllByRole('button', { name: 'common.select' })[1])
    const toolbar = screen.getByLabelText('editor.batchTools')
    fireEvent.click(
      within(toolbar).getByRole('button', { name: 'common.translate' })
    )

    expect(onTranslate).toHaveBeenCalledWith([document.tags[1].id])
  })

  it('uses the configured click and double-click gestures', () => {
    jest.useFakeTimers()
    const document = documentFromPrompt('first')
    const onChange = jest.fn()
    renderEditor({ document, onChange })
    const tag = screen.getByRole('button', { name: /first/ })

    fireEvent.click(tag)
    act(() => jest.advanceTimersByTime(230))
    expect(screen.getByDisplayValue('first')).toBeInTheDocument()

    fireEvent.blur(screen.getByDisplayValue('first'))
    fireEvent.doubleClick(screen.getByRole('button', { name: /first/ }))
    expect(
      onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].tags[0].enabled
    ).toBe(false)
    jest.useRealTimers()
  })

  it('opens the raw prompt without changing the document', () => {
    const onRawExpandedChange = jest.fn()
    renderEditor({ onRawExpandedChange })

    fireEvent.click(screen.getByRole('button', { name: 'editor.rawPrompt' }))

    expect(onRawExpandedChange).toHaveBeenCalledWith(true)
  })

  it('keeps commas, spaces, and line breaks in a raw prompt draft', () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderEditor({ rawExpanded: true, onChange, onCommit })
    const textarea = screen.getByPlaceholderText('editor.placeholder')

    fireEvent.change(textarea, { target: { value: '1boy, ' } })
    expect(textarea).toHaveValue('1boy, ')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(textarea, {
      target: { value: '1boy,  red hair\nsmile' }
    })
    expect(textarea).toHaveValue('1boy,  red hair\nsmile')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(textarea)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(textarea).toHaveValue('1boy, red hair\nsmile')
    const changedDocument = onChange.mock.calls[0][0]
    expect(
      changedDocument.tags.map((tag: { text: string }) => tag.text)
    ).toEqual(['1boy', 'red hair', 'smile'])
    expect(changedDocument.tags[2].lineBreakBefore).toBe(true)
    expect(
      changedDocument.tags.some((tag: { text: string }) => tag.text === 'BREAK')
    ).toBe(false)
  })

  it('commits a raw prompt once with Ctrl+Enter outside IME composition', () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderEditor({ rawExpanded: true, onChange, onCommit })
    const textarea = screen.getByPlaceholderText('editor.placeholder')

    fireEvent.change(textarea, { target: { value: 'first\nsecond' } })
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      ctrlKey: true,
      isComposing: true
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].tags[1].lineBreakBefore).toBe(true)
  })

  it('keeps a line break when deleting the first tag on that line', () => {
    const document = documentFromPrompt('first\nsecond, third')
    const onChange = jest.fn()
    renderEditor({ document, onChange })

    fireEvent.click(screen.getAllByRole('button', { name: 'common.select' })[1])
    fireEvent.click(
      within(screen.getByLabelText('editor.batchTools')).getByRole('button', {
        name: 'common.delete'
      })
    )

    const changedDocument = onChange.mock.calls[0][0]
    expect(
      changedDocument.tags.map((tag: { text: string }) => tag.text)
    ).toEqual(['first', 'third'])
    expect(changedDocument.tags[1].lineBreakBefore).toBe(true)
  })
})

describe('GroupLibrary', () => {
  it('skips wrap entries and falls back to the first selectable group', () => {
    const onActiveChange = jest.fn()
    render(
      <GroupLibrary
        categories={[
          {
            name: '汉服',
            groups: [
              { type: 'wrap' },
              {
                name: '唐风',
                tags: { 'tang style': '唐风' }
              }
            ]
          }
        ]}
        colors={{}}
        activeGroup={{ categoryIndex: 0, groupIndex: 0 }}
        selectedTexts={new Set()}
        onToggle={jest.fn()}
        onActiveChange={onActiveChange}
      />
    )

    expect(screen.getByRole('button', { name: /tang style/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '唐风' })).toHaveClass('active')

    fireEvent.click(screen.getByRole('button', { name: '汉服' }))
    expect(onActiveChange).toHaveBeenCalledWith(0, 1)
  })

  it('filters bilingual entries and toggles the English prompt word', () => {
    const onToggle = jest.fn()
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
        selectedTexts={new Set(['1girl'])}
        onToggle={onToggle}
        onActiveChange={jest.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('library.search'), {
      target: { value: '女孩' }
    })
    const word = screen.getByRole('button', { name: /1girl/ })
    fireEvent.click(word)

    expect(word).toHaveAttribute('aria-pressed', 'true')
    expect(onToggle).toHaveBeenCalledWith('1girl')
    expect(
      screen.queryByRole('button', { name: /1boy/ })
    ).not.toBeInTheDocument()
  })
})
