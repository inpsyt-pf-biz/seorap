// 체험판 전용 supabase 흉내. lib/api.ts 와 shell/SessionProvider 가 부르는 모양(from·rpc·auth)만 갖춘다.
// 쓰기 함수가 도중에 실패하면 실제 DB처럼 그 함수가 바꾼 것을 모두 되돌린다.
import { Query, type Row, type Tables } from './query'
import { RPC, RpcError } from './rpc'
import type { DemoDb } from './store'

// 실제 DB의 counsel.center_stats 보기와 같은 셈: 취소를 뺀 배정 건수, 상담 완료 건수
const VIEWS: Record<string, (t: Tables) => Row[]> = {
  center_stats: (t) => (t.centers ?? []).map((c) => {
    const mine = (t.sessions ?? []).filter((s) => s.center_id === c.id)
    return {
      center_id: c.id,
      assigned_count: mine.filter((s) => s.status !== 'cancelled').length,
      completed_count: mine.filter((s) => s.status === 'completed').length,
    }
  }),
}

type AuthSession = { user: { id: string } } | null
type AuthListener = (event: 'INITIAL_SESSION' | 'SIGNED_OUT', session: AuthSession) => void

export function createFakeClient(db: DemoDb) {
  // 체험판은 관리자로 들어간 채 시작한다. 로그아웃한 뒤에는 아무 값이나 넣어도 다시 관리자로 들어간다
  let signedIn = true
  const listeners = new Set<AuthListener>()
  const session = (): AuthSession => (signedIn ? { user: { id: db.context.user_id } } : null)

  return {
    from: (table: string) => new Query(() => db.tables, table, VIEWS[table]),

    rpc(name: string, params: Record<string, unknown> = {}) {
      return Promise.resolve().then(() => {
        const fn = RPC[name]
        if (!fn) throw new Error(`demo: ${name} 함수가 없다`)
        const backup = structuredClone(db.tables)
        try {
          const data = fn(db, params)
          db.save()
          return { data, error: null }
        } catch (e) {
          db.tables = backup
          if (e instanceof RpcError) return { data: null, error: { code: 'P0001', message: e.message, details: e.detail } }
          throw e
        }
      })
    },

    auth: {
      onAuthStateChange(cb: AuthListener) {
        listeners.add(cb)
        setTimeout(() => cb('INITIAL_SESSION', session()), 0)
        return { data: { subscription: { unsubscribe: () => { listeners.delete(cb) } } } }
      },
      async signInWithPassword(_credentials: { email: string; password: string }) {
        signedIn = true
        return { data: { session: session() }, error: null }
      },
      async signOut() {
        signedIn = false
        listeners.forEach((cb) => cb('SIGNED_OUT', null))
        return { error: null }
      },
    },
  }
}
