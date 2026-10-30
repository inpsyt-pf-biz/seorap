import { Alert, Button, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'
import { checkPin } from '@core/pin.ts'
import ClosedShell from '../components/ClosedShell'
import { api, ApiError } from '../lib/api'
import StatePage from './StatePage'

// OTP 를 막 통과한 사람이 PIN 을 정하는 화면 (처음 · 잊어서 다시 모두). build-spec §4-2a
export default function PinSetPage() {
  const navigate = useNavigate()
  const [first, setFirst] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)

  if (expired) return <StatePage kind="sessionExpired" />

  const next = () => {
    const problem = checkPin(pin)
    if (problem) { setMessage(t(problem === 'weak' ? 'pin.set.weak' : 'pin.set.format')); setPin(''); return }
    setMessage(null); setFirst(pin); setPin('')
  }
  const done = async () => {
    if (pin !== first) { setMessage(t('pin.set.mismatch')); setFirst(null); setPin(''); return }
    setBusy(true); setMessage(null)
    // 성공하면 화면이 바뀌므로 busy 를 풀지 않는다
    try { await api('pin/set', { pin }); navigate('/box', { replace: true }) }
    catch (e) {
      setBusy(false)
      if (e instanceof ApiError && e.code === 'SESSION_EXPIRED') { setExpired(true); return }
      if (e instanceof ApiError && e.code === 'REAUTH_REQUIRED') { setMessage(t('pin.set.expired')); return }
      if (e instanceof ApiError && e.code === 'VALIDATION') setMessage(t(e.extra.reason === 'weak' ? 'pin.set.weak' : 'pin.set.format'))
      else setMessage(t('error.generic'))
      setFirst(null); setPin('')
    }
  }
  const ready = pin.length === 6

  return (
    <ClosedShell>
        <Typography variant="h5">{t('pin.set.title')}</Typography>
        <Typography variant="body1">{first === null ? t('pin.set.help') : t('pin.set.again')}</Typography>
        <TextField
          key={first === null ? 'first' : 'again'}
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void (first === null ? next() : done()) }}
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'new-password', maxLength: 6, 'aria-label': first === null ? t('pin.set.title') : t('pin.set.again') } }}
          autoFocus
        />
        {first === null
          ? <Button variant="contained" size="large" disabled={!ready} onClick={next}>{t('pin.set.next')}</Button>
          : <Button variant="contained" size="large" disabled={!ready || busy} onClick={done}>{t('pin.set.done')}</Button>}
        {message && <Alert severity="warning">{message}</Alert>}
    </ClosedShell>
  )
}
