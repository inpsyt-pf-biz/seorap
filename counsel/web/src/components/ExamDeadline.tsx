import { Box, Stack, Typography } from '@mui/material'
import { formatKstDate } from '@seorap-core/time.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { dayDiff } from '@counsel-core/dateRange.ts'
import { liveTests } from '@counsel-core/exams.ts'
import { examDeadline } from '@counsel-core/purchases.ts'
import type { PurchaseTest } from '@counsel-core/exams.ts'
import type { SessionDetail } from '../lib/api'
import { tokens } from '../theme/admin'
import ExamStatusIcon from './ExamStatusIcon'

// 구매 건 상세의 응시 기한선. 예약이 확정된 회차에만: 응시자마다 한 줄, 그 아래 구매일부터 상담일까지의 막대에
// 응시를 마친 날(점), 기한(상담 3일 전, 점선), 오늘(선)을 놓는다. STS 커플 P0 지표 "상담 3일 전까지 2매 모두 완료"를 그대로 보여 준다.
type Props = { session: SessionDetail; tests: PurchaseTest[]; paidAt: string | null; today: string }

const WD = ['일', '월', '화', '수', '목', '금', '토']
const mdw = (day: string) => `${day.slice(5)}(${WD[new Date(`${day}T00:00:00Z`).getUTCDay()]})`

export default function ExamDeadline({ session, tests, paidAt, today }: Props) {
  const live = liveTests(tests)
  const dl = examDeadline(session, live, today)
  // 상담일이 지나면 기한은 더 의미가 없다(상담 완료 처리는 진행 단계가 알려 준다)
  if (!dl || live.length === 0 || today > dl.session) return null
  const start = paidAt ? formatKstDate(paidAt) : null
  const span = start ? dayDiff(start, dl.session) : 0
  const at = (day: string) => `${Math.min(100, Math.max(0, (dayDiff(start!, day) / span) * 100)).toFixed(2)}%`
  const status = dl.missing === 0 ? t('deadline.done') : dl.late ? t('deadline.late', { n: dl.missing }) : t('deadline.left', { n: dl.missing })
  const words = (x: PurchaseTest) => x.exam_status === 'completed'
    ? t('deadline.completedOn', { d: x.exam_completed_at ? formatKstDate(x.exam_completed_at).slice(5) : '' })
    : x.exam_status === 'in_progress' ? t('exam.status.in_progress') : t('exam.status.unused')

  return (
    <Box sx={{ mt: 1.5, p: 2, borderRadius: tokens.radius.card, border: `1px solid ${dl.late ? tokens.tone.caution.bg : tokens.surface[200]}` }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('deadline.head', { due: mdw(dl.due), session: mdw(dl.session) })}</Typography>
        <Typography variant="body2" sx={{ fontWeight: dl.late ? 600 : 400, color: dl.late ? tokens.tone.caution.fg : 'text.secondary' }}>{status}</Typography>
      </Stack>
      {live.map((x) => (
        <Stack key={x.id} direction="row" sx={{ alignItems: 'center', gap: 1.25, minHeight: 36, borderTop: `1px solid ${tokens.surface[100]}` }}>
          <ExamStatusIcon status={x.exam_status} />
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 88 }}>{x.respondent_name ?? t('deadline.respondentLater')}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>{x.test_name}</Typography>
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: x.exam_status !== 'completed' && dl.late ? tokens.tone.caution.fg : 'text.secondary' }}>{words(x)}</Typography>
        </Stack>
      ))}
      {start && span > 0 && (
        <Box role="img" aria-label={t('deadline.axis', { paid: start.slice(5), due: dl.due.slice(5), session: dl.session.slice(5) })} sx={{ mt: 1.5, mx: 0.5 }}>
          <Box sx={{ position: 'relative', height: 22 }}>
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, bgcolor: tokens.surface[200] }} />
            <Box sx={{ position: 'absolute', top: 0, height: 22, left: at(dl.due), borderLeft: `1px dashed ${tokens.tone.caution.fg}` }} />
            {today !== dl.due && today > start && today < dl.session && (
              <Box sx={{ position: 'absolute', top: 0, height: 22, width: 2, left: at(today), transform: 'translateX(-50%)', bgcolor: tokens.teal[500] }} />
            )}
            {live.filter((x) => x.exam_status === 'completed' && x.exam_completed_at).map((x) => (
              <Box key={x.id} title={`${x.respondent_name ?? x.test_name} ${formatKstDate(x.exam_completed_at!).slice(5)}`}
                sx={{ position: 'absolute', top: 6, width: 10, height: 10, borderRadius: '50%', bgcolor: tokens.teal[700], left: at(formatKstDate(x.exam_completed_at!)), transform: 'translateX(-50%)' }} />
            ))}
          </Box>
          <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'space-between', mt: 0.5, height: 18 }}>
            <Typography variant="caption" color="text.secondary">{t('deadline.paid', { d: start.slice(5) })}</Typography>
            <Typography variant="caption" sx={{ position: 'absolute', left: at(dl.due), transform: 'translateX(-100%)', pr: 0.5, whiteSpace: 'nowrap', color: tokens.tone.caution.fg }}>
              {today === dl.due ? t('deadline.dueToday') : t('deadline.due', { d: dl.due.slice(5) })}
            </Typography>
            <Typography variant="caption" color="text.secondary">{t('deadline.session', { d: dl.session.slice(5) })}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}
