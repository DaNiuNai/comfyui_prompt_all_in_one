import { app } from '@comfyui/app'
import React, { Suspense } from 'react'
import ReactDOM, { Root } from 'react-dom/client'

import { PromptNode } from './types'
import './utils/i18n'

const App = React.lazy(() => import('./App'))
const NODE_TYPES = new Set([
  'PromptAllInOne_Positive',
  'PromptAllInOne_Negative'
])

let overlayRoot: Root | null = null
let activeNode: PromptNode | null = null

function emitNode(
  name: 'paio:open-node' | 'paio:node-updated' | 'paio:node-removed',
  node: PromptNode | null
) {
  window.dispatchEvent(new CustomEvent(name, { detail: node }))
}

function requestPanel(node: PromptNode) {
  activeNode = node
  emitNode('paio:open-node', node)
}

app.registerExtension({
  name: 'comfyui_prompt_all_in_one',

  async beforeRegisterNodeDef(nodeType: any, nodeData: { name: string }) {
    if (!NODE_TYPES.has(nodeData.name)) return

    const originalCreated = nodeType.prototype.onNodeCreated
    nodeType.prototype.onNodeCreated = function (...args: unknown[]) {
      const result = originalCreated?.apply(this, args)
      const node = this as PromptNode & {
        addWidget: (
          type: string,
          name: string,
          value: unknown,
          callback: () => void,
          options?: Record<string, unknown>
        ) => unknown
      }
      node.addWidget(
        'button',
        '打开提示词编辑器 / Open Prompt Editor',
        null,
        () => requestPanel(node),
        { serialize: false }
      )
      const promptWidget = node.widgets?.find(
        (widget) => widget.name === 'prompt'
      )
      if (promptWidget) {
        const originalCallback = promptWidget.callback
        promptWidget.callback = (value) => {
          originalCallback?.(value)
          if (activeNode?.id === node.id) emitNode('paio:node-updated', node)
        }
      }
      return result
    }

    const originalRemoved = nodeType.prototype.onRemoved
    nodeType.prototype.onRemoved = function (...args: unknown[]) {
      if (activeNode?.id === this.id) {
        const removed = activeNode
        activeNode = null
        emitNode('paio:node-removed', removed)
      }
      return originalRemoved?.apply(this, args)
    }
  },

  async setup() {
    overlayRoot?.unmount()
    document.getElementById('prompt-all-in-one-root')?.remove()

    const container = document.createElement('div')
    container.id = 'prompt-all-in-one-root'
    document.body.appendChild(container)
    overlayRoot = ReactDOM.createRoot(container)
    overlayRoot.render(
      <React.StrictMode>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </React.StrictMode>
    )
  },

  aboutPageBadges: [
    {
      label: 'GitHub',
      url: 'https://github.com/DaNiuNai/comfyui_prompt_all_in_one',
      icon: 'pi pi-github'
    }
  ]
})
