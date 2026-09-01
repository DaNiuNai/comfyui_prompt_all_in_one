/// <reference types="vite/client" />

declare module '@comfyui/app' {
  export const app: import('@comfyorg/comfyui-frontend-types').ComfyApp & {
    registerExtension(extension: Record<string, unknown>): void
  }
}

declare module '@comfyui/api' {
  export const api: {
    fetchApi(path: string, init?: RequestInit): Promise<Response>
  }
}

interface ImportMeta {
  env: {
    DEV: boolean
    PROD: boolean
    MODE: string
  }
}
