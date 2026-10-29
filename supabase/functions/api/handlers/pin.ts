import type { PinResponse } from '../../_shared/core/apiTypes.ts'
import { checkPin } from '../../_shared/core/pin.ts'
import { hashPin, verifyPin } from '../../_shared/crypto.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { findBoxLink } from '../lib/links.ts'
import { createSession, requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

// PIN 은 방금 OTP 를 통과한 세션에서만 정한다 (처음 설정 · 잊어서 다시 설정 모두)
export async function pinSet(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const { pin } = await readJson<{ pin: unknown }>(req)
  const s = await getSettings()
  if (!sess.lastOtpAt || Date.parse(sess.lastOtpAt) + s.pin_set_window_min * 60_000 < Date.now()) {
    throw new ApiError('REAUTH_REQUIRED', { reason: 'otp_required' })
  }
  const problem = checkPin(pin)
  if (problem) throw new ApiError('VALIDATION', { field: 'pin', reason: problem })
  must(await db().from('recipients').update({
    pin_hash: await hashPin(pin as string), pin_set_at: new Date().toISOString(), pin_failed_count: 0, pin_locked_at: null,
  }).eq('id', sess.recipientId), 'pin save')
  await logEvent('pin_set', { recipientId: sess.recipientId })
  const body: PinResponse = { ok: true }
  return json(200, body)
}

export async function pinVerify(req: Request): Promise<Response> {
  const { token, pin } = await readJson<{ token: unknown; pin: unknown }>(req)
  if (checkPin(pin) === 'format') throw new ApiError('VALIDATION', { field: 'pin', reason: 'format' })
  const { link, recipient } = await findBoxLink(token)
  if (!recipient.pin_hash) throw new ApiError('CONFLICT', { reason: 'no_pin' })
  if (recipient.pin_locked_at) throw new ApiError('PIN_LOCKED')
  const s = await getSettings()

  // 비교하기 전에 시도를 먼저 센다. 행이 없으면 그사이 잠겼다
  const rows = must(await db().rpc('pin_try', { p_recipient_id: recipient.id, p_max: s.pin_max_attempts }), 'pin try') as
    { out_failed_count: number; out_locked: boolean; out_pin_hash: string }[]
  const t = rows?.[0]
  if (!t) throw new ApiError('PIN_LOCKED')

  if (!(await verifyPin(pin as string, t.out_pin_hash))) {
    await logEvent('pin_failed', { recipientId: recipient.id })
    if (t.out_locked) throw new ApiError('PIN_LOCKED')
    throw new ApiError('PIN_WRONG', { remaining: Math.max(0, s.pin_max_attempts - t.out_failed_count) })
  }

  must(await db().rpc('pin_success', { p_recipient_id: recipient.id }), 'pin success')
  const setCookie = await createSession(recipient.id, link.id, req, 'pin')
  await db().from('recipients').update({ last_login_at: new Date().toISOString() }).eq('id', recipient.id)
  await logEvent('pin_verified', { recipientId: recipient.id })
  const body: PinResponse = { ok: true }
  return json(200, body, { 'Set-Cookie': setCookie })
}
