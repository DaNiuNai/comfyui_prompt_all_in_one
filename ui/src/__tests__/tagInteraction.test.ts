import { documentFromPrompt } from '../utils/prompt'
import { rectanglesIntersect, reorderTags } from '../utils/tagInteraction'

describe('tag interactions', () => {
  it('moves all selected tags as one ordered block', () => {
    const tags = documentFromPrompt('a, b, c, d').tags
    const selected = new Set([tags[1].id, tags[2].id])

    const result = reorderTags(tags, tags[1].id, tags[3].id, selected)

    expect(result.map((tag) => tag.text)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves only the dragged tag when it is not selected', () => {
    const tags = documentFromPrompt('a, b, c, d').tags

    const result = reorderTags(tags, tags[3].id, tags[1].id, new Set())

    expect(result.map((tag) => tag.text)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('detects marquee intersection at touching edges', () => {
    expect(
      rectanglesIntersect(
        { left: 0, top: 0, right: 20, bottom: 20 },
        { left: 20, top: 10, right: 40, bottom: 30 }
      )
    ).toBe(true)
  })
})
