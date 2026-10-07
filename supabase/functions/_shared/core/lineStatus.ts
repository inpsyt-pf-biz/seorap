import { t } from './copy.ko.ts'
import { formatKstMonthDay } from './time.ts'

export type LineAction = 'launch' | 'continue' | 'forward' | 'resend' | 'reforward' | 'contact' | 'counsel_form' | 'result_help'
export type LineTone = 'neutral' | 'info' | 'success' | 'warning' | 'muted'
export type LineStatus = { label: string; tone: LineTone; actions: LineAction[]; note?: string }
export type LineInput = {
  issueStatus: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancelStatus: 'none' | 'checking' | 'cancelled' | 'rejected'
  cancelRejectReason: string | null
  examStatus: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  examStatusEnabled: boolean
  lockReasons: string[]
  firstLaunchedAt: string | null
  platformDeletedAt: string | null
  forward: null | { displayName: string; openedAt: string | null; codeExposed: boolean }
}

// build-spec §5. 순위가 높은 조건이 먼저 이긴다.
function core(i: LineInput): LineStatus {
  if (i.cancelStatus === 'cancelled') return { label: t('line.cancelled'), tone: 'muted', actions: [] }
  if (i.cancelStatus === 'checking') return { label: t('line.cancelChecking'), tone: 'warning', actions: [] }
  if (i.issueStatus === 'pending' || i.issueStatus === 'failed') return { label: t('line.preparing'), tone: 'muted', actions: [] }
  if (i.issueStatus === 'voided' || i.platformDeletedAt || i.examStatus === 'deleted') {
    return { label: t('line.unusable'), tone: 'muted', actions: ['contact'] }
  }
  if (i.lockReasons.includes('counsel_pending')) return { label: t('line.counselLocked'), tone: 'info', actions: ['counsel_form'] }
  if (i.lockReasons.length > 0) return { label: t('line.checking'), tone: 'warning', actions: ['contact'] }
  if (i.examStatusEnabled && i.examStatus === 'completed') return { label: t('line.completed'), tone: 'success', actions: ['result_help'] }
  if (i.examStatusEnabled && i.examStatus === 'in_progress') return { label: t('line.inProgress'), tone: 'info', actions: ['continue'] }
  if (i.firstLaunchedAt) return { label: t('line.launched', { date: formatKstMonthDay(i.firstLaunchedAt) }), tone: 'info', actions: ['continue'] }
  if (i.forward) {
    return {
      label: t('line.forwarded', { name: i.forward.displayName }),
      tone: 'info',
      actions: i.forward.codeExposed ? ['resend'] : ['resend', 'reforward'],
      note: i.forward.openedAt ? t('line.forwardOpened') : t('line.forwardNotOpened'),
    }
  }
  if (i.examStatusEnabled && i.examStatus === 'unused') return { label: t('line.unused'), tone: 'neutral', actions: ['launch', 'forward'] }
  return { label: t('line.notStarted'), tone: 'neutral', actions: ['launch', 'forward'] }
}

export function lineStatus(i: LineInput): LineStatus {
  const r = core(i)
  if (i.cancelStatus === 'rejected' && i.cancelRejectReason) {
    const reject = t('line.cancelRejected', { reason: i.cancelRejectReason })
    return { ...r, note: r.note ? `${r.note} · ${reject}` : reject }
  }
  return r
}
