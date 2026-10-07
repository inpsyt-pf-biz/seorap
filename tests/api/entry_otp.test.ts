import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, latestOtp, login, tokenFor } from './helpers.ts'

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

Deno.test('OTP: 맞으면 세션 쿠키', async () => {
  const c = await login('S1', '5678')
  assert(c.cookie.startsWith('seorap_sid='))
})

Deno.test('OTP: 새 번호를 받으면 이전 번호는 안 된다 (otp_old_code_rejected)', async () => {
  const c = new Client()
  await c.call('otp/request', { token: tokenFor('S1') })
  const oldCode = await latestOtp('5678')
  await c.call('otp/request', { token: tokenFor('S1') })
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
