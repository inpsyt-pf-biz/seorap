import { db, must } from '../lib/db.ts'
import { ApiError, json } from '../lib/http.ts'
import { clearCookie, requireSession, type Session } from '../lib/session.ts'

export async function logout(req: Request): Promise<Response> {
  let sess: Session | null = null
  try {
    sess = await requireSession(req)
  } catch (e) {
    // 세션이 없거나 이미 끝났어도 쿠키는 지운다. 그 밖의 오류는 숨기지 않는다.
    if (!(e instanceof ApiError)) throw e
  }
  if (sess) {
    must(
      await db().from('customer_sessions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' }).eq('id_hash', sess.idHash),
      'session revoke',
    )
  }
  return json(200, { ok: true }, { 'Set-Cookie': clearCookie() })
}
