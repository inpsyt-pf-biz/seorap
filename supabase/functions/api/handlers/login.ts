import type { PinResponse } from '../../_shared/core/apiTypes.ts'
import { LOGIN_IP_MAX, LOGIN_IP_WINDOW_MIN, clientIp, readLoginInput, sameName } from '../../_shared/core/login.ts'
import { decrypt, hashPin, hmac, phoneHash, verifyPin } from '../../_shared/crypto.ts'
import { db, must, mustCount } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { createSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

// 이름 + 휴대전화번호 + 비밀번호 로그인 (11-10, 01-plan §0). 알림톡 링크 없이 메인·로그아웃 화면에서 들어온다.
// 지키는 것:
// - 무엇이 틀렸든(없는 번호·다른 이름·틀린 비밀번호·비밀번호 없음·잠김) 답은 LOGIN_FAILED 하나. 남은 횟수도 말하지 않는다
// - 없는 번호여도 비밀번호 비교를 한 번 해서 걸리는 시간을 맞춘다
// - 번호가 맞으면 이름이 틀려도 틀린 횟수로 센다(비밀번호 입장과 같은 pin_try, 5번이면 잠김 → 알림톡 링크 + 문자 인증으로만 푼다)
// - 같은 접속 주소에서 LOGIN_IP_WINDOW_MIN 분 안에 LOGIN_IP_MAX 번 틀리면 RATE_LIMITED

let dummy: Promise<string> | null = null
const dummyHash = () => (dummy ??= hashPin('000000'))

type Recipient = { id: string; name_enc: string | null; status: string; pin_hash: string | null; pin_locked_at: string | null }

export async function login(req: Request): Promise<Response> {
  const input = readLoginInput(await readJson<{ name?: unknown; phone?: unknown; pin?: unknown }>(req))
  if (!input) throw new ApiError('VALIDATION', { reason: 'format' })

  const ip = clientIp(req.headers)
  const ipHash = ip ? await hmac(`ip:${ip}`) : null
  if (ipHash) {
    const since = new Date(Date.now() - LOGIN_IP_WINDOW_MIN * 60_000).toISOString()
    const failures = mustCount(
      await db().from('events').select('id', { count: 'exact', head: true }).eq('name', 'login_failed').eq('ip_hash', ipHash).gte('at', since),
      'login ip count',
    )
    if (failures >= LOGIN_IP_MAX) throw new ApiError('RATE_LIMITED', { reason: 'login_ip' })
  }

  const fail = async (recipientId?: string): Promise<never> => {
    await logEvent('login_failed', { recipientId, ipHash })
    throw new ApiError('LOGIN_FAILED')
  }

  const rec = must(
    await db().from('recipients').select('id, name_enc, status, pin_hash, pin_locked_at').eq('phone_hash', await phoneHash(input.phone)).maybeSingle(),
    'login recipient',
  ) as Recipient | null
  if (!rec || rec.status !== 'active' || !rec.pin_hash || rec.pin_locked_at) {
    await verifyPin(input.pin, await dummyHash())
    return fail(rec?.id)
  }

  // 비교하기 전에 시도를 먼저 센다 (동시에 여러 번 넣어도 한도를 넘지 못하게). 행이 없으면 그사이 잠겼다
  const s = await getSettings()
  const rows = must(await db().rpc('pin_try', { p_recipient_id: rec.id, p_max: s.pin_max_attempts }), 'login pin try') as
    { out_failed_count: number; out_locked: boolean; out_pin_hash: string }[]
  const t = rows?.[0]
  if (!t) {
    await verifyPin(input.pin, await dummyHash())
    return fail(rec.id)
  }
  const pinOk = await verifyPin(input.pin, t.out_pin_hash)
  const nameOk = rec.name_enc ? sameName(await decrypt('A', rec.name_enc), input.name) : false
  if (!pinOk || !nameOk) return fail(rec.id)

  // 세션은 서랍 링크에 묶인다. 살아 있는 서랍 링크 중 가장 최근 것을 쓴다 (모두 막혔으면 들어올 수 없다)
  const link = must(
    await db().from('access_links').select('id').eq('recipient_id', rec.id).eq('link_type', 'box').is('revoked_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    'login link',
  ) as { id: string } | null
  if (!link) return fail(rec.id)

  must(await db().rpc('pin_success', { p_recipient_id: rec.id }), 'login pin success')
  const setCookie = await createSession(rec.id, link.id, req, 'pin')
  await db().from('recipients').update({ last_login_at: new Date().toISOString() }).eq('id', rec.id)
  await logEvent('login_verified', { recipientId: rec.id, ipHash })
  const body: PinResponse = { ok: true }
  return json(200, body, { 'Set-Cookie': setCookie })
}
