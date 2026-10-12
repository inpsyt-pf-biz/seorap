import { useState } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { ASSIGNABLE_STATUSES } from '@counsel-core/purchases.ts'
import { actionLabel, allowedActions, methodLabel, type SessionAction } from '@counsel-core/sessions.ts'
import type { SessionDetail } from '../lib/api'
import AssignDialog from './AssignDialog'
import { Row } from './PurchaseSections'
import SessionActionDialog from './SessionActionDialog'
import SessionStatusChip from './SessionStatusChip'

type Props = {
  sessions: SessionDetail[]
  centers: Center[]
  canManage: boolean
  canAssign: boolean
  onChanged: (message: string) => Promise<void>
}

// 구매 건의 상담 회차들. 회차마다 배정·예약 확정·변경·완료·불가·취소를 한다.
export default function SessionsPanel({ sessions, centers, canManage, canAssign, onChanged }: Props) {
  const [acting, setActing] = useState<{ session: SessionDetail; action: SessionAction } | null>(null)
  const [assigning, setAssigning] = useState<SessionDetail | null>(null)
  const centerName = (id: string | null) => (id ? centers.find((c) => c.id === id)?.name ?? t('history.unknownCenter') : null)

  if (sessions.length === 0) return <Typography variant="body2" color="text.secondary">{t('session.none')}</Typography>
  return (
    <Stack spacing={1.5}>
      {sessions.map((s) => {
        const actions = canManage ? allowedActions(s.status) : []
        const assignable = canAssign && ASSIGNABLE_STATUSES.includes(s.status)
        return (
          <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('session.seq', { n: s.seq })}</Typography>
              <SessionStatusChip status={s.status} />
              <Box sx={{ flexGrow: 1 }} />
              {assignable && (
                <Button size="small" variant="outlined" onClick={() => setAssigning(s)}>
                  {t(s.center_id ? 'session.action.reassign' : 'session.action.assign')}
                </Button>
              )}
              {actions.map((a) => (
                <Button key={a} size="small" variant={a === 'confirm' || a === 'complete' ? 'contained' : 'outlined'}
                  color={a === 'cancel' || a === 'unable' ? 'error' : 'primary'} onClick={() => setActing({ session: s, action: a })}>
                  {actionLabel(a)}
                </Button>
              ))}
            </Stack>
            <Row label="session.field.center" value={centerName(s.center_id)} />
            <Row label="session.field.scheduledAt" value={s.scheduled_at ? formatKstDateTime(s.scheduled_at) : null} />
            <Row label="session.field.method" value={methodLabel(s.method)} />
            <Row label="session.field.assignedAt" value={s.assigned_at ? formatKstDateTime(s.assigned_at) : null} />
          </Paper>
        )
      })}
      {acting && (
        <SessionActionDialog session={acting.session} action={acting.action} onClose={() => setActing(null)}
          onDone={async (m) => { await onChanged(m); setActing(null) }} />
      )}
      <AssignDialog open={!!assigning} sessionIds={assigning ? [assigning.id] : []} centers={centers} onClose={() => setAssigning(null)}
        onDone={(m) => { void onChanged(m).then(() => setAssigning(null)) }} />
    </Stack>
  )
}
