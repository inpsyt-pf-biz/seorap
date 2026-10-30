// 구매 건의 검사 실시 현황(구매자 아래 검사 목록). 실시 상태 값은 서랍 app.vouchers.exam_status 와 같다.
import { t, type CopyKey } from './copy.ko.ts'

export const EXAM_STATUSES = ['unused', 'in_progress', 'completed', 'deleted'] as const
export type ExamStatus = (typeof EXAM_STATUSES)[number]

export function examStatusLabel(s: string): string {
  return (EXAM_STATUSES as readonly string[]).includes(s) ? t(`exam.status.${s}` as CopyKey) : s
}

export type PurchaseTest = {
  id: string
  test_name: string
  unit_no: number | null
  exam_status: ExamStatus
  exam_started_at: string | null
  exam_completed_at: string | null
  respondent_name: string | null
  result_url: string | null
}

export const PURCHASE_TEST_COLUMNS = 'id, test_name, unit_no, exam_status, exam_started_at, exam_completed_at, respondent_name, result_url'

// 지워진 검사 코드는 세지 않는다
export function liveTests<T extends { exam_status: string }>(tests: T[]): T[] {
  return tests.filter((x) => x.exam_status !== 'deleted')
}

export type ExamSummary = { total: number; completed: number; started: number }

export function examSummary(tests: { exam_status: string }[]): ExamSummary {
  const live = liveTests(tests)
  return {
    total: live.length,
    completed: live.filter((x) => x.exam_status === 'completed').length,
    started: live.filter((x) => x.exam_status === 'in_progress').length,
  }
}

// 목록의 '검사 실시' 칸 글자: 연결 전 / 미실시 / 실시 중(끝난 검사 없이 시작만) / 실시 완료 / 완료 m/n
export function examSummaryText(s: ExamSummary): string {
  if (s.total === 0) return t('purchases.testProgress.pending')
  if (s.completed === s.total) return t('exam.status.completed')
  if (s.completed === 0) return t(s.started > 0 ? 'exam.status.in_progress' : 'exam.status.unused')
  return t('exam.summary.partial', { done: s.completed, total: s.total })
}

// 목록의 '진행 검사' 칸: 구매한 검사를 모두 한 줄씩(지워진 코드는 뺀다). 같은 검사가 둘 이상이면 이름 뒤에 번호를 붙인다
export function examLines(tests: { test_name: string; unit_no: number | null; exam_status: string }[]): { name: string; status: string }[] {
  const live = [...liveTests(tests)].sort((a, b) => a.test_name.localeCompare(b.test_name, 'ko') || (a.unit_no ?? 0) - (b.unit_no ?? 0))
  const many = new Set(live.map((x) => x.test_name).filter((n, i, all) => all.indexOf(n) !== i))
  return live.map((x, i) => ({
    name: many.has(x.test_name) ? `${x.test_name} ${x.unit_no ?? live.filter((y, j) => j <= i && y.test_name === x.test_name).length}` : x.test_name,
    status: x.exam_status,
  }))
}
