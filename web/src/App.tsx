import { Box } from '@mui/material'
import { Route, Routes } from 'react-router-dom'
import Placeholder from './pages/Placeholder'
import VerifyDemo from './pages/VerifyDemo'
import { tokens } from './theme/seorap'

// 기본 주소 시연용 (10-21): 첫 화면과 구매자 인증 화면만. 서버를 부르지 않는다
// 서랍 앱(feat/plan-a)과 같은 판: 휴대폰에서는 화면을 채우는 종이색, 넓은 화면에서는 책상색 바깥 위의 한 장 (75:20:5, 10-30)
export default function App() {
  return (
    <Box
      sx={{
        '--frame-min-h': '100dvh',
        maxWidth: tokens.layout.maxWidth, mx: 'auto', minHeight: 'var(--frame-min-h)', bgcolor: tokens.surface.page,
        '@media (min-width: 520px)': {
          boxShadow: `0 0 0 1px ${tokens.desk.edge}, 0 12px 40px ${tokens.desk.shadow}`,
          '--frame-min-h': 'calc(100dvh - 48px)',
          my: 3, borderRadius: tokens.radius.sheet, overflow: 'hidden',
        },
      }}
    >
      <Routes>
        <Route path="/verify" element={<VerifyDemo />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </Box>
  )
}
