import { Box, Stack } from '@mui/material'
import type { ReactNode } from 'react'
import { tokens } from '../theme/seorap'
import BoxFloor from './BoxFloor'
import Wordmark from './Wordmark'

// 입장 화면(인증번호·비밀번호)의 틀. 서랍 안과 같은 종이 바탕에 같은 테마를 쓴다 (75:20:5, 10-30).
// 청록은 주 버튼과 워드마크에, 호박빛은 로고 손잡이에만 보인다
export default function EntryShell({ children }: { children: ReactNode }) {
  return (
    <Box component="main" sx={{ minHeight: 'var(--frame-min-h)' }}>
      <Box sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
        <Stack spacing={3}>
          <Wordmark />
          {children}
          <BoxFloor />
        </Stack>
      </Box>
    </Box>
  )
}
