import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login, tokenFor } from './helpers.ts'

await fastOtp()

// PIN 칸은 이 파일만 바꾼다. 다른 파일은 OTP 로 들어오므로 S2 의 PIN 상태와 무관하다
const SC = 'S2'
const LAST4 = '6666'
const recipientId = async () =>
  (await adminDb().from('recipients').select('id').eq('phone_last4', LAST4).single()).data!.id as string
const resetPin = async () => {
  await adminDb().from('recipients').update({ pin_hash: null, pin_set_at: null, pin_failed_count: 0, pin_locked_at: null })
    .eq('id', await recipientId())
}
const setPinViaOtp = async (pin: string) => {
  const c = await login(SC, LAST4)
  const r = await c.call('pin/set', { pin })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  return c
}

Deno.test('PIN: 처음에는 없고, OTP 직후에 정하면 진입이 PIN 을 알려 준다', async () => {
  await resetPin()
  const before = await new Client().call('entry', { token: tokenFor(SC) })
  assertEquals([before.body.hasPin, before.body.pinLocked], [false, false])
  const c = await setPinViaOtp('135792')
  assertEquals((await c.call('box')).body.pinSet, true)
  const after = await new Client().call('entry', { token: tokenFor(SC) })
  assertEquals([after.body.hasPin, after.body.pinLocked], [true, false])
})

Deno.test('PIN: 맞으면 문자 없이 세션, 서랍을 열 수 있다', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  const sms = async () => (await adminDb().from('dev_outbox').select('id', { count: 'exact', head: true }).eq('to_phone_last4', LAST4)).count
  const before = await sms()
  const c = new Client()
  const r = await c.call('pin/verify', { token: tokenFor(SC), pin: '135792' })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assert(c.cookie.startsWith('seorap_sid='))
  assertEquals((await c.call('box')).status, 200)
  assertEquals(await sms(), before)
})

Deno.test('PIN: 형식이 틀리거나 쉬운 PIN 은 정할 수 없다', async () => {
  await resetPin()
  const c = await login(SC, LAST4)
  for (const [pin, reason] of [['12345', 'format'], ['111111', 'weak'], ['123456', 'weak'], [123456, 'format']] as const) {
    const r = await c.call('pin/set', { pin })
    assertEquals([r.status, r.body.error?.code, r.body.error?.extra?.reason], [422, 'VALIDATION', reason], String(pin))
  }
})

Deno.test('PIN: PIN 으로 들어온 세션에서는 PIN 을 바꿀 수 없다 (OTP 직후만)', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  const c = new Client()
  await c.call('pin/verify', { token: tokenFor(SC), pin: '135792' })
  const r = await c.call('pin/set', { pin: '246810' })
  assertEquals([r.status, r.body.error?.code], [401, 'REAUTH_REQUIRED'])
})

Deno.test('PIN: 틀리면 남은 횟수, 5번째에 잠기고 잠긴 뒤에는 맞는 PIN 도 거부', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  for (let i = 1; i <= 4; i++) {
    const r = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '000001' })
    assertEquals([r.status, r.body.error?.code, r.body.error?.extra?.remaining], [400, 'PIN_WRONG', 5 - i])
  }
  const fifth = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '000001' })
  assertEquals([fifth.status, fifth.body.error?.code], [423, 'PIN_LOCKED'])
  const right = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '135792' })
  assertEquals([right.status, right.body.error?.code], [423, 'PIN_LOCKED'])
  assertEquals((await new Client().call('entry', { token: tokenFor(SC) })).body.pinLocked, true)
})

Deno.test('PIN: 잠겨도 OTP 로 들어와 새 PIN 을 정하면 풀린다', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  for (let i = 0; i < 5; i++) await new Client().call('pin/verify', { token: tokenFor(SC), pin: '000001' })
  await setPinViaOtp('246810')
  const r = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '246810' })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  const old = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '135792' })
  assertEquals(old.body.error?.code, 'PIN_WRONG')
})

Deno.test('PIN: 동시에 여러 번 넣어도 5번 넘게 비교하지 않는다', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  const rs = await Promise.all(Array.from({ length: 12 }, () => new Client().call('pin/verify', { token: tokenFor(SC), pin: '000001' })))
  assertEquals(rs.filter((r) => r.body.error?.code === 'PIN_WRONG').length, 4)
  assertEquals(rs.filter((r) => r.body.error?.code === 'PIN_LOCKED').length, 8)
})

Deno.test('PIN: 정하지 않은 서랍에 PIN 을 넣으면 CONFLICT, 틀린 토큰은 LINK_INVALID', async () => {
  await resetPin()
  const r = await new Client().call('pin/verify', { token: tokenFor(SC), pin: '135792' })
  assertEquals([r.status, r.body.error?.code, r.body.error?.extra?.reason], [409, 'CONFLICT', 'no_pin'])
  const bad = await new Client().call('pin/verify', { token: 'x'.repeat(32), pin: '135792' })
  assertEquals(bad.body.error?.code, 'LINK_INVALID')
})

Deno.test('PIN: DB 에 원문이 없다', async () => {
  await resetPin()
  await setPinViaOtp('135792')
  const row = (await adminDb().from('recipients').select('pin_hash').eq('id', await recipientId()).single()).data
  assert(row?.pin_hash?.startsWith('v1.'))
  assert(!row?.pin_hash?.includes('135792'))
})
