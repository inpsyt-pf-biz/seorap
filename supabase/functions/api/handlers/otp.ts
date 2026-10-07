import { mockAdapters } from '../../_shared/adapters/mock.ts'
import type { OtpRequestResponse, OtpVerifyResponse } from '../../_shared/core/apiTypes.ts'
import { otpRetryAt } from '../../_shared/core/limits.ts'
import { decrypt, hmac, sixDigits } from '../../_shared/crypto.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { findBoxLink } from '../lib/links.ts'
import { createSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function otpRequest(req: Request): Promise<Response> {
  const { token } = await readJson<{ token: unknown }>(req)
  const { link, recipient } = await findBoxLink(token)
  const s = await getSettings()
  const now = Date.now()

  const recent = must(
    await db().from('otp_challenges').select('created_at, locked_until')
      .eq('access_link_id', link.id).order('created_at', { ascending: false }).limit(1),
    'otp recent read',
  )
  const last = recent?.[0]
  if (last?.locked_until && Date.parse(last.locked_until) > now) throw new ApiError('OTP_LOCKED', { until: last.locked_until })
  if (last && Date.parse(last.created_at) + s.otp_resend_seconds * 1000 > now) {
    throw new ApiError('RATE_LIMITED', { retryAt: new Date(Date.parse(last.created_at) + s.otp_resend_seconds * 1000).toISOString() })
  }
  // 번호당 1시간·24시간 한도. 다시 받을 수 있는 시각은 걸린 창에서 가장 오래된 요청이 창을 벗어나는 때다
  // (조회 오류를 0건으로 바꾸면 한도를 그냥 통과하므로 must 로 502 를 올린다)
  const dayAgo = new Date(now - 86_400_000).toISOString()
  const recentTimes = must(
    await db().from('otp_challenges').select('created_at')
      .eq('target_phone_hash', recipient.phone_hash).gte('created_at', dayAgo),
    'otp phone window read',
  ) as { created_at: string }[]
  const retryAt = otpRetryAt({
    now: new Date(now), createdAt: recentTimes.map((r) => new Date(r.created_at)),
    perHour: s.otp_per_phone_hour, perDay: s.otp_per_phone_day,
  })
  if (retryAt) throw new ApiError('RATE_LIMITED', { retryAt: retryAt.toISOString() })

  const code = sixDigits()
  const challengeId = crypto.randomUUID()
  const messageId = crypto.randomUUID()
  const expiresAt = new Date(now + s.otp_ttl_seconds * 1000).toISOString()
  // 요청마다 별도 트랜잭션이므로, 서로 가리키는 행은 "먼저 만든 쪽을 나중에 가리키게" 순서로 저장한다
  must(await db().from('otp_challenges').insert({
    id: challengeId,
    access_link_id: link.id,
    target_phone_hash: recipient.phone_hash,
    code_hash: await hmac(`otp:${challengeId}:${code}`),
    expires_at: expiresAt,
    max_attempts: s.otp_max_attempts,
  }), 'otp insert')
  must(await db().from('messages').insert({
    id: messageId, purpose: 'otp', requested_channel: 'sms', to_kind: 'recipient',
    to_phone_hash: recipient.phone_hash, to_phone_last4: recipient.phone_last4, recipient_id: recipient.id, otp_id: challengeId,
  }), 'otp message insert')
  must(await db().from('otp_challenges').update({ message_id: messageId }).eq('id', challengeId), 'otp message link')

  const adapters = mockAdapters(db(), s.mock_message_mode)
  await adapters.sms.sendOtp({ messageId, toPhone: await decrypt('A', recipient.phone_enc), code })
  await logEvent('otp_requested', { recipientId: recipient.id })

  const body: OtpRequestResponse = { expiresAt, resendAt: new Date(now + s.otp_resend_seconds * 1000).toISOString() }
  return json(200, body)
}

export async function otpVerify(req: Request): Promise<Response> {
  const { token, code } = await readJson<{ token: unknown; code: unknown }>(req)
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new ApiError('VALIDATION', { field: 'code' })
  const { link, recipient } = await findBoxLink(token)
  const s = await getSettings()

  // 가장 최근 번호만 받는다 (Review Focus 1)
  const rows = must(
    await db().from('otp_challenges')
      .select('id, code_hash, expires_at, attempt_count, max_attempts, locked_until, consumed_at')
      .eq('access_link_id', link.id).order('created_at', { ascending: false }).limit(1),
    'otp latest read',
  )
  const ch = rows?.[0]
  if (!ch || ch.consumed_at) throw new ApiError('OTP_EXPIRED')
  if (ch.locked_until && Date.parse(ch.locked_until) > Date.now()) throw new ApiError('OTP_LOCKED', { until: ch.locked_until })
  if (Date.parse(ch.expires_at) < Date.now()) throw new ApiError('OTP_EXPIRED')

  if ((await hmac(`otp:${ch.id}:${code}`)) !== ch.code_hash) {
    const res = must(await db().rpc('otp_register_failure', { p_id: ch.id, p_lock_minutes: s.otp_lock_minutes }), 'otp failure')
    const r = (res as { out_attempt_count: number; out_max_attempts: number; out_locked_until: string | null }[])[0]
    await logEvent('otp_failed', { recipientId: recipient.id })
    if (r?.out_locked_until) throw new ApiError('OTP_LOCKED', { until: r.out_locked_until })
    throw new ApiError('OTP_WRONG', { remaining: Math.max(0, (r?.out_max_attempts ?? 5) - (r?.out_attempt_count ?? 0)) })
  }

  const consumed = must(await db().rpc('otp_consume', { p_id: ch.id }), 'otp consume')
  if (!consumed) throw new ApiError('OTP_EXPIRED')
  const setCookie = await createSession(recipient.id, link.id, req)
  await db().from('recipients').update({ last_login_at: new Date().toISOString() }).eq('id', recipient.id)
  await logEvent('otp_verified', { recipientId: recipient.id })
  const body: OtpVerifyResponse = { ok: true }
  return json(200, body, { 'Set-Cookie': setCookie })
}
