import { t } from './copy.ko.ts'
import { formatKstMonthDay } from './time.ts'

export type LineAction = 'launch' | 'continue' | 'result' | 'forward' | 'resend' | 'reforward' | 'contact' | 'result_help'
// warm: 사람 사이의 일(전달함). 화면은 호박빛 칩으로 칠한다
export type LineTone = 'neutral' | 'info' | 'success' | 'warning' | 'muted' | 'warm'
// disabled: 보이지만 누를 수 없는 버튼 (상담 신청서를 내기 전의 실시하기·전달하기). 누를 수 있는 버튼은 actions 뿐이다
export type LineStatus = { label: string; tone: LineTone; actions: LineAction[]; disabled?: LineAction[]; note?: string }
export type LineInput = {
  issueStatus: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancelStatus: 'none' | 'checking' | 'cancelled' | 'rejected'
  cancelRejectReason: string | null
  examStatus: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  examStatusEnabled: boolean
  lockReasons: string[]
  firstLaunchedAt: string | null
  platformDeletedAt: string | null
  // 서랍 주인이 [코드 보기]로 코드를 본 시각 (vouchers.first_code_exposed_at)
  codeExposedAt: string | null
  // direct: 번호 없이 링크로 직접 공유한 전달 (받는 분 이름·번호가 없다)
  forward: null | { displayName: string; openedAt: string | null; codeExposed: boolean; direct: boolean }
}

// build-spec §5. 순위가 높은 조건이 먼저 이긴다.
function core(i: LineInput): LineStatus {
  if (i.cancelStatus === 'cancelled') return { label: t('line.cancelled'), tone: 'muted', actions: [] }
  if (i.cancelStatus === 'checking') return { label: t('line.cancelChecking'), tone: 'warning', actions: [] }
  if (i.issueStatus === 'pending' || i.issueStatus === 'failed') return { label: t('line.preparing'), tone: 'muted', actions: [] }
  if (i.issueStatus === 'voided' || i.platformDeletedAt || i.examStatus === 'deleted') {
    return { label: t('line.unusable'), tone: 'muted', actions: ['contact'] }
  }
  // 상담 신청서를 내기 전: 신청서로 가는 길은 서랍 맨 위 상담 카드 하나, 검사 줄은 꺼진 버튼만 (10-29 건우님)
  // 칩은 짧게, 왜 잠겼는지는 칩 아래 한 줄로 (UX 진단 R3: 같은 말을 칩·카드·버튼에서 세 번 하지 않는다)
  if (i.lockReasons.includes('counsel_pending')) return { label: t('line.waiting'), tone: 'neutral', actions: [], disabled: ['launch', 'forward'], note: t('line.counselLocked') }
  if (i.lockReasons.length > 0) return { label: t('line.checking'), tone: 'warning', actions: ['contact'] }
  if (i.examStatusEnabled && i.examStatus === 'completed') return { label: t('line.completed'), tone: 'success', actions: ['result_help'] }
  if (i.examStatusEnabled && i.examStatus === 'in_progress') return { label: t('line.inProgress'), tone: 'info', actions: ['continue'] }
  if (i.examStatusEnabled && i.examStatus === 'unused' && !i.forward) return { label: t('line.unused'), tone: 'neutral', actions: ['launch', 'forward'] }
  // 이어서 하기는 응시 중일 때만 (위). 실시한 줄은 [결과 보기]: 플랫폼 주소를 다시 열어 결과 또는 응시 화면을 본다.
  if (i.firstLaunchedAt) return { label: t('line.launched', { date: formatKstMonthDay(i.firstLaunchedAt) }), tone: 'info', actions: ['result'] }
  if (i.forward) {
    const note = i.forward.openedAt ? t('line.forwardOpened') : t('line.forwardNotOpened')
    // 직접 공유는 보낼 번호가 없어 다시 보내기가 없다. 받는 분이 코드를 봤으면 다른 분께도 없다.
    // 호칭을 남겼으면 "연인에게 전달함" (10-30)
    if (i.forward.direct) {
      const label = i.forward.displayName ? t('line.forwardedTo', { name: i.forward.displayName }) : t('line.forwardedDirect')
      return { label, tone: 'warm', actions: i.forward.codeExposed ? [] : ['reforward'], note }
    }
    return {
      label: t('line.forwarded', { name: i.forward.displayName }),
      tone: 'warm',
      actions: i.forward.codeExposed ? ['resend'] : ['resend', 'reforward'],
      note,
    }
  }
  // 본인이 코드를 봤으면(이미 썼을 수 있다) 전달하지 않는다. 한 발송권이 두 사람에게 가지 않게 (forward_apply 도 같은 규칙)
  if (i.codeExposedAt) return { label: t('line.codeViewed', { date: formatKstMonthDay(i.codeExposedAt) }), tone: 'info', actions: ['launch'] }
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
