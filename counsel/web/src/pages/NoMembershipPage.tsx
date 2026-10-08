import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import DemoBanner from '../components/DemoBanner'
import { useSession } from '../shell/session'

export default function NoMembershipPage() {
  const { signOut } = useSession()
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <DemoBanner />
      <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, pt: 10 }}>
        <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }}>
          <Stack spacing={2}>
            <Typography variant="h6">{t('noMembership.title')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('noMembership.body')}</Typography>
            <Button variant="outlined" onClick={() => void signOut()}>{t('auth.logout')}</Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}
