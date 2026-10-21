import { Box, Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { tokens } from '../theme/seorap'

// 기본 주소 시연용 첫 화면 (10-21). 실제 서랍 기능은 feat/plan-a에 있고, 이 화면은 서버를 부르지 않는다.
export default function Placeholder() {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 4 }}
    >
      <Stack spacing={3} sx={{ alignItems: 'center', width: '100%', maxWidth: tokens.layout.maxWidth, textAlign: 'center' }}>
        <Box component="img" src={tokens.logo.src} alt={tokens.logo.alt} sx={{ width: 120, height: 120 }} />
        <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            인싸이트
          </Typography>
          <Typography variant="h4" sx={{ color: tokens.seorapAccent }}>
            서랍
          </Typography>
        </Stack>
        <Typography variant="body1">
          네이버 스토어에서 구매한 심리검사를 받고,
          <br />
          가족에게 바로 전달할 수 있어요.
        </Typography>
        <Button component={RouterLink} to="/verify" variant="contained" size="large" fullWidth>
          스토어 구매자 인증하기
        </Button>
        <Typography variant="caption" color="text.secondary">
          구매 후 알림톡으로 받은 링크로 들어오면 인증 화면이 바로 열려요.
        </Typography>
      </Stack>
    </Box>
  )
}
