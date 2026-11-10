import { assertEquals } from '@std/assert'
import { clientIp, readLoginInput, sameName } from './login.ts'

Deno.test('이름 비교: 띄어쓰기·대소문자·조합형 차이는 같은 이름으로 본다', () => {
  assertEquals(sameName('홍길동', '홍 길동 '), true)
  assertEquals(sameName('Kim Minji', 'kimminji'), true)
  assertEquals(sameName('홍길동'.normalize('NFD'), '홍길동'), true)
  assertEquals(sameName('홍길동', '홍길순'), false)
  assertEquals(sameName('홍길동', ''), false)
})

Deno.test('로그인 입력: 이름·번호·비밀번호 6자리가 모두 있어야 하고 번호는 숫자로 바꾼다', () => {
  assertEquals(readLoginInput({ name: ' 홍길동 ', phone: '010-1234-5678', pin: '482913' }), { name: '홍길동', phone: '01012345678', pin: '482913' })
  assertEquals(readLoginInput({ name: '', phone: '010-1234-5678', pin: '482913' }), null)
  assertEquals(readLoginInput({ name: '홍길동', phone: '02-123-4567', pin: '482913' }), null)
  assertEquals(readLoginInput({ name: '홍길동', phone: '01012345678', pin: '4829' }), null)
  assertEquals(readLoginInput({ name: '홍길동', phone: 1012345678, pin: '482913' }), null)
  assertEquals(readLoginInput({ name: 'a'.repeat(51), phone: '01012345678', pin: '482913' }), null)
})

Deno.test('접속 주소: 프록시가 붙인 목록의 첫 주소, 없으면 x-real-ip, 둘 다 없으면 없음', () => {
  assertEquals(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 76.76.21.21' })), '203.0.113.7')
  assertEquals(clientIp(new Headers({ 'x-real-ip': '203.0.113.8' })), '203.0.113.8')
  assertEquals(clientIp(new Headers()), null)
})
