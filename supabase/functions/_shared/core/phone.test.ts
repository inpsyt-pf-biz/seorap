import { assertEquals } from '@std/assert'
import { formatPhone, formatPhoneInput, last4, maskName, maskPhone, normalizePhone } from './phone.ts'

Deno.test('normalizePhone: 여러 입력 형식', () => {
  assertEquals(normalizePhone('010-1234-5678'), '01012345678')
  assertEquals(normalizePhone('01012345678'), '01012345678')
  assertEquals(normalizePhone(' 010 1234 5678 '), '01012345678')
  assertEquals(normalizePhone('+82 10-1234-5678'), '01012345678')
  assertEquals(normalizePhone('+821012345678'), '01012345678')
  assertEquals(normalizePhone('011-123-4567'), '0111234567')
})

Deno.test('normalizePhone: 휴대폰이 아니면 null', () => {
  assertEquals(normalizePhone('02-123-4567'), null)
  assertEquals(normalizePhone('010-123'), null)
  assertEquals(normalizePhone(''), null)
  assertEquals(normalizePhone('abc'), null)
  assertEquals(normalizePhone('010-1234-56789'), null)
})

Deno.test('formatPhone·maskPhone·last4', () => {
  assertEquals(formatPhone('01012345678'), '010-1234-5678')
  assertEquals(formatPhone('0111234567'), '011-123-4567')
  assertEquals(maskPhone('01012345678'), '010-****-5678')
  assertEquals(last4('01012345678'), '5678')
})

Deno.test('maskName', () => {
  assertEquals(maskName('홍길동'), '홍*동')
  assertEquals(maskName('남궁민수'), '남**수')
  assertEquals(maskName('이몽'), '이*')
  assertEquals(maskName('김'), '김')
  assertEquals(maskName(' 홍길동 '), '홍*동')
})

Deno.test('formatPhoneInput: 입력 중 자동 하이픈', () => {
  assertEquals(formatPhoneInput('010'), '010')
  assertEquals(formatPhoneInput('0101'), '010-1')
  assertEquals(formatPhoneInput('0101234'), '010-1234')
  assertEquals(formatPhoneInput('01012345678'), '010-1234-5678')
  assertEquals(formatPhoneInput('010-1234-567890'), '010-1234-5678')
})
