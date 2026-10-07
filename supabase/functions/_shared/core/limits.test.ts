import { assertEquals } from '@std/assert'
import { checkForwardLimits } from './limits.ts'

const now = new Date('2026-10-22T05:00:00Z') // 서울 14:00
const settings = { perVoucherDay: 3, sameNumberGapMin: 10, perBoxDayMin: 20 }
const base = { now, voucherToday: 0, boxToday: 0, lastSameNumberAt: null, unusedCount: 3, settings }

Deno.test('한도 안이면 통과', () => assertEquals(checkForwardLimits(base), { ok: true }))
Deno.test('1매당 하루 3회', () => {
  assertEquals(checkForwardLimits({ ...base, voucherToday: 3 }), { ok: false, reason: 'per_voucher_day', retryAt: new Date('2026-10-22T15:00:00Z') })
})
Deno.test('같은 번호 10분 간격', () => {
  const r = checkForwardLimits({ ...base, lastSameNumberAt: new Date('2026-10-22T04:55:00Z') })
  assertEquals(r, { ok: false, reason: 'same_number_gap', retryAt: new Date('2026-10-22T05:05:00Z') })
})
Deno.test('10분 지나면 통과', () => {
  assertEquals(checkForwardLimits({ ...base, lastSameNumberAt: new Date('2026-10-22T04:49:00Z') }), { ok: true })
})
Deno.test('서랍당 하루 max(20, 미사용 매수)', () => {
  assertEquals(checkForwardLimits({ ...base, boxToday: 20 }).ok, false)
  assertEquals(checkForwardLimits({ ...base, boxToday: 20, unusedCount: 25 }).ok, true)
})
