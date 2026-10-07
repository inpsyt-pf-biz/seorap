import { db } from '../lib/db.ts'
import { json } from '../lib/http.ts'
import { clearCookie, requireSession } from '../lib/session.ts'

export async function logout(req: Request): Promise<Response> {
  try {
    const sess = await requireSession(req)
    await db().from('customer_sessions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' }).eq('id_hash', sess.idHash)
  } catch {
    // 이미 끝난 세션이어도 쿠키는 지운다
  }
  return json(200, { ok: true }, { 'Set-Cookie': clearCookie() })
}
