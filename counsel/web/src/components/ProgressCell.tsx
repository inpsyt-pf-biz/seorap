import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import { formatKstDateTime, formatKstMonthDay } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { STAGES, mainSession, purchaseStage, sessionProgress, type PurchaseRow } from '@counsel-core/purchases.ts'
import { tokens } from '../theme/admin'

// 구매 건 목록의 '진행' 칸: 배정 센터·신청서·상담 현황 세 칸을 하나로 (10-30 건우님).
// 위 줄은 마친 일 세 가지(신청서 작성 → 예약 완료 → 상담 완료)를 체크 아이콘으로: 마친 것 청록 채움, 지금 기다리는 것 청록 테두리,
// 아직 먼 것 회색. 상담 불가는 멈춘 자리에 호박빛 느낌표, 취소는 적갈 x. 아래 줄은 지금 단계와 센터, 그 아래 신청서 날짜.
// 머리 칸의 ProgressLegend 가 같은 격자로 세 이름을 아이콘 바로 위에 놓는다.
// 세 칸의 격자. 머리 칸 이름과 행의 아이콘이 같은 자리에 오도록 둘이 같이 쓴다
const MILESTONES = ['application', 'booking', 'session'] as const
const COL = 52
const grid = { position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${MILESTONES.length}, ${COL}px)`, alignItems: 'center' } as const

export function ProgressLegend() {
  return (
    <Box sx={grid}>
      {MILESTONES.map((m) => (
        <Typography key={m} variant="body2" sx={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {t(`progressCell.milestone.${m}` as CopyKey)}
        </Typography>
      ))}
    </Box>
  )
}

type Props = { row: Pick<PurchaseRow, 'applications' | 'sessions' | 'created_at'>; centerName: (id: string) => string | undefined }

export default function ProgressCell({ row, centerName }: Props) {
  const info = purchaseStage(row)
  const s = mainSession(row)
  if (!info || !s) return <Typography variant="body2" color="text.secondary">{t('purchases.stage.testOnly')}</Typography>

  const at = STAGES.indexOf(info.stage)
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

  // 마친 일의 수: 신청서 미작성 0, 예약 중 1(신청서 작성), 예약 완료 2, 상담 완료 3. 지금 기다리는 일은 그다음 칸
  const doneCount = at
  const cur = Math.min(doneCount, MILESTONES.length - 1)
  const icon = (i: number) => {
    const size = { fontSize: 18, flexShrink: 0 }
    if (info.exit && i === cur) {
      return info.exit === 'unable'
        ? <ErrorOutlineIcon key={i} sx={{ ...size, color: tokens.tone.warm.fg }} />
        : <HighlightOffIcon key={i} sx={{ ...size, color: tokens.tone.caution.fg }} />
    }
    if (i < doneCount) return <CheckCircleIcon key={i} sx={{ ...size, color: tokens.teal[700] }} />
    if (i === cur) return <CheckCircleOutlineIcon key={i} sx={{ ...size, color: tokens.teal[500] }} />
    return <CheckCircleOutlineIcon key={i} sx={{ ...size, color: tokens.text.disabled }} />
  }

  return (
    <Box aria-label={t('progressCell.label', { stage: info.exit ? t(`progressCell.${info.exit}` as CopyKey) : stageText })}>
      <Box aria-hidden sx={{ ...grid, mb: 0.5, height: 20 }}>
        {MILESTONES.slice(1).map((_, k) => (
          <Box key={`l${k}`} sx={{ position: 'absolute', top: 9, height: 2, left: COL / 2 + COL * k + 11, width: COL - 22, bgcolor: doneCount > k ? tokens.teal[500] : tokens.surface[200] }} />
        ))}
        {MILESTONES.map((_, i) => <Box key={i} sx={{ display: 'flex', justifyContent: 'center' }}>{icon(i)}</Box>)}
      </Box>
      <Typography variant="body2" noWrap>{line}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" noWrap component="div">{sub}</Typography>}
    </Box>
  )
}
