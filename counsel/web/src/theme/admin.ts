import { createTheme } from '@mui/material/styles'
import { theme, tokens } from '@seorap-web/theme/seorap.ts'

// 서랍 테마를 그대로 쓰고, PC 폭 어드민에 필요한 것만 더한다. 색은 서랍 tokens 에서만 꺼낸다.
export const adminLayout = { contentMaxWidth: 1200, navWidth: 220 } as const

export const adminTheme = createTheme(theme, {
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: { root: { backgroundColor: tokens.surface[0], borderBottom: `1px solid ${tokens.surface[200]}` } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: tokens.text.secondary, backgroundColor: tokens.surface[50], whiteSpace: 'nowrap' },
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: `1px solid ${tokens.surface[200]}` } } },
  },
})

export { tokens }
