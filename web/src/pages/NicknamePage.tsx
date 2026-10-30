import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProfileResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { checkNickname, NICKNAME_MAX } from '@core/nickname.ts'
import Wordmark from '../components/Wordmark'
import { api, isSessionEnd } from '../lib/api'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

// 설정 > 닉네임 설정 (10-30 검수). 검사를 전달할 때 받는 분에게 보이는 이름. 비워 두면 가린 실명으로 보인다
export default function NicknamePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    api<ProfileResponse>('profile').then((p) => { setProfile(p); setValue(p.nickname ?? '') }).catch((e) => {
      if (isSessionEnd(e)) setExpired(true)
      else setMessage(t('error.generic'))
    })
  }, [])

  const save = async () => {
    if (busy) return
    const v = value.trim()
    if (v && checkNickname(v)) { setMessage(t('nickname.error')); return }
    setBusy(true); setMessage(null)
    try {
      await api('profile/nickname', { nickname: v || null })
      navigate('/box/settings', { replace: true, state: { toast: t('nickname.saved') } })
    } catch (e) {
      setBusy(false)
      if (isSessionEnd(e)) setExpired(true)
      else setMessage(t('error.generic'))
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
        <Typography variant="h4">{t('nickname.title')}</Typography>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">{t('settings.nicknameHelp')}</Typography>
          {profile && <Typography variant="body2" color="text.secondary">{t('nickname.help', { name: profile.defaultName })}</Typography>}
        </Stack>
        <TextField
          label={t('nickname.label')} value={value} disabled={!profile || busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          slotProps={{ htmlInput: { maxLength: NICKNAME_MAX } }}
        />
        <Button variant="contained" size="large" disabled={!profile || busy} onClick={save}>{t('nickname.save')}</Button>
        {message && <Alert severity="warning">{message}</Alert>}
      </Stack>
    </Box>
  )
}
