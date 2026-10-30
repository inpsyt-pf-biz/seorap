import { assertEquals } from '@std/assert'
import { addDays, addMonths, dayRole, monthGrid, pickDay } from './dateRange.ts'

Deno.test('달 옮기기와 날 옮기기(해·달 경계)', () => {
  assertEquals(addMonths(2026, 12, 1), { y: 2027, m: 1 })
  assertEquals(addMonths(2026, 1, -1), { y: 2025, m: 12 })
  assertEquals(addDays('2026-03-01', -1), '2026-02-28')
  assertEquals(addDays('2026-12-31', 1), '2027-01-01')
})

Deno.test('한 달 달력: 일요일 시작, 빈칸은 null', () => {
  // 2026-10-01 은 목요일
  const g = monthGrid(2026, 10)
  assertEquals(g[0], [null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
  assertEquals(g.at(-1), ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
  assertEquals(monthGrid(2026, 2).flat().filter(Boolean).length, 28)
})

Deno.test('첫 클릭은 시작, 둘째 클릭은 끝(앞날을 누르면 바꾼다)', () => {
  const a = pickDay({ start: null }, '2026-10-10')
  assertEquals(a, { picking: { start: '2026-10-10' }, done: null })
  assertEquals(pickDay(a.picking, '2026-10-20').done, { from: '2026-10-10', to: '2026-10-20' })
  assertEquals(pickDay(a.picking, '2026-10-03').done, { from: '2026-10-03', to: '2026-10-10' })
  assertEquals(pickDay(a.picking, '2026-10-10').done, { from: '2026-10-10', to: '2026-10-10' })
})

Deno.test('칸 모양: 정해진 범위, 고르는 중 미리보기', () => {
  const r = { from: '2026-10-05', to: '2026-10-08' }
  assertEquals(['04', '05', '06', '08', '09'].map((d) => dayRole(`2026-10-${d}`, r, { start: null }, null)), [null, 'edge', 'between', 'edge', null])
  // 시작일만 고르고 앞쪽 날을 가리키면 거꾸로 미리 보여 준다(정해 둔 범위는 무시)
  const picking = { start: '2026-10-10' }
  assertEquals(['06', '07', '10', '11'].map((d) => dayRole(`2026-10-${d}`, r, picking, '2026-10-07')), [null, 'edge', 'edge', null])
  assertEquals(dayRole('2026-10-08', r, picking, '2026-10-07'), 'between')
})
