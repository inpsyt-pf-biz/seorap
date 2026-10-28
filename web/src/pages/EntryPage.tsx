import { Alert, Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { EntryResponse, OtpRequestResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import { useCountdown } from '../lib/useCountdown'
import { tokens } from '../theme/seorap'
import StatePage, { type StateKind } from './StatePage'

const TOKEN_RE = /^[A-Za-z0-9]{32}$/
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t('error.generic')
  if (e.code === 'PIN_WRONG') return t('pin.wrong', { n: Number(e.extra.remaining ?? 0) })
  if (e.code === 'PIN_LOCKED') return t('pin.locked')
  if (e.code === 'OTP_WRONG') return t('otp.wrong', { n: Number(e.extra.remaining ?? 0) })
  if (e.code === 'OTP_EXPIRED') return t('otp.expired')
  if (e.code === 'OTP_LOCKED') return t('otp.locked', { time: formatKstDateTime(String(e.extra.until)) })
  if (e.code === 'RATE_LIMITED') return t('otp.rateLimited', { time: formatKstDateTime(String(e.extra.retryAt)) })
  return t('error.generic')
}

export default function EntryPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const valid = TOKEN_RE.test(token)
  const [entry, setEntry] = useState<EntryResponse | null>(null)
  const [fatal, setFatal] = useState<StateKind | null>(null)
  const [otp, setOtp] = useState<OtpRequestResponse | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  // PIN 을 정한 서랍은 PIN 부터, 잠겼거나 [PIN을 잊었어요]를 누르면 OTP 로 (build-spec §4-2a)
  const [usePin, setUsePin] = useState(false)
  const [pin, setPin] = useState('')
  const left = useCountdown(otp?.expiresAt ?? null)
  const resendLeft = useCountdown(otp?.resendAt ?? null)

  useEffect(() => {
    if (!valid) return
    api<EntryResponse>('entry', { token })
      .then((r) => {
        setEntry(r)
        setUsePin(r.hasPin && !r.pinLocked)
        if (r.pinLocked) setMessage(t('pin.locked'))
      })
      .catch((e) => {
        const c = e instanceof ApiError ? e.code : null
        setFatal(c === 'LINK_INVALID' ? 'linkInvalid' : c === 'LINK_REVOKED' ? 'linkRevoked' : c === 'FORBIDDEN' ? 'blocked' : 'error')
      })
  }, [token, valid])

  if (!valid) return <StatePage kind="notFound" />
  if (fatal) return <StatePage kind={fatal} />
  if (!entry) return null

  const requestOtp = async () => {
    setBusy(true); setMessage(null)
    try { setOtp(await api<OtpRequestResponse>('otp/request', { token })); setCode('') }
    catch (e) { setMessage(errorText(e)) }
    finally { setBusy(false) }
  }
  const verify = async () => {
    setBusy(true); setMessage(null)
    // 성공하면 화면이 바뀌므로 busy 를 풀지 않는다 (옛 화면에서 버튼이 다시 살아나지 않게)
    // OTP 를 통과하면 언제나 PIN 을 (새로) 정한다
    try { await api('otp/verify', { token, code }); navigate('/pin', { replace: true }) }
    catch (e) { setMessage(errorText(e)); setBusy(false) }
  }
  const verifyPin = async () => {
    setBusy(true); setMessage(null)
    try { await api('pin/verify', { token, pin }); navigate('/box', { replace: true }) }
    catch (e) {
      setMessage(errorText(e)); setPin(''); setBusy(false)
      // 잠겼거나 PIN 이 없어졌으면 OTP 로 넘긴다
      if (e instanceof ApiError && (e.code === 'PIN_LOCKED' || e.code === 'CONFLICT')) setUsePin(false)
    }
  }
  const forgotPin = () => { setUsePin(false); setPin(''); setMessage(null) }

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Wordmark />
        {entry.noticeBanner && <Alert severity="info">{entry.noticeBanner}</Alert>}
        <Typography variant="h5">{t('entry.title', { name: entry.nameMasked })}</Typography>
        {usePin ? (
          <>
            <Typography variant="body1">{t('pin.enter')}</Typography>
            <TextField
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 6 && !busy) void verifyPin() }}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'current-password', maxLength: 6, 'aria-label': t('pin.enter') } }}
              autoFocus
            />
            <Button variant="contained" size="large" disabled={busy || pin.length !== 6} onClick={verifyPin}>{t('common.confirm')}</Button>
            <Button variant="text" disabled={busy} onClick={forgotPin}>{t('pin.forgot')}</Button>
          </>
        ) : !otp ? (
          <>
            <Typography variant="body1">{t('entry.send', { phone: entry.phoneMasked })}</Typography>
            <Button variant="contained" size="large" disabled={busy} onClick={requestOtp}>{t('entry.button')}</Button>
            <Typography variant="caption" color="text.secondary">{t('entry.notice')}</Typography>
          </>
        ) : (
          <>
            <Typography variant="body1">{t('otp.title')}</Typography>
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, 'aria-label': t('otp.title') } }}
              autoFocus
            />
            <Typography variant="body2" color="text.secondary">{t('otp.remaining', { time: mmss(left) })}</Typography>
            <Button variant="contained" size="large" disabled={busy || code.length !== 6} onClick={verify}>{t('otp.submit')}</Button>
            <Stack direction="row" spacing={1}>
              <Button variant="text" disabled={busy || resendLeft > 0} onClick={requestOtp}>{t('otp.resend')}</Button>
              <Button variant="text" onClick={() => setHelp((v) => !v)}>{t('otp.noSms')}</Button>
            </Stack>
            <Collapse in={help}><Typography variant="body2" color="text.secondary">{t('otp.noSms.help')}</Typography></Collapse>
          </>
        )}
        {message && <Alert severity="warning">{message}</Alert>}
      </Stack>
    </Box>
  )
}
