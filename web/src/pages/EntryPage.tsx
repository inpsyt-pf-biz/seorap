import { Alert, Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { EntryResponse, OtpRequestResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import { useCountdown } from '../lib/useCountdown'
import StatePage, { type StateKind } from './StatePage'

const TOKEN_RE = /^[A-Za-z0-9]{32}$/
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t('error.generic')
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
  const left = useCountdown(otp?.expiresAt ?? null)
  const resendLeft = useCountdown(otp?.resendAt ?? null)

  useEffect(() => {
    if (!valid) return
    api<EntryResponse>('entry', { token })
      .then(setEntry)
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
    try { await api('otp/verify', { token, code }); navigate('/box', { replace: true }) }
    catch (e) { setMessage(errorText(e)) }
    finally { setBusy(false) }
  }

  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Wordmark />
        {entry.noticeBanner && <Alert severity="info">{entry.noticeBanner}</Alert>}
        <Typography variant="h5">{t('entry.title', { name: entry.nameMasked })}</Typography>
        {!otp ? (
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
