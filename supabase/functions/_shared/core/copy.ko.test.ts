import { assertEquals } from '@std/assert'
import { copy, t } from './copy.ko.ts'

Deno.test('t: 변수 채우기', () => {
  assertEquals(t('box.title', { name: '홍길동' }), '홍길동님의 서랍')
  assertEquals(t('line.unit', { n: 2, k: 1 }), '2매 중 1번째')
})

Deno.test('t: 없는 변수는 자리 그대로', () => {
  assertEquals(t('box.title'), '{name}님의 서랍')
})

Deno.test('명세 §10 필수 키가 모두 있다', () => {
  const required = [
    'otp.sms', 'entry.title', 'entry.send', 'otp.wrong', 'otp.expired', 'otp.locked',
    'box.title', 'box.group', 'line.unit', 'forward.confirm', 'forward.self', 'forward.night',
    'forward.direct.warn', 'history.line', 'maintenance',
  ]
  for (const k of required) assertEquals(k in copy, true, k)
})

Deno.test('문구에 엠대시가 없다', () => {
  for (const [k, v] of Object.entries(copy)) assertEquals(v.includes('—'), false, k)
})
