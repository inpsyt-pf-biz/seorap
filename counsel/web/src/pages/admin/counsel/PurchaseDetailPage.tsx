import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import type { Center } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { PURCHASE_TYPES, purchaseTypeLabel, type PurchaseType } from '@counsel-core/purchases.ts'
import HistoryList from '../../../components/HistoryList'
import NotesPanel from '../../../components/NotesPanel'
import { ErrorBox, Loading } from '../../../components/PageState'
import { ApplicationTab, NaverTab } from '../../../components/PurchaseSections'
import SessionsPanel from '../../../components/SessionsPanel'
import { getPurchaseDetail, listCenters, resolveNaverReview, setPurchaseType, type PurchaseDetail } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

type TabKey = 'sessions' | 'application' | 'naver' | 'history'
type Notice = { message: string; key: number }

// 구매 건 상세. 상담 회차의 진행과 메모는 '상담' 탭에서, 신청서·네이버 주문·이력은 각 탭에서 본다.
// 미분류 구분 정하기와 '확인 필요' 내리기는 탭 위에 둔다(구매 건 전체에 걸린 일).
export default function PurchaseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const back = (location.state as { back?: string } | null)?.back ?? '/admin/counsel/purchases'
  const { state } = useSession()
  const [detail, setDetail] = useState<PurchaseDetail | null>(null)
  const [centers, setCenters] = useState<Center[]>([])
  const [error, setError] = useState<CounselError | null>(null)
  const [tab, setTab] = useState<TabKey>('sessions')
  const [type, setType] = useState<PurchaseType | ''>('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<CounselError | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    Promise.all([getPurchaseDetail(id), listCenters()]).then(
      ([d, c]) => { setDetail(d); setCenters(c) },
      (e: unknown) => setError(toCounselError(e)),
    )
  }, [id])

  // 바꾼 뒤에는 상세를 다시 읽고 나서야 다음 일을 받는다(옛 version 으로 두 번 보내지 않게)
  const refresh = useCallback(async (message: string) => {
    const d = await getPurchaseDetail(id)
    setDetail(d)
    setNotice({ message, key: Date.now() })
  }, [id])

  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await work()
      await refresh(message)
    } catch (e) {
      setActionError(toCounselError(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorBox message={errorText(error)} />
  if (!detail) return <Loading />

  const a = detail.application
  const name = (a?.client_name as string | null) ?? (a?.guardian_name as string | null) ?? detail.orderer?.name_masked ?? t('center.empty')
  const canManage = hasCap(state, 'purchase.manage')

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
        <Typography variant="h5">{name}</Typography>
        <Chip size="small" label={purchaseTypeLabel(detail.purchase.purchase_type)} color={detail.purchase.purchase_type ? 'default' : 'warning'} variant="outlined" />
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" onClick={() => navigate(back)}>{t('purchaseDetail.back')}</Button>
      </Stack>

      {actionError && <Alert severity="error">{errorText(actionError)}</Alert>}
      {detail.purchase.purchase_type === null && canManage && (
        <Alert severity="info" action={
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
            <TextField select size="small" label={t('purchase.field.type')} value={type} onChange={(e) => setType(e.target.value as PurchaseType)} sx={{ minWidth: 140 }}>
              {PURCHASE_TYPES.map((p) => <MenuItem key={p} value={p}>{purchaseTypeLabel(p)}</MenuItem>)}
            </TextField>
            <Button size="small" variant="contained" disabled={!type || busy}
              onClick={() => type && void act(() => setPurchaseType(id, detail.purchase.version, type), t('purchaseDetail.typeSaved'))}>
              {t('purchaseDetail.save')}
            </Button>
          </Stack>
        }>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('purchaseDetail.setType')}</Typography>
          <Typography variant="caption">{t('purchaseDetail.setTypeHelp')}</Typography>
        </Alert>
      )}
      {detail.naver?.needs_review && (
        <Alert severity="warning" action={canManage
          ? <Button size="small" color="inherit" disabled={busy} onClick={() => void act(() => resolveNaverReview(id), t('naver.reviewResolved'))}>{t('naver.reviewResolve')}</Button>
          : undefined}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('naver.review')}</Typography>
          <Typography variant="caption">{detail.naver.review_reason}</Typography>
        </Alert>
      )}

      <Paper sx={{ borderRadius: 4, px: 3, pb: 3 }}>
        <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="sessions" label={t('purchaseDetail.tab.sessions')} />
          <Tab value="application" label={t('purchaseDetail.tab.application')} />
          <Tab value="naver" label={t('purchaseDetail.tab.naver')} />
          <Tab value="history" label={t('purchaseDetail.tab.history')} />
        </Tabs>
        {tab === 'sessions' && (
          <Stack spacing={3}>
            <SessionsPanel sessions={detail.sessions} centers={centers} canManage={hasCap(state, 'session.manage')} canAssign={hasCap(state, 'session.assign')} onChanged={refresh} />
            <NotesPanel purchaseId={id} notes={detail.notes} names={detail.names} canWrite={hasCap(state, 'note.write')} onChanged={refresh} />
          </Stack>
        )}
        {tab === 'application' && <ApplicationTab d={detail} />}
        {tab === 'naver' && <NaverTab d={detail} showSettlement={hasCap(state, 'settlement.view')} />}
        {tab === 'history' && <HistoryList events={detail.events} sessions={detail.sessions} centers={centers} names={detail.names} />}
      </Paper>
      {notice && <Toast key={notice.key} message={notice.message} open onClose={() => setNotice(null)} />}
    </Stack>
  )
}
