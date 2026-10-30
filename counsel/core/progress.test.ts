import { assertEquals } from '@std/assert'
import { EXAM_STATUSES, examLines, examSummary, examSummaryText } from './exams.ts'
import { computeProgress, type ProgressInput } from './progress.ts'

const sql = Deno.readTextFileSync(new URL('../supabase/migrations/20261021000001_purchase_tests.sql', import.meta.url))

const base: ProgressInput = {
  paidAt: '2026-10-01T09:00:00+09:00',
  createdAt: '2026-10-01T09:00:00+09:00',
  applicationAt: null,
  hasApplication: false,
  session: { status: 'unassigned', center_id: null, assigned_at: null, scheduled_at: null },
  completedAt: null,
  multiSession: false,
  tests: [],
}
const states = (i: ProgressInput) => computeProgress(i).steps.map((x) => x.state)
const tests = (...st: string[]) => st.map((exam_status) => ({ exam_status, exam_completed_at: exam_status === 'completed' ? '2026-10-05T10:00:00+09:00' : null }))

Deno.test('검사 실시 상태가 DB CHECK 와 같다', () => {
  const m = /exam_status in \(([^)]*)\)/.exec(sql)!
  assertEquals([...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]), [...EXAM_STATUSES])
})

Deno.test('막 들어온 네이버 주문: 신청서가 지금 할 단계, 검사·보고서는 아직 쓸 수 없음', () => {
  assertEquals(states(base), ['done', 'current', 'todo', 'todo', 'pending', 'todo', 'pending'])
  assertEquals(computeProgress(base).next.key, 'progress.next.application')
})

Deno.test('예약 확정까지 마치고 검사는 일부만: 검사가 지금 할 단계', () => {
  const p = computeProgress({
    ...base, hasApplication: true, applicationAt: '2026-10-02T09:00:00+09:00',
    session: { status: 'confirmed', center_id: 'c', assigned_at: '2026-10-03T09:00:00+09:00', scheduled_at: '2026-10-10T15:00:00+09:00' },
    tests: tests('completed', 'in_progress', 'unused'),
  })
  assertEquals(p.steps.map((x) => x.state), ['done', 'done', 'done', 'done', 'current', 'todo', 'pending'])
  assertEquals(p.steps[4].note, '완료 1/3')
  assertEquals(p.next.key, 'progress.next.exam')
})

Deno.test('상담은 끝났는데 검사를 안 했으면 검사 실시가 누락', () => {
  const p = computeProgress({
    ...base, hasApplication: true,
    session: { status: 'completed', center_id: 'c', assigned_at: 'x', scheduled_at: 'y' },
    tests: tests('unused'),
  })
  assertEquals(p.steps.map((x) => x.state), ['done', 'done', 'done', 'done', 'missing', 'done', 'pending'])
  assertEquals(p.steps[4].note, '미응시')
  assertEquals([p.next.key, p.next.vars.steps], ['progress.next.missing', '검사 실시'])
})

Deno.test('신청서 없이 배정만 했으면 신청서 작성이 누락', () => {
  const p = computeProgress({ ...base, session: { status: 'requested', center_id: 'c', assigned_at: 'x', scheduled_at: null } })
  assertEquals(p.steps.map((x) => x.state).slice(0, 4), ['done', 'missing', 'done', 'current'])
})

Deno.test('모두 끝남(보고서는 준비 중이라 세지 않음), 취소·상담 불가는 멈춤', () => {
  const done = computeProgress({
    ...base, hasApplication: true, session: { status: 'completed', center_id: 'c', assigned_at: 'x', scheduled_at: 'y' }, completedAt: 'z', tests: tests('completed', 'deleted'),
  })
  assertEquals(done.next.key, 'progress.next.done')
  assertEquals(done.steps[5].at, 'z')
  assertEquals(done.steps[4].at, '2026-10-05T10:00:00+09:00')
  const cancelled = computeProgress({ ...base, hasApplication: true, session: { status: 'cancelled', center_id: null, assigned_at: null, scheduled_at: null } })
  assertEquals(cancelled.steps.map((x) => x.state), ['done', 'done', 'stopped', 'stopped', 'stopped', 'stopped', 'stopped'])
  assertEquals(cancelled.steps[2].note, '취소')
  const unable = computeProgress({ ...base, hasApplication: true, session: { status: 'unable', center_id: 'c', assigned_at: 'x', scheduled_at: null } })
  assertEquals(unable.steps.map((x) => x.state), ['done', 'done', 'done', 'stopped', 'pending', 'stopped', 'stopped'])
  assertEquals(unable.next.key, 'progress.next.unable')
})

Deno.test('목록의 검사 실시 요약', () => {
  assertEquals(examSummaryText(examSummary([])), '서랍 연결 후')
  assertEquals(examSummaryText(examSummary(tests('unused', 'unused'))), '미응시')
  assertEquals(examSummaryText(examSummary(tests('in_progress', 'unused'))), '응시 중')
  assertEquals(examSummaryText(examSummary(tests('completed', 'in_progress', 'unused'))), '완료 1/3')
  assertEquals(examSummaryText(examSummary(tests('completed', 'completed', 'deleted'))), '응시 완료')
})

Deno.test('검사를 먼저 마친 정상 흐름: 배정·예약은 누락이 아니라 지금 할 단계', () => {
  const app = { hasApplication: true, applicationAt: 'a' }
  const unassigned = computeProgress({ ...base, ...app, tests: tests('completed') })
  assertEquals(unassigned.steps.map((x) => x.state), ['done', 'done', 'current', 'todo', 'done', 'todo', 'pending'])
  assertEquals(unassigned.next.key, 'progress.next.assign')
  const requested = computeProgress({ ...base, ...app, session: { status: 'requested', center_id: 'c', assigned_at: 'x', scheduled_at: null }, tests: tests('completed') })
  assertEquals(requested.steps.map((x) => x.state), ['done', 'done', 'done', 'current', 'done', 'todo', 'pending'])
  assertEquals(requested.next.key, 'progress.next.reserve')
})

Deno.test('회차가 여럿이면 검사는 어느 회차 것인지 몰라 누락으로 보지 않는다', () => {
  const p = computeProgress({
    ...base, hasApplication: true, multiSession: true,
    session: { status: 'completed', center_id: 'c', assigned_at: 'x', scheduled_at: 'y' }, tests: tests('completed', 'unused'),
  })
  assertEquals(p.steps.map((x) => x.state), ['done', 'done', 'done', 'done', 'current', 'done', 'pending'])
  assertEquals(p.next.key, 'progress.next.exam')
})

Deno.test('목록의 진행 검사 줄: 검사마다 한 줄, 같은 검사가 둘이면 번호', () => {
  const x = (test_name: string, unit_no: number | null, exam_status: string) => ({ test_name, unit_no, exam_status })
  assertEquals(examLines([x('STS 기질검사', 2, 'unused'), x('K-CBCL', null, 'completed'), x('STS 기질검사', 1, 'in_progress'), x('MMPI', null, 'deleted')]), [
    { name: 'K-CBCL', status: 'completed' },
    { name: 'STS 기질검사 1', status: 'in_progress' },
    { name: 'STS 기질검사 2', status: 'unused' },
  ])
})
