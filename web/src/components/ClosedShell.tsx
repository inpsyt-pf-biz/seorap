import { Box, Stack, ThemeProvider } from '@mui/material'
import type { ReactNode } from 'react'
import { closedTheme, tokens } from '../theme/seorap'
import BoxFloor from './BoxFloor'
import Wordmark from './Wordmark'

// 닫힌 서랍: 입장 화면(인증번호·비밀번호)을 감싸는 청록 바탕. "닫힌 서랍은 고요하게, 열린 서랍은 따뜻하게" (01-plan §0 10-29)
// 안에 들어간 버튼·글자·입력 칸은 closedTheme 을 따르고, 포커스 링은 호박빛이다
export default function ClosedShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={closedTheme}>
      <Box
        component="main" data-surface="closed"
        sx={{ minHeight: '100dvh', bgcolor: tokens.teal[700], color: tokens.surface.page, '--seorap-focus': tokens.focus.onTeal }}
      >
        <Box sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
          <Stack spacing={3}>
            <Wordmark onTeal />
            {children}
            <BoxFloor onTeal />
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
