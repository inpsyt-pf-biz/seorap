import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstDate, formatKstMonthDay } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { inboxCandidates, type InboxItem } from '@counsel-core/inbox.ts'
import { clientLabel, purchaseTypeLabel, type PurchaseRow } from '@counsel-core/purchases.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import { attachInbox, createFromInbox, dismissInbox, findPurchaseByOrderId, listInbox, listPurchases } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { centerListLook } from '../../../theme/admin'

const COLUMNS: { label: CopyKey; width: string }[] = [
  { label: 'inbox.col.submitted', width: '12%' },
  { label: 'inbox.col.type', width: '9%' },
  { label: 'inbox.col.client', width: '16%' },
  { label: 'inbox.col.phone', width: '16%' },
  { label: 'inbox.col.test', width: '13%' },
  { label: 'inbox.col.candidates', width: '34%' },
]

type Notice = { message: string; key: number }

const label = (p: PurchaseRow) => [clientLabel(p), p.paid_at ? formatKstMonthDay(p.paid_at) : null, p.product_name].filter(Boolean).join(' · ')

// 신청서 대기함. 후보 구매 건에 붙이거나, 네이버 밖에서 판 건은 새 구매 건으로 등록하거나, 버린다.
export default function InboxPage() {
  const navigate = useNavigate()
  const { state } = useSession()
  const canManage = hasCap(state, 'purchase.manage')
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [error, setError] = useState<CounselError | null>(null)
  const [actionError, setActionError] = useState<CounselError | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [byOrder, setByOrder] = useState<InboxItem | null>(null)
  const [orderId, setOrderId] = useState('')
  const [orderMissing, setOrderMissing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(() => Promise.all([listInbox(), listPurchases()]).then(([i, p]) => {
    setItems(i)
    setPurchases(p)
    setSelected((s) => new Set([...s].filter((id) => i.some((x) => x.id === id))))
  }), [])
  useEffect(() => { load().catch((e: unknown) => setError(toCounselError(e))) }, [load])

  const candidates = useMemo(() => new Map((items ?? []).map((i) => [i.id, inboxCandidates(i, purchases)])), [items, purchases])

  const act = async (work: () => Promise<string>) => {
    setBusy(true)
    setActionError(null)
    try {
      const message = await work()
      await load()
      setNotice((n) => ({ message, key: (n?.key ?? 0) + 1 }))
    } catch (e) {
      setActionError(toCounselError(e))
    } finally {
      setBusy(false)
    }
  }

  const attach = (item: InboxItem, purchaseId: string) => act(async () => { await attachInbox(item.id, purchaseId); return t('inbox.attached') })
  const ids = [...selected]

  const submitByOrder = async () => {
    if (!byOrder) return
    setOrderMissing(false)
    const pid = await findPurchaseByOrderId(orderId)
    if (!pid) { setOrderMissing(true); return }
    const item = byOrder
    setByOrder(null)
    setOrderId('')
    await attach(item, pid)
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('inbox.title')}</Typography>
        {items && <Typography variant="body2" color="text.secondary">{t('purchases.count', { n: items.length })}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" onClick={() => navigate('/admin/counsel/purchases')}>{t('inbox.back')}</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">{t('inbox.help')}</Typography>

      {canManage && selected.size > 0 && (
        <Paper sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('inbox.selected', { n: selected.size })}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" color="error" disabled={busy} onClick={() => setConfirmDismiss(true)}>{t('inbox.dismiss')}</Button>
          <Button size="small" variant="contained" disabled={busy}
            onClick={() => void act(async () => t('inbox.created', { n: await createFromInbox(ids) }))}>{t('inbox.create')}</Button>
        </Paper>
      )}
      {actionError && <Alert severity="error">{errorText(actionError)}</Alert>}
      {error && <ErrorBox message={errorText(error)} />}
      {!items && !error && <Loading />}
      {items && (
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <TableContainer>
            <Table sx={{ tableLayout: 'fixed', minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  {canManage && (
                    <TableCell padding="checkbox" sx={{ width: 56, pl: 1.5 }}>
                      <Checkbox checked={items.length > 0 && selected.size === items.length} indeterminate={selected.size > 0 && selected.size < items.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                        slotProps={{ input: { 'aria-label': t('inbox.selectAll') } }} />
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
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + (canManage ? 1 : 0)} sx={{ py: 8, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">{t('inbox.empty')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {items.map((i) => {
                  const cands = candidates.get(i.id) ?? []
                  return (
                    <TableRow key={i.id} selected={selected.has(i.id)} sx={{ verticalAlign: 'top', '& td': { py: 1.75, px: 1.5, borderColor: centerListLook.rowBorder } }}>
                      {canManage && (
                        <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                          <Checkbox checked={selected.has(i.id)} slotProps={{ input: { 'aria-label': t('inbox.selectRow') } }}
                            onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n })} />
                        </TableCell>
                      )}
                      <TableCell><Typography variant="body2" noWrap>{i.submitted_at ? formatKstDate(i.submitted_at) : t('center.empty')}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{purchaseTypeLabel(i.purchase_type)}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body1" sx={{ fontWeight: 700 }}>{i.client_name ?? i.guardian_name ?? t('center.empty')}</Typography>
                        {i.client_name && i.guardian_name && <Typography variant="caption" color="text.secondary" component="div">{t('purchases.guardianOf', { name: i.guardian_name })}</Typography>}
                        {i.naver_product_order_id && <Typography variant="caption" color="text.secondary" component="div">{t('inbox.typedOrder', { no: i.naver_product_order_id })}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{i.client_phone ?? t('center.empty')}</Typography>
                        {i.guardian_phone && <Typography variant="caption" color="text.secondary" component="div">{t('purchases.guardianOf', { name: i.guardian_phone })}</Typography>}
                      </TableCell>
                      <TableCell><Typography variant="body2">{i.test_name ?? t('center.empty')}</Typography></TableCell>
                      <TableCell>
                        <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
                          {cands.length === 0 && <Typography variant="body2" color="text.secondary">{t('inbox.noCandidate')}</Typography>}
                          {cands.map((c) => (
                            <Stack key={c.purchase.id} direction="row" sx={{ alignItems: 'center', gap: 1, width: '100%' }}>
                              {canManage && <Button size="small" variant="outlined" disabled={busy} onClick={() => void attach(i, c.purchase.id)}>{t('inbox.attach')}</Button>}
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" noWrap title={label(c.purchase)}>{label(c.purchase)}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {c.reasons.map((r) => t(`inbox.reason.${r}` as CopyKey)).join('·')}
                                </Typography>
                              </Box>
                            </Stack>
                          ))}
                          {canManage && (
                            <Button size="small" onClick={() => { setByOrder(i); setOrderId(i.naver_product_order_id ?? ''); setOrderMissing(false) }}>
                              {t('inbox.byOrder')}
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog open={!!byOrder} onClose={() => setByOrder(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('inbox.byOrder')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">{t('inbox.byOrderHelp')}</Typography>
            {orderMissing && <Alert severity="warning">{t('inbox.orderNotFound')}</Alert>}
            <TextField label={t('naver.field.productOrderId')} value={orderId} onChange={(e) => setOrderId(e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setByOrder(null)}>{t('session.dialog.close')}</Button>
          <Button variant="contained" disabled={!orderId.trim() || busy} onClick={() => void submitByOrder()}>{t('inbox.attach')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDismiss} onClose={() => setConfirmDismiss(false)} maxWidth="xs">
        <DialogContent><Typography variant="body2">{t('inbox.dismissConfirm', { n: selected.size })}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDismiss(false)}>{t('inbox.keep')}</Button>
          <Button color="error" variant="contained" disabled={busy}
            onClick={() => { setConfirmDismiss(false); void act(async () => t('inbox.dismissed', { n: await dismissInbox(ids) })) }}>
            {t('inbox.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
      {notice && <Toast key={notice.key} message={notice.message} open onClose={() => setNotice(null)} />}
    </Stack>
  )
}
