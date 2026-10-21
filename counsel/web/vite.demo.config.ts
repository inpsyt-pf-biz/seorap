// 체험판 빌드: 실제 화면을 그대로 쓰고, DB 연결(shell/supabaseClient)과 맨 위 안내 띠(components/DemoBanner)만 체험판 것으로 바꿔 끼운다.
// 가짜 데이터는 counsel/scripts/demo-snapshot.ts 가 만든 web/.demo/snapshot.json 을 빌드 때 넣는다.
// 순서는 counsel 폴더의 `deno task demo` 가 한 번에 한다(데이터 꺼내기 → 이 빌드 → 파일 하나로 묶기 → 비밀값 검사).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // .env.local(지도 키·접속값)을 읽지 않고, 실행 환경의 VITE_* 값도 넣지 않는다(아무도 쓰지 않는 접두사).
  // 받는 사람에게 넘어가는 파일이라 비밀값이 들어가면 안 된다
  envDir: here('src/demo'),
  envPrefix: 'COUNSEL_DEMO_PUBLIC_',
  base: './',
  define: { __DEMO_SNAPSHOT__: readFileSync(here('.demo/snapshot.json'), 'utf8') },
  resolve: {
    alias: [
      { find: /^(?:\.\/|(?:\.\.\/)+shell\/)supabaseClient$/, replacement: here('src/demo/fakeSupabase.ts') },
      { find: /^(?:\.\.\/)+components\/DemoBanner$/, replacement: here('src/demo/DemoBanner.tsx') },
      { find: '@counsel-core', replacement: here('../core') },
      { find: '@seorap-web', replacement: here('../../web/src') },
      { find: '@seorap-core', replacement: here('../../supabase/functions/_shared/core') },
    ],
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  build: {
    outDir: here('.demo/dist'),
    emptyOutDir: true,
    // 그림·글꼴까지 모두 코드 안에 넣고 조각을 나누지 않는다. 나중에 HTML 한 파일로 묶는다
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      input: here('demo.html'),
      output: { codeSplitting: false },
    },
  },
})
