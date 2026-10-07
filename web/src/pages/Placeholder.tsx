import { Box, Stack, Typography } from '@mui/material'
import { useLocation } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

export default function Placeholder() {
  // 서랍에서 로그아웃하고 온 경우에는 준비 중 안내 대신 로그아웃 안내를 보인다
  const loggedOut = (useLocation().state as { loggedOut?: boolean } | null)?.loggedOut === true
  if (loggedOut) return <StatePage kind="loggedOut" />
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: tokens.layout.maxWidth, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{t('placeholder.preparing')}</Typography>
      </Stack>
    </Box>
  )
}
