/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const core = fileURLToPath(new URL('../supabase/functions/_shared/core', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@core': core } },
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:55321',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '/functions/v1/api'),
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
