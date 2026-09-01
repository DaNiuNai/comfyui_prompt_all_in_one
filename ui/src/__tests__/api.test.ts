import { api } from '@comfyui/api'

import { promptApi } from '../utils/api'

jest.mock(
  '@comfyui/api',
  () => ({
    api: { fetchApi: jest.fn() }
  }),
  { virtual: true }
)

const fetchApi = api.fetchApi as jest.MockedFunction<typeof api.fetchApi>

describe('API error handling', () => {
  beforeEach(() => {
    fetchApi.mockReset()
  })

  it('keeps the backend JSON error message', async () => {
    fetchApi.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          success: false,
          error: { message: 'Baidu translation is temporarily unavailable' }
        })
      )
    } as unknown as Response)

    await expect(
      promptApi.translate(['你好'], 'baidu', 'zh_CN', 'en_US')
    ).rejects.toThrow('Baidu translation is temporarily unavailable')
  })

  it('reports an HTTP error when the backend returns non-JSON text', async () => {
    fetchApi.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('500 Internal Server Error')
    } as unknown as Response)

    await expect(
      promptApi.translate(['你好'], 'baidu', 'zh_CN', 'en_US')
    ).rejects.toThrow('Request failed (500: Internal Server Error)')
  })
})
