import { createTheme } from '@mui/material/styles'
import { theme, tokens } from '@seorap-web/theme/seorap.ts'
import type { Specialty } from '@counsel-core/centers.ts'

// 서랍 테마를 그대로 쓰고, PC 폭 어드민에 필요한 것만 더한다. 색은 서랍 tokens 에서만 꺼낸다.
export const adminLayout = { contentMaxWidth: 1200, navWidth: 220 } as const

// 어드민 바탕 (10-30 건우님 검수: "메뉴마다 바탕과 요소 사이 구분이 없다").
// 서랍 고객 화면의 옅은 종이 바탕(surface.page)은 흰 판과 거의 같아 표·카드·입력 칸이 묻힌다.
// 어드민은 바탕을 한 단계 짙게(surface[100]) 깔고, 판·입력 칸은 흰색에 바탕보다 진한 테두리(surface[300])를 둔다
const ADMIN_BG = tokens.surface[100]
const EDGE = tokens.surface[300]

// 본문 판 (10-30 건우님 검수: "그릇 없이 밥 먹는 것 같다"). 모든 메뉴의 제목·요약·검색 칸·표를 흰 판 하나에 담고,
// 바닥(ADMIN_BG)은 판 바깥으로만 보이게 한다. 판 안의 표·카드는 같은 흰색에 테두리로 나뉜다
export const adminSheet = {
  bgcolor: tokens.surface[0] as string,
  border: `1px solid ${EDGE}`,
  borderRadius: tokens.radius.sheet,
  boxShadow: `0 1px 3px ${tokens.desk.shadow}`,
  p: { xs: 2, md: 3 },
}

export const adminTheme = createTheme(theme, {
  palette: { background: { default: ADMIN_BG, paper: tokens.surface[0] } },
  components: {
    MuiCssBaseline: {
      styleOverrides: { html: { backgroundColor: ADMIN_BG }, '@media (min-width: 520px)': { html: { backgroundColor: ADMIN_BG } } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: { root: { backgroundColor: tokens.surface[0], borderBottom: `1px solid ${EDGE}` } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: tokens.text.secondary, backgroundColor: tokens.surface[50], whiteSpace: 'nowrap' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${EDGE}`, boxShadow: `0 1px 2px ${tokens.desk.edge}` } },
    },
    // 검색·거르기 칸은 바탕 위에 바로 놓이므로 흰색으로 띄운다(서랍 화면은 옅은 종이색)
    MuiOutlinedInput: {
      styleOverrides: { root: { backgroundColor: tokens.surface[0] } },
    },
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
