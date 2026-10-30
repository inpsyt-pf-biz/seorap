import { Alert, Box, Button, ButtonBase, Divider, Stack, Typography } from '@mui/material'
import { Fragment, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'
import BoxFloor from '../components/BoxFloor'
import Toast from '../components/Toast'
import Wordmark from '../components/Wordmark'
import { api, isSessionEnd } from '../lib/api'
import { tokens } from '../theme/seorap'

// 설정 (10-30 검수): 비밀번호 바꾸기, 로그아웃. 닉네임은 검토 끝에 폐기(10-30).
// 나의 종합 보고서는 추후 오픈이라 아직 메뉴에 두지 않는다 (열 때 이 목록에 한 줄 더한다)
const MENU: { to: string; label: string; help?: string }[] = [
  { to: '/box/settings/pin', label: t('settings.pin') },
]

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  // 비밀번호를 바꾸고 돌아오면 한 줄 알림
  const done = (useLocation().state as { toast?: string } | null)?.toast ?? null
  const [toastOpen, setToastOpen] = useState(!!done)
  const [error, setError] = useState(false)
  const busy = useRef(false)

  // 성공했거나 이미 세션이 끝났을 때만 첫 화면으로. 실패를 성공처럼 보이면 함께 쓰는 휴대폰에서 서랍이 열린 채 남는다
  const logout = async () => {
    if (busy.current) return
    busy.current = true
    setError(false)
    try {
      await api('logout', {})
      navigate('/', { replace: true, state: { loggedOut: true } })
    } catch (e) {
      if (isSessionEnd(e)) navigate('/', { replace: true, state: { loggedOut: true } })
      else { setError(true); busy.current = false }
    }
  }

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={() => navigate('/box')}>{t('common.home')}</Button>
        </Stack>
        <Typography variant="h4">{t('settings.title')}</Typography>
        <Box sx={{ bgcolor: tokens.surface[0], border: 1, borderColor: 'divider', borderRadius: tokens.radius.card, overflow: 'hidden' }}>
          {MENU.map((m, i) => (
            <Fragment key={m.to}>
              {i > 0 && <Divider />}
              <ButtonBase onClick={() => navigate(m.to)} sx={{ width: '100%', px: 2, py: 1.75, justifyContent: 'space-between', textAlign: 'left' }}>
                <Stack spacing={0.25}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{m.label}</Typography>
                  {m.help && <Typography variant="body2" color="text.secondary">{m.help}</Typography>}
                </Stack>
                <Box sx={{ color: 'text.secondary', display: 'flex' }}><Chevron /></Box>
              </ButtonBase>
            </Fragment>
          ))}
        </Box>
        {error && <Alert severity="warning">{t('error.generic')}</Alert>}
        <Button variant="outlined" onClick={logout}>{t('box.logout')}</Button>
        <BoxFloor />
      </Stack>
      {done && <Toast message={done} open={toastOpen} onClose={() => setToastOpen(false)} />}
    </Box>
  )
}
