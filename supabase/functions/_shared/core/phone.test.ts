import { assertEquals } from '@std/assert'
import { formatPhone, formatPhoneInput, last4, maskName, maskPhone, normalizePhone } from './phone.ts'

// 아래 두 표는 입력 칸(formatPhoneInput)과 정규화(normalizePhone)를 이어 붙인 시험에서도 함께 쓴다
const VALID: [string, string][] = [
  ['010-1234-5678', '01012345678'],
  ['01012345678', '01012345678'],
  [' 010 1234 5678 ', '01012345678'],
  ['+82 10-1234-5678', '01012345678'],
  ['+821012345678', '01012345678'],
  ['011-123-4567', '0111234567'],
  ['+82 010-1234-5678', '01012345678'],
  ['0082 10 1234 5678', '01012345678'],
]
const INVALID = ['02-123-4567', '010-123', '', 'abc', '010-1234-56789', '0101234567']

Deno.test('normalizePhone: 여러 입력 형식', () => {
  for (const [input, want] of VALID) assertEquals(normalizePhone(input), want, input)
})

Deno.test('normalizePhone: 휴대폰이 아니면 null', () => {
  for (const input of INVALID) assertEquals(normalizePhone(input), null, input)
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

// 붙여넣은 번호가 입력 칸을 거쳐도 서버가 보는 값과 같아야 한다 (Review Focus 4: '+82 10-…' 붙여넣기)
Deno.test('formatPhoneInput 을 거쳐도 normalizePhone 결과가 같다', () => {
  for (const [input] of VALID) assertEquals(normalizePhone(formatPhoneInput(input)), normalizePhone(input), input)
  for (const input of INVALID) {
    // 11자리를 넘는 입력은 입력 칸이 11자리에서 자른다(위 자동 하이픈 시험). 자른 값은 확인 화면에 그대로 크게 보인다.
    if (input.replace(/\D/g, '').length > 11) continue
    assertEquals(normalizePhone(formatPhoneInput(input)), normalizePhone(input), input)
  }
})

Deno.test('formatPhoneInput: 국가번호(+82·0082)를 0으로 바꾼 뒤 자른다', () => {
  assertEquals(formatPhoneInput('+82 10-1234-5678'), '010-1234-5678')
  assertEquals(formatPhoneInput('0082 10 1234 5678'), '010-1234-5678')
  assertEquals(formatPhoneInput('+82 010-1234-5678'), '010-1234-5678')
  assertEquals(formatPhoneInput('+821012345678'), '010-1234-5678')
})
