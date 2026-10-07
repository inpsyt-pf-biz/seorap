import { Box, Stack, Typography } from '@mui/material'
import { tokens } from '../theme/seorap'

// M0 임시 화면. 진입·OTP·서랍 화면이 들어오면 지운다.
export default function Placeholder() {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}
    >
      <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 480, textAlign: 'center' }}>
        <Box component="img" src={tokens.logo.src} alt={tokens.logo.alt} sx={{ width: 160, height: 160 }} />
        <Typography variant="caption" color="text.secondary">
          인싸이트
        </Typography>
        <Typography variant="h4" sx={{ color: tokens.seorapAccent }}>
          서랍
        </Typography>
        <Typography variant="body1" color="text.secondary">
          서비스를 준비하고 있어요.
        </Typography>
      </Stack>
    </Box>
  )
}
