import { assert, assertEquals } from '@std/assert'
import { adminDb, BASE, Client, DESKTOP_UA, fastOtp, latestOtp, login, tokenFor } from './helpers.ts'

await fastOtp()

Deno.test('진입: 가린 이름·번호, 기록 없음', async () => {
  const before = (await adminDb().from('otp_challenges').select('id', { count: 'exact', head: true })).count
  const r = await new Client().call('entry', { token: tokenFor('S1') })
  assertEquals(r.status, 200)
  assertEquals(r.body.nameMasked, '홍*동')
  assertEquals(r.body.phoneMasked, '010-****-5678')
  const after = (await adminDb().from('otp_challenges').select('id', { count: 'exact', head: true })).count
  assertEquals(after, before)
})

Deno.test('진입: 형식이 다른 토큰은 LINK_INVALID', async () => {
  const r = await new Client().call('entry', { token: 'short' })
  assertEquals(r.status, 404)
  assertEquals(r.body.error.code, 'LINK_INVALID')
})

Deno.test('진입: 본문이 객체가 아니면(null·배열·문자열·숫자) 422 VALIDATION', async () => {
  for (const body of [null, [], 'text', 5]) {
    const r = await new Client().call('entry', body)
    assertEquals(r.status, 422, `body=${JSON.stringify(body)}`)
    assertEquals(r.body.error.code, 'VALIDATION')
  }
  // 깨진 JSON 도 같은 응답
  const res = await fetch(`${BASE}/entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' })
  assertEquals(res.status, 422)
  assertEquals((await res.json()).error.code, 'VALIDATION')
})

Deno.test('POST 본문은 Content-Type 이 application/json 일 때만 받는다', async () => {
  const body = JSON.stringify({ token: tokenFor('S1') })
  for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/x-www-form-urlencoded' }, {}] as Record<string, string>[]) {
    // 바이트 본문은 fetch 가 Content-Type 을 스스로 붙이지 않는다 (머리글 없음 경우)
    const res = await fetch(`${BASE}/entry`, { method: 'POST', headers, body: new TextEncoder().encode(body) })
    const r = await res.json()
    assertEquals([res.status, r.error?.code, r.error?.extra?.field], [422, 'VALIDATION', 'contentType'], JSON.stringify(headers))
  }
  const ok = await fetch(`${BASE}/entry`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body })
  assertEquals(ok.status, 200)
  await ok.body?.cancel()
})

const cookieAttrs = (setCookie: string) => setCookie.split(';').slice(1).map((a) => a.trim())

Deno.test('OTP: 맞으면 세션 쿠키 (HttpOnly · SameSite=Lax · Path=/ · Max-Age, 로컬은 Secure 없음)', async () => {
  const c = await login('S1', '5678')
  assert(c.cookie.startsWith('seorap_sid='))
  const attrs = cookieAttrs(c.setCookie)
  assert(attrs.includes('HttpOnly'), c.setCookie)
  assert(attrs.includes('SameSite=Lax'), c.setCookie)
  assert(attrs.includes('Path=/'), c.setCookie)
  assert(attrs.some((a) => /^Max-Age=\d+$/.test(a)), c.setCookie)
  // 로컬(SEORAP_ENV=local, SEORAP_COOKIE_SECURE=false)에서만 Secure 가 빠진다
  assertEquals(attrs.some((a) => a.toLowerCase() === 'secure'), false, c.setCookie)
})

Deno.test('OTP: PC 는 창을 닫으면 끝나는 쿠키 (Max-Age 없음)', async () => {
  const c = await login('S1', '5678', DESKTOP_UA)
  const attrs = cookieAttrs(c.setCookie)
  assert(attrs.includes('HttpOnly'), c.setCookie)
  assertEquals(attrs.some((a) => a.startsWith('Max-Age=')), false, c.setCookie)
})

Deno.test('세션: 로그인하면 행이 생기고, 로그아웃하면 폐기되며, 같은 쿠키로 다시 폐기되지 않는다', async () => {
  const sessions = async () => (await adminDb().from('customer_sessions').select('id_hash, recipient_id, revoked_at')).data ?? []
  const before = new Set((await sessions()).map((r) => r.id_hash))
  const c = await login('S1', '5678')
  const cookie = c.cookie

  // 로그인 직후: 이번 로그인으로 생긴 행이 정확히 하나, 살아 있고, S1 받는 사람 것
  const fresh = (await sessions()).filter((r) => !before.has(r.id_hash))
  assertEquals(fresh.length, 1)
  const row = fresh[0]
  assertEquals(row.revoked_at, null)
  const owner = (await adminDb().from('recipients').select('phone_last4').eq('id', row.recipient_id).single()).data
  assertEquals(owner?.phone_last4, '5678')

  // 로그아웃: 200, 쿠키 삭제, 행에 revoked_at·'logout'
  const out = await c.call('logout', {})
  assertEquals(out.status, 200)
  const revoked = (await adminDb().from('customer_sessions').select('revoked_at, revoked_reason').eq('id_hash', row.id_hash).single()).data!
  assert(revoked.revoked_at !== null)
  assertEquals(revoked.revoked_reason, 'logout')

  // 폐기된 쿠키로 다시 로그아웃: 요청 자체는 200(쿠키만 지운다)이지만, 폐기된 세션을 인정하지 않으므로
  // 폐기 시각이 바뀌지 않는다 (인정했다면 update 가 다시 돌아 revoked_at 이 새 시각이 된다)
  const again = new Client()
  again.cookie = cookie
  assertEquals((await again.call('logout', {})).status, 200)
  const after = (await adminDb().from('customer_sessions').select('revoked_at, revoked_reason').eq('id_hash', row.id_hash).single()).data!
  assertEquals(after.revoked_at, revoked.revoked_at)
  assertEquals(after.revoked_reason, 'logout')

  // 쿠키가 아예 없어도 200
  assertEquals((await new Client().call('logout', {})).status, 200)
})

Deno.test('OTP: 새 번호를 받으면 이전 번호는 안 된다 (otp_old_code_rejected)', async () => {
  const c = new Client()
  // 두 요청이 모두 성공해야 비교가 의미 있다 (실패한 요청 뒤에 우연히 통과하는 것을 막는다)
  assertEquals((await c.call('otp/request', { token: tokenFor('S1') })).status, 200)
  const oldCode = await latestOtp('5678')
  assertEquals((await c.call('otp/request', { token: tokenFor('S1') })).status, 200)
  const newCode = await latestOtp('5678')
  if (oldCode === newCode) return // 같은 숫자가 나올 확률 100만분의 1
  const r = await c.call('otp/verify', { token: tokenFor('S1'), code: oldCode })
  assertEquals(r.body.error.code, 'OTP_WRONG')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: newCode })).status, 200)
})

Deno.test('OTP: 5번 틀리면 잠기고, 잠긴 동안 맞는 번호도 거부', async () => {
  const c = new Client()
  await c.call('otp/request', { token: tokenFor('S1') })
  const code = await latestOtp('5678')
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 4; i++) assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: wrong })).body.error.code, 'OTP_WRONG')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: wrong })).body.error.code, 'OTP_LOCKED')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code })).body.error.code, 'OTP_LOCKED')
  // 다음 테스트를 위해 잠금 풀기
  await adminDb().from('otp_challenges').update({ locked_until: null }).not('locked_until', 'is', null)
})

Deno.test('dev/outbox: 로컬에서는 읽힌다', async () => {
  const r = await new Client().call('dev/outbox')
  assertEquals(r.status, 200)
  assert(Array.isArray(r.body.items))
})
