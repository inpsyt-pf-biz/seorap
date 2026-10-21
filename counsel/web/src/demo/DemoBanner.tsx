import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { useSession } from '../shell/session'
import { tokens } from '../theme/admin'
import { demoDb } from './fakeSupabase'

const START = '#/admin/counsel/purchases'

// 체험판 빌드에서 components/DemoBanner 대신 들어간다. 가짜 데이터라는 안내, 처음 상태로 되돌리기,
// 로그아웃한 뒤 계정 없이 다시 들어가기(체험판 로그인은 아무 값이나 받는다).
export default function DemoBanner() {
  const { state, signIn } = useSession()
  const [open, setOpen] = useState(false)

  const reset = () => {
    demoDb.reset()
    window.history.replaceState(null, '', START)
    window.location.reload()
  }

  const button = { py: 0, minHeight: 0, fontSize: 12 }
  return (
    <Box sx={{ bgcolor: tokens.brand[900], color: tokens.surface[0], py: 0.5, px: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="caption">{state.status === 'signedOut' ? t('demo.signedOut') : t('demo.banner')}</Typography>
        {state.status === 'signedOut'
          ? <Button size="small" variant="contained" color="inherit" onClick={() => void signIn('demo@counsel.test', 'demo')} sx={{ ...button, color: tokens.brand[900] }}>{t('demo.signIn')}</Button>
          : <Button size="small" variant="outlined" color="inherit" onClick={() => setOpen(true)} sx={button}>{t('demo.reset')}</Button>}
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{t('demo.resetTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('demo.resetBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('demo.keep')}</Button>
          <Button variant="contained" onClick={reset}>{t('demo.resetConfirm')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
