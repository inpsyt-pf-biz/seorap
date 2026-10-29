import { createClient } from '@supabase/supabase-js'
import { t } from '@counsel-core/copy.ko.ts'
import { isAllowedStackUrl } from './localGuard'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!isAllowedStackUrl(url, import.meta.env.VITE_COUNSEL_ENV) || !key) throw new Error(t('app.localOnly'))

// 개발 중에는 로그인 상태를 탭마다 따로 둔다. 한 브라우저에서 탭별로 다른 계정을 띄워 볼 수 있다.
// 저장 이름도 탭마다 달라야 한다. 이름이 같으면 한 탭의 로그아웃 알림이 다른 탭에도 전해져 함께 로그아웃된다.
function devTabStorageKey(): string {
  let id = window.sessionStorage.getItem('counsel-dev-tab')
  if (!id) {
    id = crypto.randomUUID().slice(0, 8)
    window.sessionStorage.setItem('counsel-dev-tab', id)
  }
  return `counsel-auth-${id}`
}

export const supabase = createClient(url, key, {
  db: { schema: 'counsel' },
  auth: import.meta.env.DEV ? { storage: window.sessionStorage, storageKey: devTabStorageKey() } : {},
})
