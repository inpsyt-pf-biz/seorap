import { Box, Divider, Stack, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { sessionStatusLabel } from '@counsel-core/purchases.ts'
import type { SessionEvent } from '@counsel-core/sessions.ts'
import type { SessionDetail } from '../lib/api'

type Props = { events: SessionEvent[]; sessions: SessionDetail[]; centers: Center[]; names: Record<string, string> }

const when = (v: string | null) => (v ? formatKstDateTime(v) : t('center.empty'))

// 상담 기록(배정·다시 배정·상태 바꾸기·예약 변경)을 최근 것부터 보인다. 사유·메모는 아래 줄에 붙인다.
export default function HistoryList({ events, sessions, centers, names }: Props) {
  const seq = new Map(sessions.map((s) => [s.id, s.seq]))
  const center = (id: string | null) => (id ? centers.find((c) => c.id === id)?.name ?? t('history.unknownCenter') : t('center.empty'))

  const text = (e: SessionEvent): string => {
    switch (e.kind) {
      case 'created': return t('history.created')
      case 'imported': return t('history.imported')
      case 'assigned': return t('history.assigned', { center: center(e.to_center) })
      case 'reassigned': return t('history.reassigned', { from: center(e.from_center), to: center(e.to_center) })
      case 'rescheduled': return t('history.rescheduled', { from: when(e.from_scheduled_at), to: when(e.to_scheduled_at) })
      case 'status_changed': {
        const base = t('history.status', { from: sessionStatusLabel(e.from_status ?? ''), to: sessionStatusLabel(e.to_status ?? '') })
        return e.to_status === 'confirmed' && e.to_scheduled_at ? `${base} · ${t('history.scheduledAt', { at: when(e.to_scheduled_at) })}` : base
      }
    }
  }

  if (events.length === 0) return <Typography variant="body2" color="text.secondary">{t('history.empty')}</Typography>
  return (
    <Stack spacing={1.5}>
      {events.map((e, i) => (
        <Box key={e.id}>
          {i > 0 && <Divider sx={{ mb: 1.5 }} />}
          <Typography variant="caption" color="text.secondary">
            {[formatKstDateTime(e.at), t('session.seq', { n: seq.get(e.session_id) ?? '-' }), e.actor ? names[e.actor] ?? '' : t('history.system')].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25 }}>{text(e)}</Typography>
          {e.note && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{e.note}</Typography>}
        </Box>
      ))}
    </Stack>
  )
}
