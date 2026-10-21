// 상담 한 회차의 진행 단계: 구매 → 신청서 작성 → 센터 배정 → 상담 예약 → 검사 실시 → 상담 완료 → 보고서 제출.
// 순서를 강제하지 않는다. 뒤 단계가 끝났는데 앞 단계가 비어 있으면 '누락'으로 알려, 단계가 빠지지 않았는지 보게 한다.
import { t, type CopyKey } from './copy.ko.ts'
import { examSummary, examSummaryText } from './exams.ts'
import type { SessionStatus } from './purchases.ts'

export const STEP_KEYS = ['purchase', 'application', 'assign', 'reserve', 'exam', 'complete', 'report'] as const
export type StepKey = (typeof STEP_KEYS)[number]

// done 끝남 / current 지금 할 단계 / todo 아직 / missing 누락(뒤 단계가 먼저 끝남) / stopped 멈춤(취소·상담 불가) / pending 아직 쓸 수 없음(연결 전·준비 중)
export type StepState = 'done' | 'current' | 'todo' | 'missing' | 'stopped' | 'pending'

export type Step = { key: StepKey; state: StepState; at: string | null; note: string | null }

export type ProgressInput = {
  paidAt: string | null
  createdAt: string
  applicationAt: string | null
  hasApplication: boolean
  session: { status: SessionStatus; center_id: string | null; assigned_at: string | null; scheduled_at: string | null }
  // 상담 완료로 바꾼 시각(상담 기록에서)
  completedAt: string | null
  // 살아 있는 회차가 둘 이상인가. 검사는 구매 건 단위라 어느 회차의 검사인지 가릴 수 없어, 이때는 검사를 누락으로 보지 않는다
  multiSession: boolean
  tests: { exam_status: string; exam_completed_at: string | null }[]
}

export type Progress = { steps: Step[]; next: { key: CopyKey; vars: Record<string, string> } }

// 회차에 걸린 단계(취소·상담 불가가 되면 여기서 멈춘다)
const SESSION_STEPS: readonly StepKey[] = ['assign', 'reserve', 'complete', 'report']

export function stepLabel(k: StepKey): string {
  return t(`progress.step.${k}` as CopyKey)
}

export function computeProgress(i: ProgressInput): Progress {
  const s = i.session
  const exams = examSummary(i.tests)
  const lastExam = i.tests.map((x) => x.exam_completed_at).filter((x): x is string => !!x).sort().at(-1) ?? null

  const base: Step[] = [
    { key: 'purchase', state: 'done', at: i.paidAt ?? i.createdAt, note: null },
    { key: 'application', state: i.hasApplication ? 'done' : 'todo', at: i.applicationAt, note: null },
    { key: 'assign', state: s.center_id && s.status !== 'unassigned' ? 'done' : 'todo', at: s.assigned_at, note: null },
    { key: 'reserve', state: s.scheduled_at || s.status === 'confirmed' || s.status === 'completed' ? 'done' : 'todo', at: s.scheduled_at, note: null },
    exams.total === 0
      ? { key: 'exam', state: 'pending', at: null, note: t('progress.note.notConnected') }
      : exams.completed === exams.total
        ? { key: 'exam', state: 'done', at: lastExam, note: null }
        : { key: 'exam', state: 'todo', at: null, note: examSummaryText(exams) },
    { key: 'complete', state: s.status === 'completed' ? 'done' : 'todo', at: s.status === 'completed' ? i.completedAt : null, note: null },
    { key: 'report', state: 'pending', at: null, note: t('progress.note.notReady') },
  ]

  // 취소는 끝나지 않은 단계를 모두, 상담 불가는 회차 단계를 멈춘다(상담 불가는 다른 센터로 다시 배정하면 이어진다)
  if (s.status === 'cancelled' || s.status === 'unable') {
    const reason = t(`session.status.${s.status}` as CopyKey)
    const steps = base.map((x) => {
      const stoppable = s.status === 'cancelled' ? x.key !== 'purchase' : SESSION_STEPS.includes(x.key) && x.key !== 'assign'
      return x.state !== 'done' && stoppable ? { ...x, state: 'stopped' as const, note: reason } : x
    })
    return { steps, next: { key: s.status === 'cancelled' ? 'progress.next.cancelled' : 'progress.next.unable', vars: {} } }
  }

  // 마지막으로 끝난 단계보다 앞의 빈 단계는 누락, 그 뒤 첫 빈 단계가 지금 할 단계.
  // 검사는 배정·예약 전에 마치는 일이 흔하므로 '마지막으로 끝난 단계'를 정할 때 세지 않는다
  const lastDone = base.findLastIndex((x) => x.state === 'done' && x.key !== 'exam')
  const steps: Step[] = base.map((x, idx) =>
    x.state === 'todo' && idx < lastDone && !(x.key === 'exam' && i.multiSession) ? { ...x, state: 'missing' } : x)
  const current = steps.find((x) => x.state === 'todo')
  if (current) current.state = 'current'
  const missing = steps.filter((x) => x.state === 'missing')
  if (missing.length > 0) {
    return { steps, next: { key: 'progress.next.missing', vars: { steps: missing.map((x) => stepLabel(x.key)).join(', ') } } }
  }
  return { steps, next: current ? { key: `progress.next.${current.key}` as CopyKey, vars: {} } : { key: 'progress.next.done', vars: {} } }
}
