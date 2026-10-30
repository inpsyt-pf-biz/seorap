import { createTheme } from '@mui/material/styles'
import { theme, tokens } from '@seorap-web/theme/seorap.ts'
import type { Specialty } from '@counsel-core/centers.ts'

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

// 전문 분야 태그 색. 연한 바탕 + 진한 글자(대비 4.5:1 이상). 서랍 종이 바탕에 맞춘 낮은 채도 (75:20:5, 10-30)
// 발달·정서·가족은 서랍 칩 색(청록·호박·적갈)을 그대로 쓰고, 청소년·학습만 같은 채도의 회청·올리브를 더한다
export const specialtyColors: Record<Specialty, { bg: string; fg: string }> = {
  development: tokens.tone.teal,
  emotion: tokens.tone.warm,
  youth: { bg: '#E1E6EC', fg: '#34495E' },
  learning: { bg: '#E7EAD8', fg: '#4A5A1F' },
  family: tokens.tone.caution,
}

// 협력센터 목록의 생김새. 기관 아이콘은 옅은 청록 바탕에 청록 아이콘(그라데이션 없음, 10-30)
export const centerListLook = {
  avatarBg: tokens.teal[100],
  avatarFg: tokens.teal[700],
  countColor: tokens.brand[500],
  rowBorder: tokens.surface[100],
} as const

// 지도 위 표시(네이버 지도에 HTML 로 얹는 것이라 MUI 테마 밖에서 그린다)
export const mapLook = {
  bubbleBg: tokens.brand[700],
  bubbleFg: tokens.surface[0],
  pinFill: tokens.brand[500],
  pinBorder: tokens.surface[0],
  shadow: '0 2px 6px rgba(27, 27, 34, 0.25)',
  mapHeight: 560,
  pickerHeight: 280,
  detailHeight: 220,
} as const

export { tokens }
