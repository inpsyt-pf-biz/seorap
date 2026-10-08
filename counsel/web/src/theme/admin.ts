import { createTheme } from '@mui/material/styles'
import { theme, tokens } from '@seorap-web/theme/seorap.ts'
import type { Category } from '@counsel-core/centers.ts'

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

// 카테고리 태그 색. 연한 바탕 + 진한 글자(대비 4.5:1 이상).
export const categoryColors: Record<Category, { bg: string; fg: string }> = {
  development: { bg: '#EEF0FF', fg: '#4338CA' },
  emotion: { bg: '#FFF4E0', fg: '#8A5A00' },
  youth: { bg: '#E6F4FB', fg: '#0B6E99' },
  learning: { bg: '#E6F6EC', fg: '#1E7A44' },
  family: { bg: '#FDEBF2', fg: '#B0306A' },
}

// 협력센터 목록의 생김새. 기관 아이콘은 서랍 남색을 옅은 쪽에서 진한 쪽으로 흐르게 칠한다.
export const centerListLook = {
  avatarBg: `linear-gradient(135deg, ${tokens.brand[300]} 0%, ${tokens.brand[500]} 100%)`,
  avatarFg: tokens.surface[0],
  countColor: tokens.brand[500],
  rowBorder: tokens.surface[100],
} as const

export { tokens }
