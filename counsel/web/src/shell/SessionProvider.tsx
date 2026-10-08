import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMyContext } from '../lib/api'
import { SessionContext, type SessionState, type SessionValue } from './session'
import { supabase } from './supabaseClient'

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  const load = useCallback(async (signedIn: boolean) => {
    if (!signedIn) { setState({ status: 'signedOut' }); return }
    try {
      setState({ status: 'ready', ctx: await getMyContext() })
    } catch {
      setState({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    // 콜백 안에서 바로 Supabase 를 다시 부르면 잠금이 걸릴 수 있어 한 박자 미룬다
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') setTimeout(() => { void load(!!session) }, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return false
    setState({ status: 'loading' })
    await load(true)
    return true
  }, [load])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<SessionValue>(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
