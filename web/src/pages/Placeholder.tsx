import { Box, Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import Wordmark from '../components/Wordmark'

// 기본 주소 시연용 첫 화면 (10-21). 실제 서랍 기능은 feat/plan-a에 있고, 이 화면은 서버를 부르지 않는다.
// 색·로고는 서랍 앱과 같다 (75:20:5, 10-30): 종이 바탕, 청록 버튼·워드마크, 호박빛 로고 손잡이
export default function Placeholder() {
  return (
    <Box
      component="main"
      sx={{ minHeight: 'var(--frame-min-h)', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 4 }}
    >
      <Stack spacing={3} sx={{ alignItems: 'center', width: '100%', textAlign: 'center' }}>
        <Wordmark size="lg" />
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
