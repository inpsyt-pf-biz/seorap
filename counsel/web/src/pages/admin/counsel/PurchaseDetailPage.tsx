import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstDate } from '@seorap-core/time.ts'
import type { Center } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { computeProgress } from '@counsel-core/progress.ts'
import { PURCHASE_TYPES, purchaseTypeLabel, type PurchaseType } from '@counsel-core/purchases.ts'
import ExamDeadline from '../../../components/ExamDeadline'
import ExamsTab from '../../../components/ExamsTab'
import HistoryList from '../../../components/HistoryList'
import NotesPanel from '../../../components/NotesPanel'
import { ErrorBox, Loading } from '../../../components/PageState'
import ProgressStepper from '../../../components/ProgressStepper'
import { ApplicationTab, OrderTab } from '../../../components/PurchaseSections'
import SessionsPanel from '../../../components/SessionsPanel'
import { getPurchaseDetail, listCenters, resolveNaverReview, setPurchaseType, type PurchaseDetail } from '../../../lib/api'
import { usePageCommands } from '../../../shell/commands'
import { hasCap, useSession } from '../../../shell/session'

type TabKey = 'sessions' | 'application' | 'exams' | 'naver' | 'history'
type Notice = { message: string; key: number }

// 구매 건 상세. 맨 위에 회차별 진행 단계와 '지금 할 일'을 두고, 상담 진행·메모는 '상담' 탭, 신청서·검사·주문 정보·이력은 각 탭에서 본다.
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
  // Ctrl+K 의 '이 화면' 명령: 탭 열기(상담 탭에서 센터 배정·예약·메모)
  usePageCommands(() => (['sessions', 'application', 'exams', 'naver', 'history'] as TabKey[]).map((k) => ({
    id: `tab-${k}`, label: t('palette.tab', { name: t(`purchaseDetail.tab.${k}` as CopyKey) }),
    keywords: k === 'sessions' ? '센터 배정 예약 메모 상담 불가 취소' : undefined, run: () => setTab(k),
  })), [])

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
  // 진행 단계는 취소되지 않은 회차마다 보인다(모두 취소됐으면 모두)
  const live = detail.sessions.filter((x) => x.status !== 'cancelled')
  const shown = live.length > 0 ? live : detail.sessions
  const progressOf = (s: (typeof detail.sessions)[number]) => computeProgress({
    paidAt: detail.purchase.paid_at,
    createdAt: detail.purchase.created_at,
    applicationAt: typeof a?.submitted_at === 'string' ? a.submitted_at : null,
    hasApplication: !!a,
    session: s,
    completedAt: detail.events.find((e) => e.session_id === s.id && e.to_status === 'completed')?.at ?? null,
    multiSession: live.length > 1,
    tests: detail.tests,
  })

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

      {shown.length > 0 && (
        <Paper sx={{ borderRadius: 4, px: 3, py: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>{t('progress.title')}</Typography>
          <Stack spacing={2.5}>
            {shown.map((s) => (
              <Box key={s.id}>
                <ProgressStepper progress={progressOf(s)} title={shown.length > 1 ? t('session.seq', { n: s.seq }) : undefined} />
                {/* 검사는 구매 건 단위라 회차가 하나일 때만 기한선을 그린다 */}
                {live.length <= 1 && <ExamDeadline session={s} tests={detail.tests} paidAt={detail.purchase.paid_at} today={formatKstDate(new Date().toISOString())} />}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ borderRadius: 4, px: 3, pb: 3 }}>
        <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="sessions" label={t('purchaseDetail.tab.sessions')} />
          <Tab value="application" label={t('purchaseDetail.tab.application')} />
          <Tab value="exams" label={t('purchaseDetail.tab.exams')} />
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
        {tab === 'exams' && <ExamsTab d={detail} />}
        {tab === 'naver' && <OrderTab d={detail} showSettlement={hasCap(state, 'settlement.view')} />}
        {tab === 'history' && <HistoryList events={detail.events} sessions={detail.sessions} centers={centers} names={detail.names} />}
      </Paper>
      {notice && <Toast key={notice.key} message={notice.message} open onClose={() => setNotice(null)} />}
    </Stack>
  )
}
