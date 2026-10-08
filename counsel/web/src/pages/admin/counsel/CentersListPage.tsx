import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import { CENTER_STATUSES, REGIONS, filterCenters, locationLabel, statusLabel, type Center, type CenterFilter } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import CategoryChips from '../../../components/CategoryChips'
import CenterAvatar from '../../../components/CenterAvatar'
import { ErrorBox, Loading } from '../../../components/PageState'
import StatusChip from '../../../components/StatusChip'
import { listCenters } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { centerListLook } from '../../../theme/admin'

const COLUMNS: { label: CopyKey; width: string }[] = [
  { label: 'centers.col.name', width: '33%' },
  { label: 'centers.col.location', width: '13%' },
  { label: 'centers.col.categories', width: '22%' },
  { label: 'centers.col.assigned', width: '12%' },
  { label: 'centers.col.phone', width: '20%' },
]

export default function CentersListPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Center[] | null>(null)
  const [error, setError] = useState<CounselError | null>(null)
  const [filter, setFilter] = useState<CenterFilter>({ q: '', sido: '', status: '' })
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    listCenters().then(setRows, (e: unknown) => setError(toCounselError(e)))
  }, [])

  const filtered = useMemo(() => (rows ? filterCenters(rows, filter) : []), [rows, filter])
  const shown = filtered.slice(page * perPage, page * perPage + perPage)
  const change = (patch: Partial<CenterFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0) }
  const open = (id: string) => navigate(`/admin/counsel/centers/${id}`)

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('centers.title')}</Typography>
        {rows && <Typography variant="body2" color="text.secondary">{t('centers.count', { n: filtered.length })}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        {hasCap(state, 'center.manage') && (
          <Button variant="contained" onClick={() => navigate('/admin/counsel/centers/new')}>{t('centers.create')}</Button>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField size="small" label={t('centers.search')} value={filter.q} onChange={(e) => change({ q: e.target.value })} sx={{ flexGrow: 1 }} />
        <TextField size="small" select label={t('centers.filter.sido')} value={filter.sido} onChange={(e) => change({ sido: e.target.value })} sx={{ minWidth: 140 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          {REGIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
        <TextField size="small" select label={t('centers.filter.status')} value={filter.status} onChange={(e) => change({ status: e.target.value })} sx={{ minWidth: 160 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          {CENTER_STATUSES.map((s) => <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && (
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <TableContainer>
            <Table sx={{ tableLayout: 'fixed', minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableCell key={c.label} sx={{ width: c.width, py: 1.5, px: 3 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{t(c.label)}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} sx={{ py: 8, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{t('centers.empty')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((c) => (
                  <TableRow key={c.id} hover tabIndex={0} sx={{ cursor: 'pointer', '& td': { py: 2.25, px: 3, borderColor: centerListLook.rowBorder } }}
                    onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(c.id) }}>
                    <TableCell>
                      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <CenterAvatar />
                        <Typography variant="body1" noWrap sx={{ fontWeight: 700 }}>{c.name}</Typography>
                        {c.status !== 'active' && <StatusChip status={c.status} />}
                      </Stack>
                    </TableCell>
                    <TableCell><Typography variant="body2" noWrap>{locationLabel(c.location_sido, c.location_sigungu)}</Typography></TableCell>
                    <TableCell><CategoryChips values={c.categories} /></TableCell>
                    <TableCell>
                      <Typography component="span" variant="h6" sx={{ color: centerListLook.countColor, fontWeight: 700 }}>{c.assigned_count ?? 0}</Typography>
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{t('centers.assignedUnit')}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2" noWrap>{c.phone ?? t('center.empty')}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {filtered.length > perPage && (
            <TablePagination
              component="div"
              count={filtered.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={perPage}
              onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }}
              rowsPerPageOptions={[20, 50]}
              labelRowsPerPage={t('centers.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => t('centers.rowsRange', { from, to, count })}
            />
          )}
        </Paper>
      )}
    </Stack>
  )
}
