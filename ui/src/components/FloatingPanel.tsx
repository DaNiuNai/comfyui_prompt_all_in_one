import { ReactNode, useEffect } from 'react'
import { Rnd } from 'react-rnd'

import { PanelState, clampPanelState } from '../utils/panelState'

interface Props {
  state: PanelState
  title: ReactNode
  actions: ReactNode
  children: ReactNode
  onStateChange: (state: PanelState) => void
}

export function FloatingPanel({
  state,
  title,
  actions,
  children,
  onStateChange
}: Props) {
  useEffect(() => {
    const clamp = () =>
      onStateChange(
        clampPanelState(state, window.innerWidth, window.innerHeight)
      )
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [onStateChange, state])

  if (!state.visible) return null

  return (
    <Rnd
      bounds="window"
      className="paio-floating-panel"
      dragHandleClassName="paio-window-drag-handle"
      minWidth={Math.min(480, window.innerWidth - 32)}
      minHeight={Math.min(360, window.innerHeight - 32)}
      position={{ x: state.x, y: state.y }}
      size={{ width: state.width, height: state.height }}
      onDragStop={(_event, position) =>
        onStateChange(
          clampPanelState(
            { ...state, x: position.x, y: position.y },
            window.innerWidth,
            window.innerHeight
          )
        )
      }
      onResizeStop={(_event, _direction, element, _delta, position) =>
        onStateChange(
          clampPanelState(
            {
              ...state,
              x: position.x,
              y: position.y,
              width: element.offsetWidth,
              height: element.offsetHeight
            },
            window.innerWidth,
            window.innerHeight
          )
        )
      }
    >
      <section className="paio-window" role="dialog" aria-modal="false">
        <header className="paio-window-header">
          <div className="paio-window-drag-handle">{title}</div>
          <div className="paio-window-actions">{actions}</div>
        </header>
        <div className="paio-window-body">{children}</div>
      </section>
    </Rnd>
  )
}
