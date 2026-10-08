import { createContext, useContext } from 'react'

export type Membership = { center_id: string; center_name: string; is_headquarters: boolean; role: string }
export type MyContext = { user_id: string; display_name: string | null; membership: Membership | null; caps: string[] }

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'ready'; ctx: MyContext }

export type SessionValue = {
  state: SessionState
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const v = useContext(SessionContext)
  if (!v) throw new Error('SessionProvider 가 없다')
  return v
}

// 메뉴·버튼을 보일지 정할 때만 쓴다. 실제 허용 여부는 DB 함수가 다시 판정한다.
export function hasCap(state: SessionState, cap: string): boolean {
  return state.status === 'ready' && state.ctx.caps.includes(cap)
}

export function isHq(state: SessionState): boolean {
  return state.status === 'ready' && state.ctx.membership?.is_headquarters === true
}
