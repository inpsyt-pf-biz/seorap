import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { CodeResponse, ForwardPageResponse, LaunchResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import CodeDialog from '../components/CodeDialog'
import HelpMarkdown from '../components/HelpMarkdown'
import Wordmark from '../components/Wordmark'
import Toast from '../components/Toast'
import { api, ApiError } from '../lib/api'
import { openInNewWindow } from '../lib/openInNewWindow'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

const TOKEN_RE = /^[A-Za-z0-9]{32}$/

// 막힌 사유별 문장 (build-spec §10 forward.revoked.*). 나머지(번호 변경·신고·관리자·만료 등)는 일반 문장
const REVOKED: Record<string, CopyKey> = {
  reforwarded: 'forward.revoked.reforwarded', forward_cancelled: 'forward.revoked.forward_cancelled',
  voucher_cancelled: 'forward.revoked.voucher_cancelled', resent: 'forward.revoked.resent', unavailable: 'forward.revoked.unavailable',
}
function revokedText(e: ApiError): string {
  const key = REVOKED[String(e.extra.reason)]
  return key ? t(key) : t('state.linkRevoked')
}

// 받는 분 1매 화면 `/f/{토큰}` (build-spec §4-7). 화면을 여는 것만으로는 아무것도 기록하지 않고,
// [실시하기]·[코드 보기]를 누를 때 서버가 "열어 봄"을 남긴다.
export default function ReceiverPage() {
  const { token = '' } = useParams()
  const valid = TOKEN_RE.test(token)
  const [page, setPage] = useState<ForwardPageResponse | null>(null)
  const [blocked, setBlocked] = useState<{ kind: 'linkInvalid' | 'linkRevoked' | 'error'; message?: string } | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'LINK_INVALID') setBlocked({ kind: 'linkInvalid' })
    else if (e instanceof ApiError && e.code === 'LINK_REVOKED') setBlocked({ kind: 'linkRevoked', message: revokedText(e) })
    else return false
    return true
  }

  useEffect(() => {
    if (!valid) return
    api<ForwardPageResponse>('forward/page', { token })
      .then(setPage)
      .catch((e) => { if (!fail(e)) setBlocked({ kind: 'error' }) })
  }, [token, valid])

  // 연타는 한 번만. 실시는 성공하면 화면을 떠나므로 잠금을 풀지 않는다
  const guard = async (fn: () => Promise<void>, keepBusyOnSuccess: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(null)
    let ok = false
    try { await fn(); ok = true }
    catch (e) { if (!fail(e)) setError(t('error.generic')) }
    finally { if (!(ok && keepBusyOnSuccess)) { busyRef.current = false; setBusy(false) } }
  }
  // 검사는 새 창으로 연다. 이 화면은 남으므로 버튼을 [이어서 하기]로 바꾼다 (10-29 검수)
  const launch = () => guard(async () => {
    await openInNewWindow(async () => (await api<LaunchResponse>('forward/launch', { token })).url)
    setPage((p) => p && { ...p, launched: true })
  }, false)
  const showCode = () => guard(async () => setCode((await api<CodeResponse>('forward/code', { token })).code), false)

  if (!valid) return <StatePage kind="notFound" />
  if (blocked) return <StatePage kind={blocked.kind} message={blocked.message} />
  if (!page) return null

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Wordmark />
        <Typography variant="body1" color="text.secondary">{t('receiver.from', { name: page.senderName })}</Typography>
        <Typography variant="h5">{page.testName}</Typography>
        <Button variant="contained" size="large" disabled={busy} onClick={launch}>
          {t(page.launched ? 'action.continue' : 'action.launch')}
        </Button>
        <Accordion disableGutters elevation={0} expanded={more} onChange={(_, v) => setMore(v)}>
          <AccordionSummary><Typography variant="body2">{t(more ? 'forward.less' : 'forward.more')}</Typography></AccordionSummary>
          <AccordionDetails>
            <Button variant="outlined" fullWidth disabled={busy} onClick={showCode}>{t('receiver.codePc')}</Button>
          </AccordionDetails>
        </Accordion>
        {error && <Alert severity="warning">{error}</Alert>}
        <Stack spacing={1}>
          <Box sx={{ color: 'text.secondary' }}><HelpMarkdown md={page.contact} /></Box>
          <Typography variant="caption" color="text.secondary">{t('receiver.scam')}</Typography>
        </Stack>
      </Stack>
      <CodeDialog code={code} onClose={() => setCode(null)} onCopied={() => { setCode(null); setCopied(true) }} />
      <Toast message={t('code.copied')} open={copied} onClose={() => setCopied(false)} />
    </Box>
  )
}
