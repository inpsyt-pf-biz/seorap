import { Box, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'

export default function Placeholder() {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: 480, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{t('placeholder.preparing')}</Typography>
      </Stack>
    </Box>
  )
}
