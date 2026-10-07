import { assertEquals } from '@std/assert'
import { isDevEnv } from './env.ts'

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
