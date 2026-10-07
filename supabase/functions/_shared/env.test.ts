import { assertEquals } from '@std/assert'
import { cookieSecureDisabled, devOutboxAllowed, isDevEnv } from './env.ts'

Deno.test('isDevEnv: local·preview 만 true, 나머지는 닫힌다', () => {
  const original = Deno.env.get('SEORAP_ENV')
  try {
    for (const [value, expected] of [['local', true], ['preview', true], ['production', false], ['prod', false], ['', false], ['Local', false]] as const) {
      Deno.env.set('SEORAP_ENV', value)
      assertEquals(isDevEnv(), expected, `SEORAP_ENV=${JSON.stringify(value)}`)
    }
    Deno.env.delete('SEORAP_ENV')
    assertEquals(isDevEnv(), false, 'SEORAP_ENV 미설정')
  } finally {
    if (original === undefined) Deno.env.delete('SEORAP_ENV')
    else Deno.env.set('SEORAP_ENV', original)
  }
})

// 가짜 발신함은 로컬이 아니면 함수 비밀값과 같은 X-Seorap-Dev-Key 머리글이 있어야 열린다 (비밀값이 없으면 닫힌다)
Deno.test('devOutboxAllowed: 로컬은 키 없이, 미리보기는 맞는 키로만, 운영은 언제나 닫힘', () => {
  const key = 'k'.repeat(64)
  assertEquals(devOutboxAllowed('local', undefined, null), true, '로컬, 키 없음')
  assertEquals(devOutboxAllowed('preview', undefined, null), false, '미리보기, 비밀값 없음')
  assertEquals(devOutboxAllowed('preview', '', ''), false, '미리보기, 비밀값·머리글 빈 값')
  assertEquals(devOutboxAllowed('preview', undefined, key), false, '미리보기, 비밀값 없이 머리글만')
  assertEquals(devOutboxAllowed('preview', key, null), false, '미리보기, 머리글 없음')
  assertEquals(devOutboxAllowed('preview', key, 'x'.repeat(64)), false, '미리보기, 틀린 키(같은 길이)')
  assertEquals(devOutboxAllowed('preview', key, key.slice(1)), false, '미리보기, 틀린 키(다른 길이)')
  assertEquals(devOutboxAllowed('preview', key, key), true, '미리보기, 맞는 키')
  assertEquals(devOutboxAllowed('production', key, key), false, '운영은 키가 맞아도 닫힘')
  assertEquals(devOutboxAllowed(undefined, key, key), false, 'SEORAP_ENV 미설정')
})

Deno.test('cookieSecureDisabled: Secure 끄기는 SEORAP_ENV=local 에서만 받아 준다', () => {
  assertEquals(cookieSecureDisabled('local', 'false'), true)
  assertEquals(cookieSecureDisabled('local', undefined), false)
  assertEquals(cookieSecureDisabled('preview', 'false'), false)
  assertEquals(cookieSecureDisabled('production', 'false'), false)
  assertEquals(cookieSecureDisabled(undefined, 'false'), false)
})
