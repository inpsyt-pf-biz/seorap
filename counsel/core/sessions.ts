// 상담 진행 바꾸기 규칙. DB 함수 rpc_update_session(20261012000005)과 같아야 하고 sessions.test.ts 가 대조한다.
import { t, type CopyKey } from './copy.ko.ts'
import type { SessionStatus } from './purchases.ts'

export const SESSION_ACTIONS = ['confirm', 'reschedule', 'complete', 'unable', 'cancel'] as const
export type SessionAction = (typeof SESSION_ACTIONS)[number]

// 상태마다 할 수 있는 일(배정·다시 배정은 따로: ASSIGNABLE_STATUSES)
export const ACTIONS_BY_STATUS: Record<SessionStatus, readonly SessionAction[]> = {
  unassigned: ['cancel'],
  requested: ['confirm', 'unable', 'cancel'],
  confirmed: ['reschedule', 'complete', 'unable', 'cancel'],
  completed: [],
  unable: ['cancel'],
  cancelled: [],
}

export function allowedActions(status: SessionStatus): readonly SessionAction[] {
  return ACTIONS_BY_STATUS[status] ?? []
}

// 예약 일시를 받아야 하는 일, 사유를 받아야 하는 일
export const NEEDS_SCHEDULE: readonly SessionAction[] = ['confirm', 'reschedule']
export const NEEDS_REASON: readonly SessionAction[] = ['reschedule', 'unable', 'cancel']

export function actionLabel(a: SessionAction): string {
  return t(`session.action.${a}` as CopyKey)
}

export const SESSION_METHODS = ['offline', 'online'] as const
export type SessionMethod = (typeof SESSION_METHODS)[number]

export function methodLabel(m: string | null): string | null {
  return m === 'offline' || m === 'online' ? t(`center.mode.${m}` as CopyKey) : null
}

export type SessionActionInput = { action: SessionAction; scheduledAt: string; method: SessionMethod | ''; reason: string }
export type SessionActionErrors = Partial<Record<'scheduledAt' | 'reason', CopyKey>>

export function validateSessionAction(v: SessionActionInput): SessionActionErrors {
  const e: SessionActionErrors = {}
  if (NEEDS_SCHEDULE.includes(v.action) && !v.scheduledAt) e.scheduledAt = 'session.error.scheduleRequired'
  if (NEEDS_REASON.includes(v.action) && !v.reason.trim()) e.reason = 'session.error.reasonRequired'
  if (v.reason.trim().length > 500) e.reason = 'session.error.reasonLength'
  return e
}

// 화면의 datetime-local 값('2026-10-15T17:00')을 한국 시각으로 읽는다
export function kstLocalToIso(local: string): string {
  return `${local}:00+09:00`
}

// 상담 기록 한 줄의 글. 배정·다시 배정·상태 바꾸기·예약 변경을 사람이 읽는 문장으로 만든다
export type SessionEvent = {
  id: number
  session_id: string
  at: string
  actor: string | null
  kind: 'created' | 'imported' | 'assigned' | 'reassigned' | 'status_changed' | 'rescheduled'
  from_status: string | null
  to_status: string | null
  from_center: string | null
  to_center: string | null
  from_scheduled_at: string | null
  to_scheduled_at: string | null
  note: string | null
}

export const SESSION_EVENT_COLUMNS =
  'id, session_id, at, actor, kind, from_status, to_status, from_center, to_center, from_scheduled_at, to_scheduled_at, note'
