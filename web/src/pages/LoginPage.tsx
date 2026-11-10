import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'
import EntryShell from '../components/EntryShell'
import { api, ApiError } from '../lib/api'

// 메인·로그아웃 뒤 화면 (11-10 건우님 결정): 이름 + 휴대전화번호 + 비밀번호 6자리를 한 번에 받아 서랍을 연다.
// 셋을 한 번에 받는 이유: 이름·번호만으로 구매자인지 떠보는 길을 막는다. 무엇이 틀렸는지는 서버도 화면도 말하지 않는다.
// 처음 들어오는 분·비밀번호를 잊은 분은 지금처럼 알림톡 링크 + 문자 인증으로 들어온다
const digits = (s: string) => s.replace(/\D/g, '')
// 입력 칸 표시: 010-1234-5678
function formatTyping(s: string): string {
  const d = digits(s).slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}

export default function LoginPage() {
  const navigate = useNavigate()
  const loggedOut = (useLocation().state as { loggedOut?: boolean } | null)?.loggedOut === true
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const ready = name.trim() !== '' && digits(phone).length >= 10 && pin.length === 6

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true); setMessage(null)
    try {
      await api('login', { name: name.trim(), phone: digits(phone), pin })
      navigate('/box', { replace: true })
    } catch (e) {
      setPin('')
      if (e instanceof ApiError && (e.code === 'LOGIN_FAILED' || e.code === 'VALIDATION')) setMessage(t('login.failed'))
      else if (e instanceof ApiError && e.code === 'RATE_LIMITED') setMessage(t('login.rateLimited'))
      else setMessage(t('error.generic'))
    } finally {
      setBusy(false)
    }
  }
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }

  return (
    <EntryShell>
      {loggedOut && <Alert severity="info">{t('login.loggedOut')}</Alert>}
      <Stack spacing={1}>
        <Typography component="h1" variant="h5">{t('login.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('login.body')}</Typography>
      </Stack>
      <Stack component="form" spacing={1.5} onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate>
        <TextField
          label={t('login.name')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter}
          slotProps={{ htmlInput: { autoComplete: 'name', maxLength: 50, enterKeyHint: 'next' } }}
        />
        <TextField
          label={t('login.phone')} value={phone} onChange={(e) => setPhone(formatTyping(e.target.value))} onKeyDown={onEnter}
          placeholder="010-1234-5678"
          slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'tel', maxLength: 13, enterKeyHint: 'next' } }}
        />
        <TextField
          label={t('login.pin')} type="password" value={pin} onChange={(e) => setPin(digits(e.target.value).slice(0, 6))} onKeyDown={onEnter}
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'current-password', maxLength: 6, enterKeyHint: 'go' } }}
        />
        {message && <Alert severity="warning">{message}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={!ready || busy}>{t('login.submit')}</Button>
      </Stack>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">{t('login.first')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('login.forgot')}</Typography>
      </Stack>
    </EntryShell>
  )
}
