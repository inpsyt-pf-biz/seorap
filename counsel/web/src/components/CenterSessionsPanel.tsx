import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { formatKstDate, formatKstDateTime } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { SESSION_STATUSES, purchaseTypeLabel, sessionStatusLabel } from '@counsel-core/purchases.ts'
import { listCenterSessions, type CenterSession } from '../lib/api'
import { ErrorBox, Loading } from './PageState'
import SessionStatusChip from './SessionStatusChip'

const COLUMNS: CopyKey[] = [
  'centerSessions.col.client', 'centerSessions.col.type', 'centerSessions.col.seq', 'centerSessions.col.status',
  'centerSessions.col.scheduledAt', 'centerSessions.col.assignedAt',
]

// 센터 상세의 배정·상담 현황: 상태별 건수와 이 센터에 배정된 상담 회차. 줄을 누르면 구매 건 상세로 간다.
export default function CenterSessionsPanel({ centerId }: { centerId: string }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<CenterSession[] | null>(null)
  const [error, setError] = useState<CounselError | null>(null)

  useEffect(() => {
    listCenterSessions(centerId).then(setRows, (e: unknown) => setError(toCounselError(e)))
  }, [centerId])

  const counts = useMemo(() => SESSION_STATUSES.map((s) => [s, (rows ?? []).filter((r) => r.status === s).length] as const), [rows])

  return (
    <Paper sx={{ px: 3, py: 2.5, borderRadius: 4 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{t('centerSessions.title')}</Typography>
      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && (
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {counts.filter(([s, n]) => n > 0 || s === 'requested' || s === 'completed').map(([s, n]) => (
              <Chip key={s} size="small" variant="outlined" label={`${sessionStatusLabel(s)} ${n}`} />
            ))}
          </Stack>
          {rows.length === 0
            ? <Typography variant="body2" color="text.secondary">{t('centerSessions.empty')}</Typography>
            : (
              <Table size="small">
                <TableHead>
                  <TableRow>{COLUMNS.map((c) => <TableCell key={c}><Typography variant="caption" sx={{ fontWeight: 600 }}>{t(c)}</Typography></TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const a = r.purchases?.applications
                    const name = a?.client_name ?? a?.guardian_name ?? r.purchases?.naver_orderers?.name_masked ?? t('center.empty')
                    const open = () => navigate(`/admin/counsel/purchases/${r.purchase_id}`, { state: { back: `/admin/counsel/centers/${centerId}` } })
                    return (
                      <TableRow key={r.id} hover tabIndex={0} sx={{ cursor: 'pointer' }} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{purchaseTypeLabel(r.purchases?.purchase_type ?? null)}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{t('session.seq', { n: r.seq })}</Typography></TableCell>
                        <TableCell><SessionStatusChip status={r.status} /></TableCell>
                        <TableCell><Typography variant="body2">{r.scheduled_at ? formatKstDateTime(r.scheduled_at) : t('center.empty')}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{r.assigned_at ? formatKstDate(r.assigned_at) : t('center.empty')}</Typography></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
        </Stack>
      )}
    </Paper>
  )
}
