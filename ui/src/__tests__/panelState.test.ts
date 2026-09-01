import {
  PANEL_STATE_KEY,
  PanelState,
  clampPanelState,
  loadPanelState,
  savePanelState
} from '../utils/panelState'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: jest.fn((key: string) => (key === PANEL_STATE_KEY ? value : null)),
    setItem: jest.fn((key: string, next: string) => {
      if (key === PANEL_STATE_KEY) value = next
    })
  }
}

describe('panel state', () => {
  it('restores visibility and clamps geometry into the viewport', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        visible: true,
        x: 5000,
        y: -200,
        width: 2000,
        height: 2000,
        rawExpanded: true,
        libraryExpanded: false,
        drawer: 'settings'
      })
    )

    const state = loadPanelState(1280, 800, storage)

    expect(state.visible).toBe(true)
    expect(state.x).toBe(16)
    expect(state.y).toBe(16)
    expect(state.width).toBe(1248)
    expect(state.height).toBe(768)
    expect(state.drawer).toBe('settings')
  })

  it('persists only the window state passed by the caller', () => {
    const storage = memoryStorage()
    const state: PanelState = {
      version: 1,
      visible: false,
      x: 20,
      y: 30,
      width: 900,
      height: 700,
      rawExpanded: false,
      libraryExpanded: true,
      drawer: null
    }

    savePanelState(state, storage)

    expect(storage.setItem).toHaveBeenCalledWith(
      PANEL_STATE_KEY,
      JSON.stringify(state)
    )
  })

  it('keeps a resized panel fully visible', () => {
    const state = clampPanelState(
      {
        version: 1,
        visible: true,
        x: 1100,
        y: 700,
        width: 600,
        height: 500,
        rawExpanded: false,
        libraryExpanded: true,
        drawer: null
      },
      1280,
      800
    )

    expect(state.x + state.width).toBeLessThanOrEqual(1264)
    expect(state.y + state.height).toBeLessThanOrEqual(784)
  })
})
