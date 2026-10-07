import { hmac, randomToken } from '../../_shared/crypto.ts'
import { db } from './db.ts'
import { ApiError, getCookie, isMobile } from './http.ts'
import { getSettings } from './settings.ts'

export const COOKIE = 'seorap_sid'
export type Session = { idHash: string; recipientId: string; accessLinkId: string; lastOtpAt: string | null }

// maxAgeSec 가 null 이면 세션 쿠키(창을 닫으면 소멸, PC용)
function cookie(value: string, maxAgeSec: number | null): string {
  const secure = Deno.env.get('SEORAP_COOKIE_SECURE') === 'false' ? '' : '; Secure'
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
  await db().from('customer_sessions').insert({
    id_hash: await hmac(`sid:${id}`),
    scope: 'box',
    recipient_id: recipientId,
    access_link_id: linkId,
    device_class: mobile ? 'mobile' : 'desktop',
    idle_expires_at: new Date(now + idleMin * 60_000).toISOString(),
    absolute_expires_at: new Date(now + absMs).toISOString(),
    last_otp_at: new Date(now).toISOString(),
  })
  return cookie(id, mobile ? s.session_mobile_max_hours * 3600 : null)
}

export function clearCookie(): string {
  return `${cookie('', 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export async function requireSession(req: Request): Promise<Session> {
  const raw = getCookie(req, COOKIE)
  if (!raw) throw new ApiError('SESSION_EXPIRED')
  const idHash = await hmac(`sid:${raw}`)
  const { data: row } = await db().from('customer_sessions')
    .select('id_hash, recipient_id, access_link_id, device_class, idle_expires_at, absolute_expires_at, last_otp_at, revoked_at')
    .eq('id_hash', idHash).maybeSingle()
  const now = Date.now()
  if (!row || row.revoked_at || Date.parse(row.idle_expires_at) < now || Date.parse(row.absolute_expires_at) < now) {
    throw new ApiError('SESSION_EXPIRED')
  }
  const s = await getSettings()
  const idleMin = row.device_class === 'mobile' ? s.session_mobile_idle_min : s.session_desktop_idle_min
  await db().from('customer_sessions').update({
    last_seen_at: new Date(now).toISOString(),
    idle_expires_at: new Date(Math.min(now + idleMin * 60_000, Date.parse(row.absolute_expires_at))).toISOString(),
  }).eq('id_hash', idHash)
  return { idHash, recipientId: row.recipient_id, accessLinkId: row.access_link_id, lastOtpAt: row.last_otp_at }
}
