import { app } from '@comfyui/app'
import React, { Suspense } from 'react'
import ReactDOM, { Root } from 'react-dom/client'

import './index.css'
import { PromptNode } from './types'
import './utils/i18n'

const App = React.lazy(() => import('./App'))
const SIDEBAR_ID = 'prompt-all-in-one'
const NODE_TYPES = new Set([
  'PromptAllInOne_Positive',
  'PromptAllInOne_Negative'
])
let sidebarRoot: Root | null = null
let activeNode: PromptNode | null = null

function emitNode(
  name: 'paio:node-selected' | 'paio:node-updated',
  node: PromptNode | null
) {
  if (name === 'paio:node-selected') activeNode = node
  window.dispatchEvent(new CustomEvent(name, { detail: node }))
}

function openSidebar(node: PromptNode) {
  emitNode('paio:node-selected', node)
  const extensionManager =
    app.extensionManager as typeof app.extensionManager & {
      sidebarTab?: { activeSidebarTabId?: string }
    }
  if (extensionManager.sidebarTab) {
    extensionManager.sidebarTab.activeSidebarTabId = SIDEBAR_ID
  }
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
        () => openSidebar(node),
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

    const originalSelected = nodeType.prototype.onSelected
    nodeType.prototype.onSelected = function (...args: unknown[]) {
      const result = originalSelected?.apply(this, args)
      emitNode('paio:node-selected', this as PromptNode)
      return result
    }

    const originalRemoved = nodeType.prototype.onRemoved
    nodeType.prototype.onRemoved = function (...args: unknown[]) {
      if (activeNode?.id === this.id) emitNode('paio:node-selected', null)
      return originalRemoved?.apply(this, args)
    }
  },

  async setup() {
    app.extensionManager.registerSidebarTab({
      id: SIDEBAR_ID,
      icon: 'pi pi-language',
      title: '提示词 / Prompt',
      tooltip: '提示词全能编辑器 / Prompt All in One',
      type: 'custom',
      render: (element: HTMLElement) => {
        sidebarRoot?.unmount()
        element.replaceChildren()
        const container = document.createElement('div')
        container.id = 'prompt-all-in-one-root'
        element.appendChild(container)
        sidebarRoot = ReactDOM.createRoot(container)
        sidebarRoot.render(
          <React.StrictMode>
            <Suspense fallback={<div className="paio-loading">Loading…</div>}>
              <App initialNode={activeNode} />
            </Suspense>
          </React.StrictMode>
        )
      },
      destroy: () => {
        sidebarRoot?.unmount()
        sidebarRoot = null
      }
    })
  },

  commands: [
    {
      id: 'promptAllInOne.open',
      label: '打开提示词全能编辑器 / Open Prompt All in One',
      function: () => {
        if (activeNode) openSidebar(activeNode)
      }
    }
  ],
  keybindings: [
    {
      commandId: 'promptAllInOne.open',
      combo: { key: 'p', ctrl: true, alt: true }
    }
  ],
  menuCommands: [
    {
      path: ['Extensions', 'Prompt All in One'],
      commands: ['promptAllInOne.open']
    }
  ],
  aboutPageBadges: [
    {
      label: 'GitHub',
      url: 'https://github.com/DaNiuNai/comfyui_prompt_all_in_one',
      icon: 'pi pi-github'
    }
  ]
})
