import { assert, assertEquals, assertNotEquals, assertRejects } from '@std/assert'

const k = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
Deno.env.set('SEORAP_HMAC_KEY', k())
Deno.env.set('SEORAP_ENC_KEY_A', k())
Deno.env.set('SEORAP_ENC_KEY_B', k())
const { decrypt, encrypt, hmac, phoneHash, randomToken, sixDigits } = await import('./crypto.ts')

Deno.test('hmac: 같은 입력은 같은 값, 64자 hex', async () => {
  const a = await hmac('x')
  assertEquals(a, await hmac('x'))
  assertNotEquals(a, await hmac('y'))
  assert(/^[0-9a-f]{64}$/.test(a))
})

Deno.test('phoneHash = hmac(phone:번호)', async () => {
  assertEquals(await phoneHash('01012345678'), await hmac('phone:01012345678'))
})

Deno.test('encrypt/decrypt 왕복, 매번 다른 암호문', async () => {
  const c1 = await encrypt('A', '홍길동')
  const c2 = await encrypt('A', '홍길동')
  assertNotEquals(c1, c2)
  assert(c1.startsWith('v1.'))
  assertEquals(await decrypt('A', c1), '홍길동')
})

Deno.test('다른 키로는 풀리지 않는다', async () => {
  const c = await encrypt('A', 'TEST-1')
  await assertRejects(() => decrypt('B', c))
})

Deno.test('randomToken: 32자 영문·숫자, 겹치지 않음', () => {
  const a = randomToken()
  assert(/^[A-Za-z0-9]{32}$/.test(a))
  assertNotEquals(a, randomToken())
})

Deno.test('sixDigits: 6자리 숫자', () => {
  for (let i = 0; i < 50; i++) assert(/^\d{6}$/.test(sixDigits()))
})
