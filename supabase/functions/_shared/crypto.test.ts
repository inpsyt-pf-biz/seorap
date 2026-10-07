import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from '@std/assert'

// F2: Known-answer test — keep raw key bytes for independent verification
const hmacKeyBytes = crypto.getRandomValues(new Uint8Array(32))
const hmacKeyB64 = btoa(String.fromCharCode(...hmacKeyBytes))
const k = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))

Deno.env.set('SEORAP_HMAC_KEY', hmacKeyB64)
Deno.env.set('SEORAP_ENC_KEY_A', k())
Deno.env.set('SEORAP_ENC_KEY_B', k())
const { decrypt, encrypt, hmac, phoneHash, randomToken, sixDigits, decodeKey } = await import('./crypto.ts')

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

// F1: Key length validation
Deno.test('decodeKey: 16바이트 키는 거부', () => {
  const short = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  assertThrows(() => decodeKey('K', short))
})

Deno.test('decodeKey: 잘못된 base64 "changeme" 거부', () => {
  assertThrows(() => decodeKey('K', 'changeme'))
})

Deno.test('decodeKey: 잘못된 base64 "!!!" 거부', () => {
  assertThrows(() => decodeKey('K', '!!!'))
})

Deno.test('decodeKey: 32바이트 키 수락', () => {
  const valid = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const bytes = decodeKey('K', valid)
  assertEquals(bytes.length, 32)
})

Deno.test('decodeKey 에러 메시지: 환경변수명 포함, 값 미포함', () => {
  const testKey = 'secret123'
  try {
    decodeKey('MYKEY', testKey)
  } catch (e) {
    if (e instanceof Error) {
      assert(e.message.includes('MYKEY'), 'error should contain key name')
      assert(!e.message.includes(testKey), 'error should not contain the input value')
    }
  }
})

// F2: Known-answer HMAC test
Deno.test('hmac: 기지값 검증 (독립 구현 대조)', async () => {
  const key = await crypto.subtle.importKey('raw', hmacKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('x')))
  const expected = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  assertEquals(await hmac('x'), expected)
})

// F3 & F4: Tamper and malformed payload tests
Deno.test('decrypt: 암호문 변조 거부', async () => {
  const c = await encrypt('A', 'abc')
  const parts = c.split('.')
  if (parts.length === 3) {
    const tampered = parts[0] + '.' + parts[1] + '.' + (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
    await assertRejects(() => decrypt('A', tampered))
  }
})

Deno.test('decrypt: 빈 문자열 거부', async () => {
  await assertRejects(() => decrypt('A', ''))
})

Deno.test('decrypt: 잘못된 버전 "v2.a.b" 거부', async () => {
  await assertRejects(() => decrypt('A', 'v2.a.b'))
})

Deno.test('decrypt: 불완전한 페이로드 "v1.a" 거부', async () => {
  await assertRejects(() => decrypt('A', 'v1.a'))
})

Deno.test('decrypt: 초과 부분 "v1.a.b.junk" 거부', async () => {
  await assertRejects(() => decrypt('A', 'v1.a.b.junk'))
})
