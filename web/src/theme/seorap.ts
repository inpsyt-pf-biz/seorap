import { createTheme } from '@mui/material/styles'

// 서랍 테마 토큰. 임시 브랜딩 단계라 색·로고는 이 파일에서만 바꾼다.
// 기준: Booth design-system (inpsytorderv3/design-system/02_DESIGN_TOKENS.md)
export const tokens = {
  // 인싸이트 브랜드 남색. 주요 버튼과 강조는 이 색
  brand: {
    900: '#1F2A6B',
    700: '#2B398F',
    500: '#4B5BB3',
    300: '#A9B2E0',
    100: '#E8EBF7',
  },
  // 서랍 포인트 컬러. 흰 배경 대비 약 3.6:1 → 로고·큰 제목·그림에만 (작은 글씨·흰 글씨 버튼 금지)
  seorapAccent: '#D4664B',
  seorapAccentSoft: '#FCC9A5',
  surface: {
    // 쪽 배경. 브랜드 남색을 옅게 푼 색이라 흰 카드·입력 칸이 배경 위에 떠 보인다
    page: '#EEF0F7',
    0: '#FFFFFF',
    50: '#F7F7F9',
    100: '#EEEEF2',
    200: '#DEDEE5',
    300: '#C4C4CF',
  },
  text: {
    primary: '#1B1B22',
    secondary: '#555566',
    disabled: '#8A8A99',
  },
  // 화면은 폰 한 칸짜리 주 컬럼 하나다 (PC 별도 배치 없음). 시트·토스트·페이지 폭은 모두 이 값을 따른다
  layout: { maxWidth: 480 },
  logo: {
    src: '/brand/seorap-logo-temp.png',
    alt: '인싸이트 서랍',
  },
} as const

export const theme = createTheme({
  palette: {
    primary: { main: tokens.brand[700], dark: tokens.brand[900], light: tokens.brand[500], contrastText: '#FFFFFF' },
    background: { default: tokens.surface.page, paper: tokens.surface[0] },
    text: { primary: tokens.text.primary, secondary: tokens.text.secondary, disabled: tokens.text.disabled },
    divider: tokens.surface[200],
  },
  typography: {
    fontFamily:
      '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
    // 본문 16 · 보조 14 · 캡션 12 (12 미만 금지)
    h4: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.35 },
    h5: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.4 },
    h6: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.5 },
    button: { fontSize: '1rem', fontWeight: 600, textTransform: 'none' },
  },
  shape: { borderRadius: 12 },
  components: {
    // 한글은 낱말 중간에서 줄을 바꾸지 않는다(keep-all). 띄어쓰기 없는 긴 주소·토큰은 넘치지 않게 아무 곳에서나 끊는다.
    MuiCssBaseline: {
      styleOverrides: { body: { wordBreak: 'keep-all', overflowWrap: 'anywhere' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44 } },
    },
    // 쪽 배경이 옅은 색이라 글자 입력 칸은 흰색으로 둔다
    MuiOutlinedInput: {
      styleOverrides: { root: { backgroundColor: tokens.surface[0] } },
    },
  },
})
