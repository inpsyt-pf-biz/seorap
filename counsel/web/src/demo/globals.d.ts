import type { DemoSnapshot } from './store'

// 체험판 빌드 때 vite.demo.config.ts 가 web/.demo/snapshot.json 내용으로 바꿔 넣는다
declare global {
  const __DEMO_SNAPSHOT__: DemoSnapshot
}

export {}
