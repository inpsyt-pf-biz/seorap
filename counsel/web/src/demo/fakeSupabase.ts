// 체험판 빌드에서 shell/supabaseClient 대신 들어간다(vite.demo.config.ts 의 alias). 빌드 때 넣은 가짜 데이터로만 돈다.
import { createFakeClient } from './client'
import { createDemoDb } from './store'

export const demoDb = createDemoDb(__DEMO_SNAPSHOT__, 'counsel-demo-db')
export const supabase = createFakeClient(demoDb)
