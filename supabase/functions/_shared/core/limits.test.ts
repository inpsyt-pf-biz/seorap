import { assertEquals } from '@std/assert'
import { checkForwardLimits, otpRetryAt } from './limits.ts'

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
  assertEquals(checkForwardLimits({ ...base, boxToday: 20 }), { ok: false, reason: 'per_box_day', retryAt: new Date('2026-10-22T15:00:00Z') })
  assertEquals(checkForwardLimits({ ...base, boxToday: 20, unusedCount: 25 }).ok, true)
})
Deno.test('여러 한도 동시 위반: 가장 늦은 retryAt 선택', () => {
  const now2 = new Date('2026-10-22T15:30:00Z') // 서울 00:30
  const r = checkForwardLimits({ now: now2, voucherToday: 0, boxToday: 20, lastSameNumberAt: new Date('2026-10-22T15:25:00Z'), unusedCount: 3, settings })
  assertEquals(r, { ok: false, reason: 'per_box_day', retryAt: new Date('2026-10-23T15:00:00Z') })
})
Deno.test('정확히 10분 경과하면 통과', () => {
  assertEquals(checkForwardLimits({ ...base, lastSameNumberAt: new Date('2026-10-22T04:50:00Z') }), { ok: true })
})

// OTP 요청 한도: 걸린 창(1시간·24시간)에서 가장 오래된 요청이 창을 벗어나는 시각을 알려 준다
const otpNow = new Date('2026-10-22T05:00:00Z')
const ago = (min: number) => new Date(otpNow.getTime() - min * 60_000)
const otp = (createdAt: Date[], perHour = 5, perDay = 10) => otpRetryAt({ now: otpNow, createdAt, perHour, perDay })

Deno.test('otpRetryAt: 한도 안이면 null', () => {
  assertEquals(otp([ago(1), ago(2), ago(3), ago(4)]), null)
})
Deno.test('otpRetryAt: 1시간 한도는 그 창에서 가장 오래된 요청 + 1시간', () => {
  // 70분 전 요청은 1시간 창 밖이라 세지 않는다
  assertEquals(otp([ago(70), ago(50), ago(40), ago(30), ago(20), ago(10)]), new Date(ago(50).getTime() + 3_600_000))
})
Deno.test('otpRetryAt: 하루 한도는 그 창에서 가장 오래된 요청 + 24시간', () => {
  const day = [ago(23 * 60), ...Array.from({ length: 9 }, (_, i) => ago(120 + i * 60))]
  assertEquals(otp(day), new Date(ago(23 * 60).getTime() + 86_400_000))
})
Deno.test('otpRetryAt: 둘 다 걸리면 더 늦은 시각', () => {
  const both = [ago(20 * 60), ago(19 * 60), ago(18 * 60), ago(17 * 60), ago(16 * 60), ago(50), ago(40), ago(30), ago(20), ago(10)]
  assertEquals(otp(both), new Date(ago(20 * 60).getTime() + 86_400_000))
})
Deno.test('otpRetryAt: 한도보다 많이 쌓였으면 그 수만큼 빠져야 풀린다', () => {
  // 한도 5에 6건: 가장 오래된 두 건이 빠져야 4건이 되어 다시 받을 수 있다
  assertEquals(otp([ago(55), ago(50), ago(40), ago(30), ago(20), ago(10)]), new Date(ago(50).getTime() + 3_600_000))
})
