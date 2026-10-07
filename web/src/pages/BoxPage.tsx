import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BoxGroup, BoxLine, BoxResponse, CodeResponse, ForwardResponse, LaunchResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import type { LineAction } from '@core/lineStatus.ts'
import { formatKstDate, formatKstDateTime } from '@core/time.ts'
import ConfirmDialog from '../components/ConfirmDialog'
import ForwardSheet from '../components/ForwardSheet'
import LineRow from '../components/LineRow'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import StatePage from './StatePage'

type Pending =
  | { kind: 'choose'; line: BoxLine; sibling: BoxLine }
  | { kind: 'code'; code: string }
  | { kind: 'resend'; line: BoxLine }
  | { kind: 'reforward'; line: BoxLine }
  | null

// 한도 429 는 이유(reason)별 문장으로 안내한다. 모르는 이유는 일반 문장으로 보낸다.
const LIMIT_KEY = {
  per_voucher_day: 'limit.per_voucher_day', same_number_gap: 'limit.same_number_gap', per_box_day: 'limit.per_box_day',
} as const satisfies Record<string, CopyKey>

function failText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.extra.reason === 'code_exposed') return t('forward.exposed')
    const reason = String(e.extra.reason)
    if (e.code === 'LIMIT_EXCEEDED' && Object.hasOwn(LIMIT_KEY, reason) && typeof e.extra.retryAt === 'string') {
      return t(LIMIT_KEY[reason as keyof typeof LIMIT_KEY], { time: formatKstDateTime(e.extra.retryAt) })
    }
  }
  return t('error.generic')
}

export default function BoxPage() {
  const navigate = useNavigate()
  const [box, setBox] = useState<BoxResponse | null>(null)
  const [expired, setExpired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sheetLine, setSheetLine] = useState<BoxLine | null>(null)

  const load = useCallback(async () => {
    try { setBox(await api<BoxResponse>('box')) }
    catch (e) { if (e instanceof ApiError && e.status === 401) setExpired(true); else setMessage(t('error.generic')) }
  }, [])
  // 화면이 열릴 때 서랍을 불러오는 것은 외부(서버)와의 동기화다
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // 세션이 끝난 채로 무엇을 누르든 "다시 인증" 화면으로 (Review Focus 3)
  const guard = async (fn: () => Promise<void>) => {
    setMessage(null)
    try { await fn() }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { setExpired(true); return }
      setMessage(failText(e))
      // 409: 그사이 줄의 상태가 바뀌었다(방금 전달됨 등). 낡은 버튼이 남지 않게 다시 불러온다.
      if (e instanceof ApiError && e.code === 'CONFLICT') void load()
    }
  }

  const launch = (voucherId: string) => guard(async () => {
    const r = await api<LaunchResponse>('voucher/launch', { voucherId })
    window.location.assign(r.url)
  })

  const onAction = (a: LineAction | 'code', line: BoxLine, group: BoxGroup) => {
    if (a === 'launch' || a === 'continue') {
      const sibling = group.lines.find((l) => l.testItemId === line.testItemId && l.voucherId !== line.voucherId && l.firstLaunchedAt && l.status.actions.includes('continue'))
      if (a === 'launch' && sibling) { setPending({ kind: 'choose', line, sibling }); return }
      void launch(line.voucherId)
    } else if (a === 'code') {
      void guard(async () => setPending({ kind: 'code', code: (await api<CodeResponse>('voucher/code', { voucherId: line.voucherId })).code }))
    } else if (a === 'forward') setSheetLine(line)
    else if (a === 'resend') setPending({ kind: 'resend', line })
    else if (a === 'reforward') setPending({ kind: 'reforward', line })
  }

  const logout = () => guard(async () => { await api('logout', {}); navigate('/', { replace: true }) })

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
        {message && <Alert severity="warning">{message}</Alert>}
        {box.groups.length === 0 && <Typography variant="body1" color="text.secondary">{t('box.empty')}</Typography>}
        {box.groups.map((g) => (
          <Accordion key={g.orderId} defaultExpanded={!g.done} disableGutters>
            <AccordionSummary>
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
        cancelLabel={t('common.close')}
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
          void guard(async () => { await api<ForwardResponse>('forward/resend', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() }); await load() })
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reforward'}
        message={pending?.kind === 'reforward' ? t('forward.reforward.confirm', { name: pending.line.forwardTo?.name ?? '' }) : ''}
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
      <ForwardSheet line={sheetLine} onClose={() => setSheetLine(null)} onDone={async () => { setSheetLine(null); await load() }} onExpired={() => setExpired(true)} />
    </Box>
  )
}
