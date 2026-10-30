import { Fragment, type ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import { formatKstDateTime, formatKstMonthDay } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { STAGES, mainSession, purchaseStage, sessionProgress, type PurchaseRow } from '@counsel-core/purchases.ts'
import { tokens } from '../theme/admin'

// 구매 건 목록의 '진행' 칸: 배정 센터·신청서·상담 현황 세 칸을 하나로 (10-30 건우님).
// 위 줄은 네 단계(신청서 미작성 → 예약 중 → 예약 완료 → 상담 완료)를 체크 아이콘으로: 지난 단계 청록 채움, 지금 단계 청록 테두리,
// 남은 단계 회색. 상담 불가는 멈춘 자리에 호박빛 느낌표, 취소는 적갈 x. 아래 줄은 지금 단계와 센터, 그 아래 신청서 날짜.
type Props = { row: Pick<PurchaseRow, 'applications' | 'sessions' | 'created_at'>; centerName: (id: string) => string | undefined }

export default function ProgressCell({ row, centerName }: Props) {
  const info = purchaseStage(row)
  const s = mainSession(row)
  if (!info || !s) return <Typography variant="body2" color="text.secondary">{t('purchases.stage.testOnly')}</Typography>

  const at = STAGES.indexOf(info.stage)
  const done = info.stage === 'completed' && !info.exit
  const center = s.center_id ? centerName(s.center_id) ?? t('center.empty') : null
  const a = row.applications
  const progress = sessionProgress(row)

  // 아래 줄: 지금 단계 · 센터(또는 미배정·예약 일시)
  const stageText = t(`purchases.stage.${info.stage}` as CopyKey)
  let line: ReactNode = stageText
  let sub: string | null = a ? t('progressCell.application', { date: formatKstMonthDay(a.submitted_at ?? row.created_at) }) : null
  if (info.exit === 'unable') { line = <Box component="span" sx={{ color: tokens.tone.warm.fg }}>{t('progressCell.unable')}</Box>; sub = center }
  else if (info.exit === 'cancelled') { line = <Box component="span" sx={{ color: tokens.tone.caution.fg }}>{t('progressCell.cancelled')}</Box>; sub = `${stageText} · ${sub ?? ''}`.replace(/ · $/, '') }
  else if (info.stage === 'booking') line = <>{stageText} · {center ?? <Box component="span" sx={{ color: tokens.tone.warm.fg, fontWeight: 600 }}>{t('progressCell.unassigned')}</Box>}</>
  else if (info.stage === 'confirmed') { line = `${stageText} · ${s.scheduled_at ? formatKstDateTime(s.scheduled_at).slice(5) : ''}`; sub = center }
  else if (info.stage === 'completed') { line = progress.total > 1 ? `${stageText} · ${t('purchases.progress', { done: progress.completed, total: progress.total })}` : stageText; sub = center }
  else sub = null

  const icon = (i: number) => {
    const size = { fontSize: 18, flexShrink: 0 }
    if (info.exit && i === at) {
      return info.exit === 'unable'
        ? <ErrorOutlineIcon key={i} sx={{ ...size, color: tokens.tone.warm.fg }} />
        : <HighlightOffIcon key={i} sx={{ ...size, color: tokens.tone.caution.fg }} />
    }
    if (i < at || (done && i === at)) return <CheckCircleIcon key={i} sx={{ ...size, color: tokens.teal[700] }} />
    if (i === at && !info.exit) return <CheckCircleOutlineIcon key={i} sx={{ ...size, color: tokens.teal[500] }} />
    return <CheckCircleOutlineIcon key={i} sx={{ ...size, color: tokens.text.disabled }} />
  }

  return (
    <Box aria-label={t('progressCell.label', { stage: info.exit ? t(`progressCell.${info.exit}` as CopyKey) : stageText })}>
      <Stack direction="row" aria-hidden sx={{ alignItems: 'center', mb: 0.5 }}>
        {STAGES.map((_, i) => (
          <Fragment key={i}>
            {i > 0 && <Box sx={{ width: 10, height: 2, flexShrink: 0, bgcolor: i <= at && !(info.exit && i === at) ? tokens.teal[500] : tokens.surface[200] }} />}
            {icon(i)}
          </Fragment>
        ))}
      </Stack>
      <Typography variant="body2" noWrap>{line}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" noWrap component="div">{sub}</Typography>}
    </Box>
  )
}
