import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login as otpLogin } from './helpers.ts'

await fastOtp()

// 이름 + 휴대전화번호 + 비밀번호 로그인 (11-10). 시드 S2 김철수(01055556666)의 비밀번호를 이 파일 안에서 정하고 지운다
const SC = 'S2'
const NAME = '김철수'
const PHONE = '010-5555-6666'
const LAST4 = '6666'
const PIN = '135792'
const recipientId = async () =>
  (await adminDb().from('recipients').select('id').eq('phone_last4', LAST4).single()).data!.id as string
const resetPin = async () => {
  await adminDb().from('recipients').update({ pin_hash: null, pin_set_at: null, pin_failed_count: 0, pin_locked_at: null })
    .eq('id', await recipientId())
}
const setPin = async () => {
  await resetPin()
  const c = await otpLogin(SC, LAST4)
  assertEquals((await c.call('pin/set', { pin: PIN })).status, 200)
}
// 시험마다 다른 접속 주소를 써서 주소별 한도가 서로 섞이지 않게 한다
const ipClient = () => {
  const c = new Client()
  c.headers = { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250) + 1}, 10.0.0.1` }
  return c
}

Deno.test('로그인: 이름·번호·비밀번호가 맞으면 문자 없이 세션, 서랍을 열 수 있다', async () => {
  await setPin()
  const sms = async () => (await adminDb().from('dev_outbox').select('id', { count: 'exact', head: true }).eq('to_phone_last4', LAST4)).count
  const before = await sms()
  const c = ipClient()
  // 띄어쓰기가 달라도 같은 이름
  const r = await c.call('login', { name: '김 철수', phone: PHONE, pin: PIN })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assert(c.cookie.startsWith('seorap_sid='))
  assertEquals((await c.call('box')).status, 200)
  assertEquals(await sms(), before)
})

Deno.test('로그인: 무엇이 틀렸든 같은 답이고, 남은 횟수도 알려 주지 않는다', async () => {
  await setPin()
  const cases = [
    { name: '김영희', phone: PHONE, pin: PIN }, // 다른 이름
    { name: NAME, phone: '010-9999-0000', pin: PIN }, // 없는 번호
    { name: NAME, phone: PHONE, pin: '246810' }, // 틀린 비밀번호
  ]
  const bodies = []
  for (const body of cases) {
    const r = await ipClient().call('login', body)
    assertEquals(r.status, 401, JSON.stringify(r.body))
    bodies.push(JSON.stringify(r.body))
  }
  assertEquals(new Set(bodies).size, 1)
  assertEquals(JSON.parse(bodies[0]), { error: { code: 'LOGIN_FAILED', extra: {} } })
  // 비밀번호를 정하지 않은 서랍도 같은 답
  await resetPin()
  const none = await ipClient().call('login', { name: NAME, phone: PHONE, pin: PIN })
  assertEquals(JSON.stringify(none.body), bodies[0])
})

Deno.test('로그인: 번호가 맞으면 이름이 틀려도 틀린 횟수로 세고, 5번이면 잠겨 맞게 넣어도 들어올 수 없다', async () => {
  await setPin()
  for (let i = 0; i < 5; i++) await ipClient().call('login', { name: '김영희', phone: PHONE, pin: PIN })
  const r = await ipClient().call('login', { name: NAME, phone: PHONE, pin: PIN })
  assertEquals(r.body.error?.code, 'LOGIN_FAILED')
  const row = (await adminDb().from('recipients').select('pin_locked_at').eq('id', await recipientId()).single()).data
  assert(row?.pin_locked_at)
  await resetPin()
})

Deno.test('로그인: 모양이 틀린 입력은 VALIDATION', async () => {
  for (const body of [{ name: '', phone: PHONE, pin: PIN }, { name: NAME, phone: '1234', pin: PIN }, { name: NAME, phone: PHONE, pin: '1357' }]) {
    const r = await ipClient().call('login', body)
    assertEquals([r.status, r.body.error?.code], [422, 'VALIDATION'], JSON.stringify(body))
  }
})

Deno.test('로그인: 같은 접속 주소에서 30번 틀리면 잠시 막고, 다른 주소는 그대로', async () => {
  await setPin()
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`
  const c = new Client()
  c.headers = { 'x-forwarded-for': ip }
  // 없는 번호로 틀린다 (S2 의 틀린 횟수를 건드리지 않는다)
  for (let i = 0; i < 30; i++) {
    const r = await c.call('login', { name: NAME, phone: `010-7777-${String(1000 + i)}`, pin: PIN })
    assertEquals(r.body.error?.code, 'LOGIN_FAILED')
  }
  const blocked = await c.call('login', { name: NAME, phone: PHONE, pin: PIN })
  assertEquals([blocked.status, blocked.body.error?.code], [429, 'RATE_LIMITED'])
  const other = await ipClient().call('login', { name: NAME, phone: PHONE, pin: PIN })
  assertEquals(other.status, 200, JSON.stringify(other.body))
})
