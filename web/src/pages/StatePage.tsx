import { Box, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { type CopyKey, t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'
import { tokens } from '../theme/seorap'

export type StateKind = 'notFound' | 'linkInvalid' | 'linkRevoked' | 'sessionExpired' | 'blocked' | 'error' | 'maintenance' | 'loggedOut'
const KEY: Record<StateKind, CopyKey> = {
  notFound: 'state.notFound', linkInvalid: 'state.linkInvalid', linkRevoked: 'state.linkRevoked',
  sessionExpired: 'state.sessionExpired', blocked: 'state.blocked', error: 'error.generic', maintenance: 'maintenance',
  loggedOut: 'state.loggedOut',
}

// message 를 주면 kind 의 기본 문장 대신 보인다 (받는 분 링크의 막힌 사유처럼 화면마다 다른 문장)
// 막힌 화면에서 갈 곳은 도움말 하나 (build-spec §4-8)
export default function StatePage({ kind, message }: { kind: StateKind; message?: string }) {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: tokens.layout.maxWidth, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{message ?? t(KEY[kind])}</Typography>
        <Link component={RouterLink} to="/help" variant="body2">{t('help.title')}</Link>
      </Stack>
    </Box>
  )
}
