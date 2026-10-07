import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BoxGroup, BoxLine, BoxResponse, CodeResponse, ForwardResponse, LaunchResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import type { LineAction } from '@core/lineStatus.ts'
import { formatKstDate } from '@core/time.ts'
import ConfirmDialog from '../components/ConfirmDialog'
import ForwardSheet from '../components/ForwardSheet'
import LineRow from '../components/LineRow'
import Wordmark from '../components/Wordmark'
import { api, ApiError, isSessionEnd } from '../lib/api'
import { failText } from '../lib/failText'
import StatePage from './StatePage'

// 묶음 펼침 기억 (주문 ID → 펼침). 처음 본 묶음만 done 으로 정하고, 그 뒤에 서랍을 다시 불러와도(동작 뒤, 전달 이력 탭에
// 갔다 온 뒤) 사용자가 보던 상태를 바꾸지 않는다. 화면을 다시 열어도 이어지도록 모듈에 둔다. 주문 ID 만 담는다.
const expandedMemory = new Map<string, boolean>()

// 펼침 표시(▾). 아이콘 패키지 없이 그린다. 펼치면 MUI 가 뒤집는다.
function ExpandChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Pending =
  | { kind: 'choose'; line: BoxLine; sibling: BoxLine }
  | { kind: 'code'; code: string }
  | { kind: 'resend'; line: BoxLine }
  | { kind: 'reforward'; line: BoxLine }
  | null

export default function BoxPage() {
  const navigate = useNavigate()
  const [box, setBox] = useState<BoxResponse | null>(null)
  const [expired, setExpired] = useState(false)
  // 오류는 warning, 다시 보내기 성공은 success
  const [message, setMessage] = useState<{ text: string; severity: 'warning' | 'success' } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sheetLine, setSheetLine] = useState<BoxLine | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(expandedMemory))
  // 서버를 부르는 동작이 진행 중인지. state 가 아니라 ref 인 이유: 화면이 다시 그려지기 전에 들어오는 연타도 막아야 한다
  const busyRef = useRef(false)

  // 실시 화면으로 이동한 뒤 뒤로 가기로 캐시된 이 화면이 되살아나면, 이동 중이라 잠가 둔 표시를 풀어 준다
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) busyRef.current = false }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await api<BoxResponse>('box')
      for (const g of r.groups) if (!expandedMemory.has(g.orderId)) expandedMemory.set(g.orderId, !g.done)
      setExpanded(Object.fromEntries(expandedMemory))
      setBox(r)
    } catch (e) { if (isSessionEnd(e)) setExpired(true); else setMessage({ text: t('error.generic'), severity: 'warning' }) }
  }, [])
  const toggle = (orderId: string, open: boolean) => {
    expandedMemory.set(orderId, open)
    setExpanded(Object.fromEntries(expandedMemory))
  }
  // 화면이 열릴 때 서랍을 불러오는 것은 외부(서버)와의 동기화다
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // 세션이 끝난 채로 무엇을 누르든 "다시 인증" 화면으로 (Review Focus 3)
  // 처리 중에 들어온 두 번째 호출은 무시한다. 연타가 append-only events 에 중복 행을 남기면 지울 수 없다.
  // keepBusyOnSuccess: 성공하면 이 화면을 떠나므로(실시 이동) 잠금을 풀지 않는다.
  const guard = async (fn: () => Promise<void>, keepBusyOnSuccess = false) => {
    if (busyRef.current) return
    busyRef.current = true
    let ok = false
    setMessage(null)
    try { await fn(); ok = true }
    catch (e) {
      if (isSessionEnd(e)) { setExpired(true); return }
      setMessage({ text: failText(e), severity: 'warning' })
      // 409: 그사이 줄의 상태가 바뀌었다(방금 전달됨 등). 낡은 버튼이 남지 않게 다시 불러온다.
      if (e instanceof ApiError && e.code === 'CONFLICT') void load()
    } finally {
      if (!(ok && keepBusyOnSuccess)) busyRef.current = false
    }
  }

  const launch = (voucherId: string) => guard(async () => {
    const r = await api<LaunchResponse>('voucher/launch', { voucherId })
    window.location.assign(r.url)
  }, true)

  const onAction = (a: LineAction | 'code', line: BoxLine, group: BoxGroup) => {
    // 결과 보기는 선택 창 없이 바로 플랫폼 주소를 연다. 플랫폼이 결과를, 아직 끝나지 않았으면 검사 화면을 보인다.
    if (a === 'result') void launch(line.voucherId)
    else if (a === 'launch' || a === 'continue') {
      // 새 1매를 쓰려는데 같은 검사에 응시 중(이어서 하기)인 줄이 있으면 어느 쪽인지 먼저 묻는다
      const sibling = group.lines.find((l) => l.testItemId === line.testItemId && l.voucherId !== line.voucherId && l.firstLaunchedAt && l.status.actions.includes('continue'))
      if (a === 'launch' && sibling) { setPending({ kind: 'choose', line, sibling }); return }
      void launch(line.voucherId)
    } else if (a === 'code') {
      void guard(async () => setPending({ kind: 'code', code: (await api<CodeResponse>('voucher/code', { voucherId: line.voucherId })).code }))
    } else if (a === 'forward') setSheetLine(line)
    else if (a === 'resend') setPending({ kind: 'resend', line })
    else if (a === 'reforward') setPending({ kind: 'reforward', line })
  }

  const logout = () => guard(async () => { await api('logout', {}); navigate('/', { replace: true, state: { loggedOut: true } }) })

  if (expired) return <StatePage kind="sessionExpired" />
  if (!box) return message ? <StatePage kind="error" /> : null

  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={logout}>{t('box.logout')}</Button>
        </Stack>
        {box.noticeBanner && <Alert severity="info">{box.noticeBanner}</Alert>}
        <Typography variant="h5">{t('box.title', { name: box.ownerName })}</Typography>
        <Typography variant="body2" color="text.secondary">{t('box.summary', { n: box.notStartedCount })}</Typography>
        <Tabs value={0} onChange={(_, v) => v === 1 && navigate('/box/history')}>
          <Tab label={t('box.tab.mine')} />
          <Tab label={t('box.tab.history')} />
        </Tabs>
        {message && <Alert severity={message.severity}>{message.text}</Alert>}
        {box.groups.length === 0 && <Typography variant="body1" color="text.secondary">{t('box.empty')}</Typography>}
        {box.groups.map((g) => (
          <Accordion key={g.orderId} expanded={expanded[g.orderId] ?? !g.done} onChange={(_, open) => toggle(g.orderId, open)} disableGutters>
            <AccordionSummary expandIcon={<ExpandChevron />}>
              <Typography variant="body2" color="text.secondary">
                {g.lineCount > 1
                  ? t('box.group', { date: formatKstDate(g.purchasedAt), product: g.productName, n: g.lineCount })
                  : t('box.groupSingle', { date: formatKstDate(g.purchasedAt), product: g.productName })}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {g.lines.map((l) => <LineRow key={l.voucherId} line={l} onAction={(a, line) => onAction(a, line, g)} />)}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>

      <ConfirmDialog
        open={pending?.kind === 'choose'}
        message={t('launch.choose')}
        confirmLabel={t('launch.continue')}
        cancelLabel={t('launch.new')}
        onConfirm={() => { if (pending?.kind === 'choose') void launch(pending.sibling.voucherId); setPending(null) }}
        onCancel={() => { if (pending?.kind === 'choose') void launch(pending.line.voucherId); setPending(null) }}
        onDismiss={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'code'}
        title={t('code.title')}
        message={pending?.kind === 'code' ? `${pending.code}\n${t('code.pcNote')}` : ''}
        confirmLabel={t('common.close')}
        onConfirm={() => setPending(null)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'resend'}
        message={pending?.kind === 'resend' ? t('forward.resend.confirm', { name: pending.line.forwardTo?.name ?? '' }) : ''}
        confirmLabel={t('forward.send')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (pending?.kind !== 'resend') return
          const line = pending.line
          setPending(null)
          void guard(async () => {
            await api<ForwardResponse>('forward/resend', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() })
            await load()
            setMessage({ text: t('forward.sent', { name: line.forwardTo?.name ?? '' }), severity: 'success' })
          })
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reforward'}
        message={pending?.kind === 'reforward' ? (pending.line.forwardTo ? t('forward.reforward.confirm', { name: pending.line.forwardTo.name }) : t('forward.reforward.confirmDirect')) : ''}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (pending?.kind !== 'reforward') return
          const line = pending.line
          setPending(null)
          void guard(async () => {
            await api<ForwardResponse>('forward/cancel', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() })
            await load()
            setSheetLine({ ...line, forwardTo: null })
          })
        }}
        onCancel={() => setPending(null)}
      />
      <ForwardSheet
        line={sheetLine}
        onClose={() => setSheetLine(null)}
        onDone={async (done) => {
          setSheetLine(null)
          await load()
          // 전달에 성공했다면 시트가 보여 주던 성공 안내를 서랍 위에 이어서 보인다 (다시 보내기와 같은 안내)
          if (done) setMessage({ text: done, severity: 'success' })
        }}
        onExpired={() => setExpired(true)}
      />
    </Box>
  )
}
