import { Drawer } from '../types'

export const PANEL_STATE_KEY = 'comfyui_prompt_all_in_one:panel:v1'

const VIEWPORT_GAP = 16
const DEFAULT_WIDTH = 900
const DEFAULT_HEIGHT = 720
const MIN_WIDTH = 480
const MIN_HEIGHT = 360

export interface PanelState {
  version: 1
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  rawExpanded: boolean
  libraryExpanded: boolean
  drawer: Drawer | null
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function drawer(value: unknown): Drawer | null {
  return value === 'history' ||
    value === 'favorites' ||
    value === 'ai' ||
    value === 'settings'
    ? value
    : null
}

export function defaultPanelState(
  viewportWidth: number,
  viewportHeight: number
): PanelState {
  const width = Math.max(
    0,
    Math.min(DEFAULT_WIDTH, viewportWidth - VIEWPORT_GAP * 2)
  )
  const height = Math.max(
    0,
    Math.min(DEFAULT_HEIGHT, viewportHeight - VIEWPORT_GAP * 2)
  )
  return {
    version: 1,
    visible: false,
    x: Math.max(VIEWPORT_GAP, viewportWidth - width - 24),
    y: Math.min(72, Math.max(VIEWPORT_GAP, viewportHeight - height)),
    width,
    height,
    rawExpanded: false,
    libraryExpanded: true,
    drawer: null
  }
}

export function clampPanelState(
  state: PanelState,
  viewportWidth: number,
  viewportHeight: number
): PanelState {
  const maxWidth = Math.max(0, viewportWidth - VIEWPORT_GAP * 2)
  const maxHeight = Math.max(0, viewportHeight - VIEWPORT_GAP * 2)
  const minWidth = Math.min(MIN_WIDTH, maxWidth)
  const minHeight = Math.min(MIN_HEIGHT, maxHeight)
  const width = Math.min(maxWidth, Math.max(minWidth, state.width))
  const height = Math.min(maxHeight, Math.max(minHeight, state.height))
  const maxX = Math.max(VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP)
  const maxY = Math.max(VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP)

  return {
    ...state,
    width,
    height,
    x: Math.min(maxX, Math.max(VIEWPORT_GAP, state.x)),
    y: Math.min(maxY, Math.max(VIEWPORT_GAP, state.y))
  }
}

export function loadPanelState(
  viewportWidth: number,
  viewportHeight: number,
  storage: Pick<Storage, 'getItem'> = localStorage
): PanelState {
  const defaults = defaultPanelState(viewportWidth, viewportHeight)
  try {
    const value = JSON.parse(
      storage.getItem(PANEL_STATE_KEY) ?? 'null'
    ) as Partial<PanelState> | null
    if (!value || value.version !== 1) return defaults
    return clampPanelState(
      {
        version: 1,
        visible: boolean(value.visible, defaults.visible),
        x: finite(value.x, defaults.x),
        y: finite(value.y, defaults.y),
        width: finite(value.width, defaults.width),
        height: finite(value.height, defaults.height),
        rawExpanded: boolean(value.rawExpanded, defaults.rawExpanded),
        libraryExpanded: boolean(
          value.libraryExpanded,
          defaults.libraryExpanded
        ),
        drawer: drawer(value.drawer)
      },
      viewportWidth,
      viewportHeight
    )
  } catch {
    return defaults
  }
}

export function savePanelState(
  state: PanelState,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  try {
    storage.setItem(PANEL_STATE_KEY, JSON.stringify(state))
  } catch {
    // The panel remains usable when browser storage is unavailable.
  }
}
