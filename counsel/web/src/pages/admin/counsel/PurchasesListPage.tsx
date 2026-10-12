import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box, Button, Checkbox, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstMonthDay } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { PRODUCT_ORDER_STATUSES, naverCodeLabel, orderStatusText, orderTone } from '@counsel-core/naverOrder.ts'
import {
  CENTER_NONE, EMPTY_PURCHASE_FILTER, ORDER_CLAIM, ORDER_NONE, ORDER_REVIEW, PURCHASE_TYPES, SESSION_STATUSES, TYPE_UNCLASSIFIED,
  assignableSessionIds, clientLabel, countByStatus, filterPurchases, mainSession, purchaseTypeLabel, sessionProgress, sessionStatusLabel, testNames,
  type PurchaseFilter, type PurchaseRow,
} from '@counsel-core/purchases.ts'
import AssignDialog from '../../../components/AssignDialog'
import ImportDialog from '../../../components/ImportDialog'
import { ErrorBox, Loading } from '../../../components/PageState'
import SessionStatusChip from '../../../components/SessionStatusChip'
import { countInbox, listCenters, listPurchases } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { centerListLook } from '../../../theme/admin'

const COLUMNS: { label: CopyKey; width: string }[] = [
  { label: 'purchases.col.client', width: '17%' },
  { label: 'purchases.col.type', width: '9%' },
  { label: 'purchases.col.test', width: '13%' },
  { label: 'purchases.col.center', width: '12%' },
  { label: 'purchases.col.paidAt', width: '7%' },
  { label: 'purchases.col.order', width: '10%' },
  { label: 'purchases.col.testProgress', width: '11%' },
  { label: 'purchases.col.application', width: '10%' },
  { label: 'purchases.col.status', width: '11%' },
]

const ORDER_CHIP = { normal: 'default', done: 'success', warning: 'warning', closed: 'default' } as const

// 검사 이름·센터 이름은 길어서 두 줄까지 보이고 그 뒤는 줄인다
const twoLines = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const

type Notice = { message: string; key: number }

export default function PurchasesListPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const canManage = hasCap(state, 'purchase.manage')
  const canAssign = hasCap(state, 'session.assign')
  const [rows, setRows] = useState<PurchaseRow[] | null>(null)
  const [centers, setCenters] = useState<Center[]>([])
  const [error, setError] = useState<CounselError | null>(null)
  const [filter, setFilter] = useState<PurchaseFilter>(EMPTY_PURCHASE_FILTER)
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(20)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inbox, setInbox] = useState(0)
  const [assignOpen, setAssignOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const initialToast = (location.state as { toast?: string } | null)?.toast
  const [notice, setNotice] = useState<Notice | null>(initialToast ? { message: initialToast, key: 0 } : null)

  const load = useCallback(() => {
    Promise.all([listPurchases(), listCenters(), countInbox()]).then(
      ([p, c, i]) => { setRows(p); setCenters(c); setInbox(i) },
      (e: unknown) => setError(toCounselError(e)),
    )
  }, [])
  useEffect(load, [load])

  const centerName = useMemo(() => new Map(centers.map((c) => [c.id, c.name])), [centers])
  // 상태 칩의 건수는 상태를 뺀 나머지 거르기를 적용한 결과로 센다(칩을 눌러도 다른 칩 숫자가 변하지 않게)
  const beforeStatus = useMemo(() => (rows ? filterPurchases(rows, { ...filter, status: '' }) : []), [rows, filter])
  const counts = useMemo(() => countByStatus(beforeStatus), [beforeStatus])
  const filtered = useMemo(() => filterPurchases(beforeStatus, { ...EMPTY_PURCHASE_FILTER, status: filter.status }), [beforeStatus, filter.status])
  const tests = useMemo(() => testNames(rows ?? []), [rows])
  const shown = filtered.slice(page * perPage, page * perPage + perPage)

  const change = (patch: Partial<PurchaseFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0) }
  const notify = (message: string) => setNotice({ message, key: Date.now() })
  const toggle = (id: string, on: boolean) => setSelected((s) => {
    const n = new Set(s)
    if (on) n.add(id)
    else n.delete(id)
    return n
  })
  const shownAllSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))
  const shownSomeSelected = shown.some((r) => selected.has(r.id))
  const selectShown = (on: boolean) => setSelected((s) => {
    const n = new Set(s)
    for (const r of shown) {
      if (on) n.add(r.id)
      else n.delete(r.id)
    }
    return n
  })
  const sessionIds = assignableSessionIds(rows ?? [], selected)
  const open = (id: string) => navigate(`/admin/counsel/purchases/${id}`, { state: { back: '/admin/counsel/purchases' } })

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('purchases.title')}</Typography>
        {rows && <Typography variant="body2" color="text.secondary">{t('purchases.count', { n: filtered.length })}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        {canManage && (
          <>
            <Button variant={inbox > 0 ? 'contained' : 'outlined'} color={inbox > 0 ? 'warning' : 'primary'} onClick={() => navigate('/admin/counsel/purchases/inbox')}>
              {t('purchases.inbox', { n: inbox })}
            </Button>
            <Button variant="outlined" onClick={() => setImportOpen(true)}>{t('purchases.import')}</Button>
            <Button variant="contained" onClick={() => navigate('/admin/counsel/purchases/new')}>{t('purchases.create')}</Button>
          </>
        )}
      </Stack>

      {rows && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {(['', ...SESSION_STATUSES] as const).map((s) => (
            <Chip key={s || 'all'} clickable color={filter.status === s ? 'primary' : 'default'} variant={filter.status === s ? 'filled' : 'outlined'}
              label={`${s ? sessionStatusLabel(s) : t('purchases.summary.all')} ${s ? counts[s] : counts.all}`}
              onClick={() => change({ status: s })} />
          ))}
        </Stack>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField size="small" label={t('purchases.search')} value={filter.q} onChange={(e) => change({ q: e.target.value })} sx={{ flexGrow: 1 }} />
        <TextField size="small" select label={t('purchases.filter.type')} value={filter.type} onChange={(e) => change({ type: e.target.value })} sx={{ minWidth: 130 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          {PURCHASE_TYPES.map((p) => <MenuItem key={p} value={p}>{purchaseTypeLabel(p)}</MenuItem>)}
          <MenuItem value={TYPE_UNCLASSIFIED}>{purchaseTypeLabel(null)}</MenuItem>
        </TextField>
        <TextField size="small" select label={t('purchases.filter.order')} value={filter.order} onChange={(e) => change({ order: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          <MenuItem value={ORDER_REVIEW}>{t('purchases.filter.orderReview')}</MenuItem>
          <MenuItem value={ORDER_CLAIM}>{t('purchases.filter.orderClaim')}</MenuItem>
          {PRODUCT_ORDER_STATUSES.map((s) => <MenuItem key={s} value={s}>{naverCodeLabel('orderStatus', s)}</MenuItem>)}
          <MenuItem value={ORDER_NONE}>{t('purchases.filter.orderNone')}</MenuItem>
        </TextField>
        <TextField size="small" select label={t('purchases.filter.center')} value={filter.center} onChange={(e) => change({ center: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          <MenuItem value={CENTER_NONE}>{t('purchases.filter.centerNone')}</MenuItem>
          {centers.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField size="small" select label={t('purchases.filter.test')} value={filter.test} onChange={(e) => change({ test: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">{t('centers.filter.all')}</MenuItem>
          {tests.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
      </Stack>

      {canAssign && selected.size > 0 && (
        <Paper sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('purchases.selected', { n: selected.size })}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={() => setSelected(new Set())}>{t('purchases.clearSelection')}</Button>
          <Button size="small" variant="contained" disabled={sessionIds.length === 0} onClick={() => setAssignOpen(true)}>{t('purchases.assign')}</Button>
        </Paper>
      )}

      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && (
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <TableContainer>
            <Table sx={{ tableLayout: 'fixed', minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  {canAssign && (
                    <TableCell padding="checkbox" sx={{ width: 56, pl: 1.5 }}>
                      <Checkbox checked={shownAllSelected} indeterminate={!shownAllSelected && shownSomeSelected}
                        onChange={(e) => selectShown(e.target.checked)} slotProps={{ input: { 'aria-label': t('purchases.selectAll') } }} />
                    </TableCell>
                  )}
                  {COLUMNS.map((c) => (
                    <TableCell key={c.label} sx={{ width: c.width, py: 1.5, px: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{t(c.label)}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + (canAssign ? 1 : 0)} sx={{ py: 8, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{t('purchases.empty')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((r) => {
                  const s = mainSession(r)
                  const a = r.applications
                  const n = r.naver_product_orders
                  const progress = sessionProgress(r)
                  const guardian = a?.client_name && a.guardian_name ? a.guardian_name : null
                  const product = [r.product_name, n?.option_name].filter(Boolean).join(' · ')
                  const orderText = n ? orderStatusText(n.product_order_status, n.claim_status) : null
                  const tone = n ? orderTone(n.product_order_status, n.claim_status) : 'normal'
                  return (
                    <TableRow key={r.id} hover tabIndex={0} selected={selected.has(r.id)}
                      sx={{ cursor: 'pointer', '& td': { py: 1.75, px: 1.5, borderColor: centerListLook.rowBorder } }}
                      onClick={() => open(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(r.id) }}>
                      {canAssign && (
                        <TableCell padding="checkbox" sx={{ pl: 1.5 }} onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)}
                            slotProps={{ input: { 'aria-label': t('purchases.selectRow') } }} />
                        </TableCell>
                      )}
                      <TableCell>
                        <Typography variant="body1" noWrap sx={{ fontWeight: 700 }}>{clientLabel(r)}</Typography>
                        {guardian && <Typography variant="caption" color="text.secondary" noWrap component="div">{t('purchases.guardianOf', { name: guardian })}</Typography>}
                        {product && <Typography variant="caption" color="text.secondary" noWrap component="div" title={product}>{product}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap color={r.purchase_type ? 'text.primary' : 'warning.main'}>{purchaseTypeLabel(r.purchase_type)}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" title={a?.test_name ?? undefined} sx={twoLines}>{a?.test_name ?? t('center.empty')}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={twoLines} color={s?.center_id ? 'text.primary' : 'text.secondary'}>
                          {s?.center_id ? centerName.get(s.center_id) ?? t('center.empty') : t('purchases.filter.centerNone')}
                        </Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" noWrap>{r.paid_at ? formatKstMonthDay(r.paid_at) : t('center.empty')}</Typography></TableCell>
                      <TableCell>
                        <Stack sx={{ alignItems: 'flex-start', gap: 0.5 }}>
                          {orderText
                            ? <Chip size="small" label={orderText} color={ORDER_CHIP[tone]} variant={tone === 'closed' ? 'filled' : 'outlined'} />
                            : <Typography variant="body2" color="text.secondary">{t('center.empty')}</Typography>}
                          {n?.needs_review && <Chip size="small" label={t('naver.review')} color="error" />}
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary" noWrap title={t('purchases.testProgress.pending')}>{t('purchases.testProgress.pending')}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap color={a ? 'text.primary' : 'text.secondary'}>
                          {a ? t('purchases.application.done', { date: formatKstMonthDay(a.submitted_at ?? r.created_at) }) : t('purchases.application.missing')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {s && <SessionStatusChip status={s.status} />}
                        {progress.total > 1 && (
                          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                            {t('purchases.progress', { done: progress.completed, total: progress.total })}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
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

      <AssignDialog open={assignOpen} sessionIds={sessionIds} centers={centers} onClose={() => setAssignOpen(false)}
        onDone={(m) => { setAssignOpen(false); setSelected(new Set()); notify(m); load() }} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)}
        onDone={(m) => { setImportOpen(false); notify(m); load() }} />
      {notice && <Toast key={notice.key} message={notice.message} open onClose={() => setNotice(null)} />}
    </Stack>
  )
}
