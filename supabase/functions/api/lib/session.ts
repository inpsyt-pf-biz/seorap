import { hmac, randomToken } from '../../_shared/crypto.ts'
import { cookieSecureDisabled } from '../../_shared/env.ts'
import { db, must } from './db.ts'
import { ApiError, getCookie, isMobile } from './http.ts'
import { getSettings } from './settings.ts'

export const COOKIE = 'seorap_sid'
export type Session = { idHash: string; recipientId: string; accessLinkId: string; lastOtpAt: string | null }

// maxAgeSec 가 null 이면 세션 쿠키(창을 닫으면 소멸, PC용)
// Secure 는 로컬(SEORAP_ENV=local)에서 SEORAP_COOKIE_SECURE=false 일 때만 뺀다. 다른 환경에서는 설정이 있어도 붙인다.
function cookie(value: string, maxAgeSec: number | null): string {
  const secure = cookieSecureDisabled(Deno.env.get('SEORAP_ENV'), Deno.env.get('SEORAP_COOKIE_SECURE')) ? '' : '; Secure'
  const age = maxAgeSec === null ? '' : `; Max-Age=${maxAgeSec}`
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${age}${secure}`
}

export async function createSession(recipientId: string, linkId: string, req: Request): Promise<string> {
  const s = await getSettings()
  const mobile = isMobile(req)
  const now = Date.now()
  const idleMin = mobile ? s.session_mobile_idle_min : s.session_desktop_idle_min
  const absMs = mobile ? s.session_mobile_max_hours * 3_600_000 : idleMin * 60_000 * 4
  const id = randomToken(32)
  must(await db().from('customer_sessions').insert({
    id_hash: await hmac(`sid:${id}`),
    scope: 'box',
    recipient_id: recipientId,
    access_link_id: linkId,
    device_class: mobile ? 'mobile' : 'desktop',
    idle_expires_at: new Date(now + idleMin * 60_000).toISOString(),
    absolute_expires_at: new Date(now + absMs).toISOString(),
    last_otp_at: new Date(now).toISOString(),
  }), 'session insert')
  return cookie(id, mobile ? s.session_mobile_max_hours * 3600 : null)
}

export function clearCookie(): string {
  return `${cookie('', 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export async function requireSession(req: Request): Promise<Session> {
  const raw = getCookie(req, COOKIE)
  if (!raw) throw new ApiError('SESSION_EXPIRED')
  const idHash = await hmac(`sid:${raw}`)
  // 조회 오류는 502(must)로 올리고, "행 없음·폐기·만료"만 SESSION_EXPIRED 로 처리한다
  const row = must(
    await db().from('customer_sessions')
      .select('id_hash, recipient_id, access_link_id, device_class, idle_expires_at, absolute_expires_at, last_otp_at, revoked_at')
      .eq('id_hash', idHash).maybeSingle(),
    'session read',
  ) as {
    id_hash: string; recipient_id: string; access_link_id: string; device_class: 'mobile' | 'desktop'
    idle_expires_at: string; absolute_expires_at: string; last_otp_at: string | null; revoked_at: string | null
  } | null
  const now = Date.now()
  if (!row || row.revoked_at || Date.parse(row.idle_expires_at) < now || Date.parse(row.absolute_expires_at) < now) {
    throw new ApiError('SESSION_EXPIRED')
  }
  const s = await getSettings()
  const idleMin = row.device_class === 'mobile' ? s.session_mobile_idle_min : s.session_desktop_idle_min
  must(
    await db().from('customer_sessions').update({
      last_seen_at: new Date(now).toISOString(),
      idle_expires_at: new Date(Math.min(now + idleMin * 60_000, Date.parse(row.absolute_expires_at))).toISOString(),
    }).eq('id_hash', idHash),
    'session touch',
  )
  return { idHash, recipientId: row.recipient_id, accessLinkId: row.access_link_id, lastOtpAt: row.last_otp_at }
}
