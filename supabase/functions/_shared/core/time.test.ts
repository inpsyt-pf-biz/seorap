import { assertEquals } from '@std/assert'
import { formatKstDate, formatKstDateTime, formatKstMonthDay, isNightKst, kstDayStart, nextKstMidnight } from './time.ts'

Deno.test('자정 직후 주문의 구매일 (Review Focus 2)', () => {
  // 2026-10-22T15:30Z = 서울 10-23 00:30
  assertEquals(formatKstDate('2026-10-22T15:30:00Z'), '2026-10-23')
  assertEquals(formatKstDateTime('2026-10-22T15:30:00Z'), '2026-10-23 00:30')
  assertEquals(formatKstMonthDay('2026-10-22T15:30:00Z'), '10-23')
})

Deno.test('밤 시간 판정 21~08시', () => {
  assertEquals(isNightKst(new Date('2026-10-22T12:00:00Z')), true)   // 21:00
  assertEquals(isNightKst(new Date('2026-10-22T22:59:00Z')), true)   // 07:59
  assertEquals(isNightKst(new Date('2026-10-22T23:00:00Z')), false)  // 08:00
  assertEquals(isNightKst(new Date('2026-10-22T05:00:00Z')), false)  // 14:00
})

Deno.test('하루 시작과 다음 자정', () => {
  const d = new Date('2026-10-22T05:00:00Z') // 서울 14:00
  assertEquals(kstDayStart(d).toISOString(), '2026-10-21T15:00:00.000Z')
  assertEquals(nextKstMidnight(d).toISOString(), '2026-10-22T15:00:00.000Z')
})
