/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@counsel-core': here('../core'),
      // 서랍 화면의 테마·공용 부품을 복사하지 않고 원본에서 가져온다
      '@seorap-web': here('../../web/src'),
      '@seorap-core': here('../../supabase/functions/_shared/core'),
    },
    // 서랍 원본 파일이 부르는 라이브러리도 이 앱에 설치된 것 하나만 쓴다 (React·MUI 두 벌 방지)
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  server: { port: 5180, strictPort: true, fs: { allow: [here('../..')] } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
