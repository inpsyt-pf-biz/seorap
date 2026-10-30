import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError, isSessionEnd } from '../lib/api'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

// 설정 > 비밀번호 바꾸기 (10-30 검수). 지금 비밀번호 → 새 비밀번호 → 한 번 더. 서버는 마지막에 한 번만 부른다
type Step = 'current' | 'next' | 'again'
const LABEL: Record<Step, string> = { current: t('pin.change.current'), next: t('pin.change.next'), again: t('pin.set.again') }

export default function PinChangePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('current')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const ready = pin.length === 6

  const go = async () => {
    if (!ready || busy) return
    setMessage(null)
    if (step === 'current') { setCurrent(pin); setPin(''); setStep('next'); return }
    if (step === 'next') { setNext(pin); setPin(''); setStep('again'); return }
    if (pin !== next) { setMessage(t('pin.set.mismatch')); setPin(''); setNext(''); setStep('next'); return }
    setBusy(true)
    try {
      await api('pin/change', { current, next })
      navigate('/box/settings', { replace: true, state: { toast: t('pin.change.saved') } })
    } catch (e) {
      setBusy(false)
      if (isSessionEnd(e)) { setExpired(true); return }
      setPin('')
      if (e instanceof ApiError && e.code === 'PIN_WRONG') { setMessage(t('pin.wrong', { n: Number(e.extra.remaining ?? 0) })); setStep('current'); return }
      if (e instanceof ApiError && e.code === 'PIN_LOCKED') { setMessage(t('pin.locked')); setStep('current'); return }
      if (e instanceof ApiError && e.code === 'VALIDATION' && e.extra.field === 'next') {
        setMessage(t(e.extra.reason === 'weak' ? 'pin.set.weak' : 'pin.set.format')); setStep('next'); return
      }
      setMessage(t('error.generic'))
    }
  }

  if (expired) return <StatePage kind="sessionExpired" />
  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={() => navigate('/box/settings')}>{t('common.cancel')}</Button>
        </Stack>
        <Typography variant="h4">{t('settings.pin')}</Typography>
        <Typography variant="body1">{LABEL[step]}</Typography>
        <TextField
          key={step} type="password" value={pin} autoFocus
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') void go() }}
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: step === 'current' ? 'current-password' : 'new-password', maxLength: 6, 'aria-label': LABEL[step] } }}
        />
        <Button variant="contained" size="large" disabled={!ready || busy} onClick={go}>
          {step === 'again' ? t('pin.change.done') : t('pin.set.next')}
        </Button>
        {message && <Alert severity="warning">{message}</Alert>}
      </Stack>
    </Box>
  )
}
