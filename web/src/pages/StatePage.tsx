import { Box, Stack, Typography } from '@mui/material'
import { type CopyKey, t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'

export type StateKind = 'notFound' | 'linkInvalid' | 'linkRevoked' | 'sessionExpired' | 'blocked' | 'error' | 'maintenance' | 'loggedOut'
const KEY: Record<StateKind, CopyKey> = {
  notFound: 'state.notFound', linkInvalid: 'state.linkInvalid', linkRevoked: 'state.linkRevoked',
  sessionExpired: 'state.sessionExpired', blocked: 'state.blocked', error: 'error.generic', maintenance: 'maintenance',
  loggedOut: 'state.loggedOut',
}

export default function StatePage({ kind }: { kind: StateKind }) {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: 480, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{t(KEY[kind])}</Typography>
      </Stack>
    </Box>
  )
}
