import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Button, Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import {
  CENTER_STATUSES, REGIONS, contractLabel, filterCenters, modesLabel, regionsLabel, statusLabel, typesLabel,
  type Center, type CenterFilter,
} from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import StatusChip from '../../../components/StatusChip'
import { listCenters } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

const COLUMNS: CopyKey[] = [
  'center.field.name', 'center.field.status', 'center.field.regions', 'center.field.types',
  'center.field.modes', 'center.field.contactName', 'center.field.phone', 'center.field.contract',
]

export default function CentersListPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Center[] | null>(null)
  const [error, setError] = useState<CounselError | null>(null)
  const [filter, setFilter] = useState<CenterFilter>({ q: '', region: '', status: '' })
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    listCenters().then(setRows, (e: unknown) => setError(toCounselError(e)))
  }, [])

  const filtered = useMemo(() => (rows ? filterCenters(rows, filter) : []), [rows, filter])
  const shown = filtered.slice(page * perPage, page * perPage + perPage)
  const change = (patch: Partial<CenterFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0) }

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('centers.title')}</Typography>
        {rows && <Typography variant="body2" color="text.secondary">{t('centers.count', { n: filtered.length })}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        {hasCap(state, 'center.manage') && (
          <Button variant="contained" onClick={() => navigate('/admin/counsel/centers/new')}>{t('centers.create')}</Button>
        )}
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField size="small" label={t('centers.search')} value={filter.q} onChange={(e) => change({ q: e.target.value })} sx={{ flexGrow: 1 }} />
          <TextField size="small" select label={t('centers.filter.region')} value={filter.region} onChange={(e) => change({ region: e.target.value })} sx={{ minWidth: 140 }}>
            <MenuItem value="">{t('centers.filter.all')}</MenuItem>
            {REGIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <TextField size="small" select label={t('centers.filter.status')} value={filter.status} onChange={(e) => change({ status: e.target.value })} sx={{ minWidth: 160 }}>
            <MenuItem value="">{t('centers.filter.all')}</MenuItem>
            {CENTER_STATUSES.map((s) => <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {COLUMNS.map((c) => <TableCell key={c}>{t(c)}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} sx={{ py: 6, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{t('centers.empty')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((c) => (
                  <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/counsel/centers/${c.id}`)}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Link component={RouterLink} to={`/admin/counsel/centers/${c.id}`} underline="hover" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell><StatusChip status={c.status} /></TableCell>
                    <TableCell>{regionsLabel(c.regions)}</TableCell>
                    <TableCell>{typesLabel(c.counseling_types)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{modesLabel(c.delivery_modes)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.contact_name ?? t('center.empty')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.phone ?? t('center.empty')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{contractLabel(c.contract_from, c.contract_to)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
        </Paper>
      )}
    </Stack>
  )
}
