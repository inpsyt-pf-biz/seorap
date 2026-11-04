import { assertEquals } from '@std/assert'
import { bookingOf, bookingWhen, opensTests, testDueDay, type CounselSessionRow } from './counselBooking.ts'

const P = '00000000-0000-4000-8000-000000000001'
const row = (o: Partial<CounselSessionRow>): CounselSessionRow =>
  ({ purchase_id: P, seq: 1, status: 'unassigned', scheduled_at: null, center_name: null, ...o })

Deno.test('예약 상태: 회차가 없거나 배정·요청 단계면 대기', () => {
  assertEquals(bookingOf([]), { state: 'waiting', scheduledAt: null, centerName: null })
  assertEquals(bookingOf([row({})]).state, 'waiting')
  // 센터에 배정(예약 요청)됐어도 고객에게는 아직 센터 이름을 보이지 않는다
  assertEquals(bookingOf([row({ status: 'requested', center_name: '마음숲 상담센터' })]), { state: 'waiting', scheduledAt: null, centerName: null })
  assertEquals(bookingOf([row({ status: 'cancelled' }), row({ seq: 2, status: 'unable', center_name: 'X' })]).state, 'waiting')
})

Deno.test('예약 상태: 확정된 회차가 있으면 확정, 여럿이면 가장 이른 일시', () => {
  const b = bookingOf([
    row({ seq: 1, status: 'confirmed', scheduled_at: '2026-12-03T05:00:00Z', center_name: '가' }),
    row({ seq: 2, status: 'confirmed', scheduled_at: '2026-11-26T05:00:00Z', center_name: '나' }),
  ])
  assertEquals(b, { state: 'confirmed', scheduledAt: '2026-11-26T05:00:00Z', centerName: '나' })
})

Deno.test('예약 상태: 상담을 마친 회차만 있으면 완료, 확정이 남아 있으면 확정이 먼저', () => {
  const done = row({ status: 'completed', scheduled_at: '2026-11-26T05:00:00Z', center_name: '가' })
  assertEquals(bookingOf([done]), { state: 'completed', scheduledAt: '2026-11-26T05:00:00Z', centerName: '가' })
  assertEquals(bookingOf([done, row({ seq: 2, status: 'confirmed', scheduled_at: '2026-12-10T05:00:00Z', center_name: '가' })]).state, 'confirmed')
})

Deno.test('검사가 열리는 상태: 확정·완료만', () => {
  assertEquals(opensTests({ state: 'waiting', scheduledAt: null, centerName: null }), false)
  assertEquals(opensTests({ state: 'confirmed', scheduledAt: null, centerName: null }), true)
  assertEquals(opensTests({ state: 'completed', scheduledAt: null, centerName: null }), true)
})

Deno.test('예약 일시 문구는 한국 시간, 정각이면 분을 뺀다', () => {
  assertEquals(bookingWhen('2026-11-26T05:00:00Z'), '11월 26일(목) 오후 2시')
  assertEquals(bookingWhen('2026-11-26T05:30:00Z'), '11월 26일(목) 오후 2시 30분')
  assertEquals(bookingWhen('2026-11-26T01:00:00Z'), '11월 26일(목) 오전 10시')
  assertEquals(bookingWhen('2026-11-26T03:00:00Z'), '11월 26일(목) 오후 12시')
  // 한국 시간으로 날짜가 넘어가는 경우
  assertEquals(bookingWhen('2026-11-25T23:00:00Z'), '11월 26일(목) 오전 8시')
})

Deno.test('검사 완료 권장일은 상담일(한국 시간) 3일 전', () => {
  assertEquals(testDueDay('2026-11-26T05:00:00Z'), '11월 23일(월)')
  assertEquals(testDueDay('2026-12-02T01:00:00Z'), '11월 29일(일)')
  assertEquals(testDueDay('2026-11-25T23:00:00Z'), '11월 23일(월)')
})
