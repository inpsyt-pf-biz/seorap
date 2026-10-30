import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box, Button, Checkbox, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstDate, formatKstDateTime, formatKstMonthDay } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { examLines, examStatusLabel } from '@counsel-core/exams.ts'
import { PRODUCT_ORDER_STATUSES, naverCodeLabel, orderStatusText, orderTone } from '@counsel-core/naverOrder.ts'
import {
  CENTER_NONE, EMPTY_PURCHASE_FILTER, ORDER_CLAIM, ORDER_NONE, ORDER_REVIEW, PERIODS, PURCHASE_TYPES, TYPE_UNCLASSIFIED,
  assignableSessionIds, clientLabel, contactLabel, countByStage, filterPurchases, mainSession, periodRange, purchaseTypeLabel, sessionProgress, testNames,
  type Period, type PurchaseFilter, type PurchaseRow,
} from '@counsel-core/purchases.ts'
import AssignDialog from '../../../components/AssignDialog'
import ImportDialog from '../../../components/ImportDialog'
import { ErrorBox, Loading } from '../../../components/PageState'
import SessionStatusChip from '../../../components/SessionStatusChip'
import StageStrip from '../../../components/StageStrip'
import { countInbox, listCenters, listPurchases } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { centerListLook } from '../../../theme/admin'

const COLUMNS: { label: CopyKey; width: string }[] = [
  { label: 'purchases.col.client', width: '17%' },
  { label: 'purchases.col.type', width: '8%' },
  { label: 'purchases.col.test', width: '19%' },
  { label: 'purchases.col.center', width: '11%' },
  { label: 'purchases.col.paidAt', width: '8%' },
  { label: 'purchases.col.order', width: '15%' },
  { label: 'purchases.col.application', width: '10%' },
  { label: 'purchases.col.status', width: '12%' },
]

const ORDER_CHIP = { normal: 'default', done: 'success', warning: 'warning', closed: 'default' } as const
// 진행 검사 줄의 응시 상태 배지
const EXAM_CHIP: Record<string, 'default' | 'warning' | 'success'> = { unused: 'default', in_progress: 'warning', completed: 'success' }
const smallChip = { height: 22, flexShrink: 0, '& .MuiChip-label': { px: 1, fontSize: 12 } } as const

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
  const [period, setPeriod] = useState<Period | ''>('')
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
  // 단계 칸의 건수는 단계를 뺀 나머지 거르기를 적용한 결과로 센다(칸을 눌러도 다른 칸 숫자가 변하지 않게)
  const beforeStage = useMemo(() => (rows ? filterPurchases(rows, { ...filter, stage: '' }) : []), [rows, filter])
  const counts = useMemo(() => countByStage(beforeStage), [beforeStage])
  const filtered = useMemo(() => filterPurchases(beforeStage, { ...EMPTY_PURCHASE_FILTER, stage: filter.stage }), [beforeStage, filter.stage])
  const tests = useMemo(() => testNames(rows ?? []), [rows])
  const shown = filtered.slice(page * perPage, page * perPage + perPage)

  const change = (patch: Partial<PurchaseFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0) }
  // 기간: 고르기 쉬운 기간은 오늘(한국 날짜)부터 거꾸로 센다. 직접 입력은 지금 날짜를 그대로 두고 칸을 연다
  const changePeriod = (p: Period | '') => {
    setPeriod(p)
    if (p === '') change({ from: '', to: '' })
    else if (p !== 'custom') change(periodRange(p, formatKstDate(new Date().toISOString())) ?? {})
  }
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

      {rows && <StageStrip counts={counts} value={filter.stage} onChange={(stage) => change({ stage })} />}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <TextField size="small" label={t('purchases.search')} value={filter.q} onChange={(e) => change({ q: e.target.value })} sx={{ flexGrow: 1, minWidth: 240 }} />
        <TextField size="small" select label={t('purchases.period')} value={period} onChange={(e) => changePeriod(e.target.value as Period | '')} sx={{ minWidth: 130 }}>
          <MenuItem value="">{t('purchases.period.all')}</MenuItem>
          {PERIODS.map((p) => <MenuItem key={p} value={p}>{t(`purchases.period.${p}` as CopyKey)}</MenuItem>)}
        </TextField>
        {period === 'custom' && (
          <>
            <TextField size="small" type="date" label={t('purchases.period.from')} value={filter.from} onChange={(e) => change({ from: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: filter.to || undefined } }} sx={{ minWidth: 150 }} />
            <TextField size="small" type="date" label={t('purchases.period.to')} value={filter.to} onChange={(e) => change({ to: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filter.from || undefined } }} sx={{ minWidth: 150 }} />
          </>
        )}
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
                  const exams = examLines(r.purchase_tests)
                  const contact = contactLabel(r)
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
                        {contact && <Typography variant="body2" color="text.secondary" noWrap component="div">{contact}</Typography>}
                        {guardian && <Typography variant="caption" color="text.secondary" noWrap component="div">{t('purchases.guardianOf', { name: guardian })}</Typography>}
                        {product && <Typography variant="caption" color="text.secondary" noWrap component="div" title={product}>{product}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap color={r.purchase_type ? 'text.primary' : 'warning.main'}>{purchaseTypeLabel(r.purchase_type)}</Typography>
                      </TableCell>
                      <TableCell>
                        {exams.length > 0 ? (
                          <Stack sx={{ gap: 0.5 }}>
                            {exams.map((x) => (
                              <Stack key={x.name} direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                <Typography variant="body2" title={x.name} sx={{ ...twoLines, flex: 1, minWidth: 0 }}>{x.name}</Typography>
                                <Chip size="small" label={examStatusLabel(x.status)} color={EXAM_CHIP[x.status] ?? 'default'}
                                  variant={x.status === 'completed' ? 'filled' : 'outlined'} sx={smallChip} />
                              </Stack>
                            ))}
                          </Stack>
                        ) : (
                          <>
                            <Typography variant="body2" title={a?.test_name ?? undefined} sx={twoLines}>{a?.test_name ?? t('center.empty')}</Typography>
                            <Typography variant="caption" color="text.secondary">{t('purchases.testProgress.pending')}</Typography>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={twoLines} color={s?.center_id ? 'text.primary' : 'text.secondary'}>
                          {s?.center_id ? centerName.get(s.center_id) ?? t('center.empty') : t('purchases.filter.centerNone')}
                        </Typography>
                      </TableCell>
                      <TableCell title={r.paid_at ? formatKstDateTime(r.paid_at) : undefined}>
                        {r.paid_at ? (
                          <>
                            <Typography variant="body2" noWrap>{formatKstMonthDay(r.paid_at)}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">{formatKstDateTime(r.paid_at).slice(11)}</Typography>
                          </>
                        ) : <Typography variant="body2" color="text.secondary">{t('center.empty')}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Stack sx={{ alignItems: 'flex-start', gap: 0.5 }}>
                          {n && (
                            <Typography variant="caption" noWrap title={n.naver_product_order_id} sx={{ maxWidth: '100%', fontVariantNumeric: 'tabular-nums' }}>
                              {n.naver_product_order_id}
                            </Typography>
                          )}
                          {orderText
                            ? <Chip size="small" label={orderText} color={ORDER_CHIP[tone]} variant={tone === 'closed' ? 'filled' : 'outlined'} />
                            : <Typography variant="body2" color="text.secondary">{t('center.empty')}</Typography>}
                          {n?.needs_review && <Chip size="small" label={t('naver.review')} color="error" />}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap color={a ? 'text.primary' : 'text.secondary'}>
                          {a ? t('purchases.application.done', { date: formatKstMonthDay(a.submitted_at ?? r.created_at) }) : t('purchases.application.missing')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {s ? <SessionStatusChip status={s.status} /> : <Typography variant="body2" color="text.secondary">{t('purchases.stage.testOnly')}</Typography>}
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
