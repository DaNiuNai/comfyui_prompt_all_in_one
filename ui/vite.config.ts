import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

interface RewriteComfyImportsOptions {
  isDev: boolean
}

const rewriteComfyImports = ({ isDev }: RewriteComfyImportsOptions) => {
  return {
    name: 'rewrite-comfy-imports',
    resolveId(source: string) {
      if (source === '@comfyui/app') {
        return {
          id: isDev
            ? 'http://127.0.0.1:8188/scripts/app.js'
            : '/scripts/app.js',
          external: true
        }
      }
      if (source === '@comfyui/api') {
        return {
          id: isDev
            ? 'http://127.0.0.1:8188/scripts/api.js'
            : '/scripts/api.js',
          external: true
        }
      }
      return null
    }
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), rewriteComfyImports({ isDev: mode === 'development' })],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'src/main.tsx')
      },
      output: {
        dir: '../dist',
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks(id: string) {
          return id.includes('/node_modules/react') ? 'vendor' : undefined
        }
      }
    }
  }
}))
