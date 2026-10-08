import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import DemoBanner from '../components/DemoBanner'
import { useSession } from '../shell/session'

type DevAccount = { label: string; email: string }

// 개발용 계정 목록은 시드가 web/.env.local 에 써 둔다. 운영 빌드에서는 보이지 않는다.
function devAccounts(): DevAccount[] {
  if (!import.meta.env.DEV) return []
  try {
    const parsed: unknown = JSON.parse(import.meta.env.VITE_DEV_ACCOUNTS ?? '[]')
    return Array.isArray(parsed) ? (parsed as DevAccount[]) : []
  } catch {
    return []
  }
}

export default function LoginPage() {
  const { state, signIn } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (state.status === 'ready') return <Navigate to="/" replace />

  const submit = async (e: string, p: string) => {
    setBusy(true)
    setFailed(false)
    const ok = await signIn(e, p)
    setBusy(false)
    if (ok) navigate('/', { replace: true })
    else setFailed(true)
  }

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    void submit(email.trim(), password)
  }

  const accounts = devAccounts()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <DemoBanner />
      <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, pt: 10 }}>
        <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }}>
          <Stack spacing={3} component="form" onSubmit={onSubmit}>
            <Box>
              <Typography variant="body2" color="text.secondary">{t('app.title')}</Typography>
              <Typography variant="h5">{t('auth.title')}</Typography>
            </Box>
            {failed && <Alert severity="error">{t('auth.failed')}</Alert>}
            <TextField label={t('auth.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="contained" disabled={busy}>{t('auth.submit')}</Button>
            {accounts.length > 0 && (
              <>
                <Divider><Typography variant="caption" color="text.secondary">{t('auth.devAccounts')}</Typography></Divider>
                <Stack spacing={1}>
                  {accounts.map((a) => (
                    <Button key={a.email} variant="outlined" disabled={busy}
                      onClick={() => void submit(a.email, import.meta.env.VITE_DEV_PASSWORD ?? '')}>
                      {a.label}
                    </Button>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}
