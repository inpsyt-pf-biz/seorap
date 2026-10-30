import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Button, Checkbox, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstDate, formatKstDateTime } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { examLines } from '@counsel-core/exams.ts'
import { PRODUCT_ORDER_STATUSES, naverCodeLabel, orderStatusText, orderTone } from '@counsel-core/naverOrder.ts'
import {
  CENTER_NONE, EMPTY_PURCHASE_FILTER, ORDER_CLAIM, ORDER_NONE, ORDER_REVIEW, PURCHASE_TYPES, STAGES, STAGE_TODO, TYPE_UNCLASSIFIED,
  PERIODS, assignableSessionIds, byTodo, periodRange, purchaseTodo, clientLabel, contactLabel, countByStage, filterPurchases, purchaseTypeLabel, testNames,
  type PurchaseFilter, type PurchaseRow,
} from '@counsel-core/purchases.ts'
import AssignDialog from '../../../components/AssignDialog'
import DateRangeField from '../../../components/DateRangeField'
import ExamStatusIcon from '../../../components/ExamStatusIcon'
import ImportDialog from '../../../components/ImportDialog'
import { ErrorBox, Loading } from '../../../components/PageState'
import ProgressCell from '../../../components/ProgressCell'
import StageStrip from '../../../components/StageStrip'
import { countInbox, listCenters, listPurchases } from '../../../lib/api'
import { usePageCommands } from '../../../shell/commands'
import { hasCap, useSession } from '../../../shell/session'
import { centerListLook, tokens } from '../../../theme/admin'

const COLUMNS: { label: CopyKey; width: string }[] = [
  { label: 'purchases.col.client', width: '15%' },
  { label: 'purchases.col.todo', width: '14%' },
  { label: 'purchases.col.type', width: '7%' },
  { label: 'purchases.col.test', width: '19%' },
  { label: 'purchases.col.paidAt', width: '10%' },
  { label: 'purchases.col.order', width: '14%' },
  { label: 'purchases.col.progress', width: '21%' },
]

const ORDER_CHIP = { normal: 'default', done: 'success', warning: 'warning', closed: 'default' } as const
// 할 일 이유 배지: 응시 기한은 적갈, 취소 요청·다시 배정은 호박, 나머지는 회색(서랍 칩 색)
const TODO_TONE = { negative: tokens.tone.caution, warning: tokens.tone.warm, neutral: tokens.tone.neutral } as const

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
  // ?stage=__todo__ 처럼 주소로 단계를 열 수 있다(Ctrl+K 의 '할 일 보기')
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<PurchaseFilter>(() => ({ ...EMPTY_PURCHASE_FILTER, stage: params.get('stage') ?? '' }))
  useEffect(() => { setFilter((f) => ({ ...f, stage: params.get('stage') ?? '' })) }, [params])
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
  const today = formatKstDate(new Date().toISOString())
  const beforeStage = useMemo(() => (rows ? filterPurchases(rows, { ...filter, stage: '' }, today) : []), [rows, filter, today])
  const counts = useMemo(() => countByStage(beforeStage, today), [beforeStage, today])
  // 할 일은 급한 순서로, 나머지는 받은 순서(최근 것부터)
  const filtered = useMemo(() => {
    const list = filterPurchases(beforeStage, { ...EMPTY_PURCHASE_FILTER, stage: filter.stage }, today)
    return filter.stage === STAGE_TODO ? [...list].sort(byTodo(today)) : list
  }, [beforeStage, filter.stage, today])
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
  // Ctrl+K 의 '이 화면' 명령: 기간, 구글시트 가져오기, 고른 건 배정
  usePageCommands(() => [
    ...PERIODS.map((p) => ({ id: `period-${p}`, label: t('palette.period', { name: t(`purchases.period.${p}` as CopyKey) }), keywords: '기간', run: () => change(periodRange(p, today)) })),
    { id: 'period-all', label: t('palette.period', { name: t('purchases.period.all') }), keywords: '기간', run: () => change({ from: '', to: '' }) },
    ...(canManage ? [{ id: 'import', label: t('purchases.import'), run: () => setImportOpen(true) }] : []),
    ...(canAssign && sessionIds.length > 0 ? [{ id: 'assign', label: t('palette.assignSelected', { n: selected.size }), keywords: '배정', run: () => setAssignOpen(true) }] : []),
  ], [today, canManage, canAssign, sessionIds.length, selected.size])
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
        <DateRangeField value={filter.from ? { from: filter.from, to: filter.to } : null} today={today}
          onChange={(r) => change({ from: r?.from ?? '', to: r?.to ?? '' })} />
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
                      {/* 진행 칸의 아이콘 네 개가 무엇인지 머리 칸에 적어 둔다 */}
                      {c.label === 'purchases.col.progress' && (
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 400, whiteSpace: 'normal' }}>
                          {STAGES.map((x) => t(`purchases.stage.${x}` as CopyKey)).join(' → ')}
                        </Typography>
                      )}
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
                  const todo = purchaseTodo(r, today)
                  const a = r.applications
                  const n = r.naver_product_orders
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
                        {todo && (
                          <Chip size="small" label={todo.label}
                            sx={{ maxWidth: '100%', bgcolor: TODO_TONE[todo.tone].bg, color: TODO_TONE[todo.tone].fg, fontWeight: 600 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap color={r.purchase_type ? 'text.primary' : 'warning.main'}>{purchaseTypeLabel(r.purchase_type)}</Typography>
                      </TableCell>
                      <TableCell>
                        {exams.length > 0 ? (
                          <Stack sx={{ gap: 0.5 }}>
                            {exams.map((x) => (
                              <Stack key={x.name} direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                <ExamStatusIcon status={x.status} />
                                <Typography variant="body2" title={x.name} sx={{ ...twoLines, flex: 1, minWidth: 0 }}>{x.name}</Typography>
                              </Stack>
                            ))}
                          </Stack>
                        ) : a?.test_name && (
                          // 서랍과 연결되기 전에는 신청서에 적힌 검사 이름만. 검사가 없는 구매 건(상담만)은 비워 둔다
                          <Typography variant="body2" title={a.test_name} sx={twoLines}>{a.test_name}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={r.paid_at ? 'text.primary' : 'text.secondary'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {r.paid_at ? formatKstDateTime(r.paid_at) : t('center.empty')}
                        </Typography>
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
                        <ProgressCell row={r} centerName={(id) => centerName.get(id)} />
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
